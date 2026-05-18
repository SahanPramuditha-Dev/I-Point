import json
import logging
from fastapi import APIRouter, Depends, HTTPException
from fastapi import Request
from sqlalchemy.orm import Session
from app.database import get_db
from app.auth import get_current_user
from app.models import AppSetting, Customer, ReturnRecord, Sale, SaleItem, InventoryItem, StockMovement, WarrantyRecord
from app.schemas import SaleIn, SaleReturnIn
from app.services.warranty_service import (
    create_sale_warranty_records,
    ensure_warranty_defaults,
    resolve_sale_item_warranty_days,
)
from app.services.return_service import (
    RETURN_STATUS_REFUNDED,
    create_return_record as create_return_record_entry,
    get_returned_qty_for_sale_item,
    process_return_record as process_return_record_entry,
)

router = APIRouter(prefix="/pos", tags=["pos"])
logger = logging.getLogger("istore.api")


@router.get('/print-profile')
def get_pos_print_profile(db: Session = Depends(get_db), _=Depends(get_current_user)):
    row = db.query(AppSetting).filter(AppSetting.key == "print_profile").first()
    if not row or not row.value:
        return {}
    try:
        payload = json.loads(row.value)
    except json.JSONDecodeError:
        return {}
    return payload if isinstance(payload, dict) else {}


@router.get('/sales')
def sales(db: Session = Depends(get_db), _=Depends(get_current_user)):
    rows = db.query(Sale).order_by(Sale.created_at.desc()).limit(50).all()
    return [
        {
            "id": s.id,
            "invoice_no": f"INV-{s.id:05d}",
            "customer_id": s.customer_id,
            "subtotal": s.subtotal,
            "discount_amount": s.discount_amount,
            "tax_amount": s.tax_amount,
            "total": s.total,
            "is_return": s.is_return,
            "original_sale_id": s.original_sale_id,
            "payment_method": s.payment_method,
            "paid": s.paid,
            "is_voided": s.is_voided,
            "void_reason": s.void_reason,
            "created_at": s.created_at.isoformat()
        } for s in rows
    ]

@router.get('/sales/{sale_id}')
def get_sale(sale_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    sale = db.query(Sale).filter(Sale.id == sale_id).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    
    items = db.query(SaleItem).filter(SaleItem.sale_id == sale_id).all()
    # Join with inventory to get names
    res_items = []
    for si in items:
        inv = db.query(InventoryItem).filter(InventoryItem.id == si.item_id).first()
        sold_qty = max(0, int(si.quantity or 0))
        already_returned_qty = get_returned_qty_for_sale_item(db, si.id)
        res_items.append({
            "sale_item_id": si.id,
            "item_id": si.item_id,
            "name": inv.name if inv else "Unknown Item",
            "quantity": si.quantity,
            "price": si.price,
            "warranty_days": si.warranty_days,
            "already_returned_qty": already_returned_qty,
            "returnable_qty": max(0, sold_qty - already_returned_qty),
        })
        
    customer = None
    if sale.customer_id:
        customer = db.query(Customer).filter(Customer.id == sale.customer_id).first()

    warranties = (
        db.query(WarrantyRecord)
        .filter(WarrantyRecord.invoice_id == sale.id)
        .order_by(WarrantyRecord.created_at.asc())
        .all()
    )

    warranty_payload = [
        {
            "warranty_id": row.warranty_code,
            "item_name": row.product_or_service_name,
            "warranty_type": row.warranty_type,
            "warranty_days": row.warranty_days,
            "start_date": row.start_date.isoformat() if row.start_date else None,
            "end_date": row.end_date.isoformat() if row.end_date else None,
            "status": row.status,
            "serial_number": row.serial_number,
        }
        for row in warranties
    ]
    return_rows = (
        db.query(ReturnRecord)
        .filter(ReturnRecord.original_sale_id == sale.id)
        .order_by(ReturnRecord.created_at.desc())
        .all()
    )
    return_payload = [
        {
            "return_id": row.return_code,
            "return_type": row.return_type,
            "product_name": row.product_name,
            "quantity": row.quantity,
            "status": row.decision_status,
            "refund_amount": row.refund_amount,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
        for row in return_rows
    ]

    return {
        "id": sale.id,
        "invoice_no": f"INV-{sale.id:05d}",
        "customer_id": sale.customer_id,
        "customer_name": customer.name if customer else "Walk-in",
        "customer_phone": customer.phone if customer else None,
        "subtotal": sale.subtotal,
        "discount_amount": sale.discount_amount,
        "tax_amount": sale.tax_amount,
        "total": sale.total,
        "is_return": sale.is_return,
        "original_sale_id": sale.original_sale_id,
        "payment_method": sale.payment_method,
        "cash_amount": sale.cash_amount,
        "card_amount": sale.card_amount,
        "paid": sale.paid,
        "is_voided": sale.is_voided,
        "void_reason": sale.void_reason,
        "created_at": sale.created_at.isoformat(),
        "lines": res_items,
        "warranty_records": warranty_payload,
        "return_history": return_payload,
    }
@router.post('/checkout')
def checkout(payload: SaleIn, request: Request, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    ensure_warranty_defaults(db)
    subtotal = sum(l.quantity * l.price for l in payload.lines)
    total = subtotal - payload.discount_amount + payload.tax_amount
    sale = Sale(
        customer_id=payload.customer_id,
        payment_method=payload.payment_method,
        cash_amount=payload.cash_amount if hasattr(payload, 'cash_amount') else total,
        card_amount=payload.card_amount if hasattr(payload, 'card_amount') else 0,
        paid=payload.paid,
        subtotal=subtotal,
        discount_amount=payload.discount_amount,
        tax_amount=payload.tax_amount,
        total=total
    )
    db.add(sale)
    db.flush()
    customer = None
    if payload.customer_id:
        customer = db.query(Customer).filter(Customer.id == payload.customer_id).first()

    receipt_lines = []
    sale_item_rows: list[SaleItem] = []
    for line in payload.lines:
        item = db.query(InventoryItem).filter(InventoryItem.id == line.item_id).first()
        if not item or item.quantity < line.quantity:
            raise HTTPException(status_code=400, detail=f"Insufficient stock for item {line.item_id}")
        item.quantity -= line.quantity
        resolved_warranty_days = resolve_sale_item_warranty_days(db, item, line.warranty_days)
        sale_item_row = SaleItem(
            sale_id=sale.id, 
            item_id=line.item_id, 
            quantity=line.quantity, 
            price=line.price, 
            cost_price=item.cost_price,
            warranty_days=resolved_warranty_days,
            serial_number=line.serial_number
        )
        db.add(sale_item_row)
        db.flush()
        sale_item_rows.append(sale_item_row)

        if line.serial_number:
            from app.models import InventorySerial
            serial_row = db.query(InventorySerial).filter(
                InventorySerial.item_id == item.id,
                InventorySerial.serial_number == line.serial_number,
                InventorySerial.status == "available"
            ).first()
            if serial_row:
                serial_row.status = "sold"
                serial_row.sale_id = sale.id
        db.add(StockMovement(
            item_id=item.id,
            user_id=current_user.id if current_user else None,
            movement_type="SALE",
            quantity=-line.quantity,
            reference_type="sale",
            reference_id=sale.id,
            note=f"Invoice INV-{sale.id:05d}"
        ))
        receipt_lines.append({
            "item_id": item.id,
            "item_name": item.name,
            "qty": line.quantity,
            "unit_price": line.price,
            "line_total": line.quantity * line.price,
            "warranty_days": resolved_warranty_days,
            "serial_number": line.serial_number,
        })
    created_warranties = create_sale_warranty_records(
        db=db,
        sale=sale,
        sale_items=sale_item_rows,
        customer=customer,
        created_by_id=current_user.id if current_user else None,
    )
    db.commit()
    logger.info(json.dumps({
        "event": "sale_checkout",
        "request_id": getattr(request.state, "request_id", None),
        "sale_id": sale.id,
        "total": total,
        "line_count": len(payload.lines),
        "payment_method": sale.payment_method,
    }))
    return {
        "sale_id": sale.id,
        "invoice_no": f"INV-{sale.id:05d}",
        "subtotal": subtotal,
        "discount_amount": payload.discount_amount,
        "tax_amount": payload.tax_amount,
        "total": total,
        "payment_method": sale.payment_method,
        "lines": receipt_lines,
        "warranty_records": [
            {
                "warranty_id": row.warranty_code,
                "item_name": row.product_or_service_name,
                "warranty_type": row.warranty_type,
                "warranty_days": row.warranty_days,
                "start_date": row.start_date.isoformat() if row.start_date else None,
                "end_date": row.end_date.isoformat() if row.end_date else None,
                "status": row.status,
            }
            for row in created_warranties
        ],
        "customer_name": customer.name if customer else "Walk-in",
        "customer_phone": customer.phone if customer else None,
    }

@router.post('/return')
def return_sale(payload: SaleReturnIn, request: Request, db: Session = Depends(get_db), _=Depends(get_current_user)):
    original = db.query(Sale).filter(Sale.id == payload.sale_id).first()
    if not original:
        raise HTTPException(status_code=404, detail="Original sale not found")
    subtotal = sum(l.quantity * l.price for l in payload.lines)
    return_sale_row = Sale(
        customer_id=original.customer_id,
        payment_method=original.payment_method,
        paid=True,
        subtotal=-subtotal,
        discount_amount=0,
        tax_amount=0,
        total=-subtotal,
        is_return=True,
        original_sale_id=original.id
    )
    db.add(return_sale_row)
    db.flush()
    processed_returns = []
    for line in payload.lines:
        item = db.query(InventoryItem).filter(InventoryItem.id == line.item_id).first()
        if not item:
            raise HTTPException(status_code=404, detail=f"Item {line.item_id} not found")

        original_sale_items = (
            db.query(SaleItem)
            .filter(
                SaleItem.sale_id == original.id,
                SaleItem.item_id == line.item_id,
                SaleItem.quantity > 0,
            )
            .order_by(SaleItem.id.asc())
            .all()
        )
        selected_sale_item = None
        needed_qty = int(line.quantity or 0)
        for sale_item in original_sale_items:
            sold_qty = max(0, int(sale_item.quantity or 0))
            already_returned_qty = get_returned_qty_for_sale_item(db, sale_item.id)
            remaining_qty = sold_qty - already_returned_qty
            if remaining_qty >= needed_qty:
                selected_sale_item = sale_item
                break
        if not selected_sale_item:
            raise HTTPException(
                status_code=400,
                detail=f"Duplicate return prevented. Returnable quantity exceeded for item {line.item_id}",
            )

        record = create_return_record_entry(
            db=db,
            original_sale_id=original.id,
            original_sale_item_id=selected_sale_item.id,
            quantity=needed_qty,
            return_type="Refund",
            return_reason="Customer changed mind",
            item_condition="Reusable",
            inspection_note=payload.note or "POS quick refund flow",
            staff_user_id=_.id if _ else None,
        )
        process_return_record_entry(
            db=db,
            record=record,
            decision_status=RETURN_STATUS_REFUNDED,
            actor_user_id=_.id if _ else None,
            refund_amount=round(abs(float(line.price or 0)) * needed_qty, 2),
            refund_method=original.payment_method if original.payment_method in {"Cash", "Card", "Bank Transfer"} else "Cash",
            process_note=payload.note or f"Quick POS refund for INV-{original.id:05d}",
        )
        processed_returns.append({
            "return_id": record.return_code,
            "product_name": record.product_name,
            "quantity": record.quantity,
            "refund_amount": record.refund_amount,
            "refund_method": record.refund_method,
            "status": record.decision_status,
        })
        db.add(
            StockMovement(
                item_id=line.item_id,
                user_id=_.id if _ else None,
                movement_type="RETURN",
                quantity=int(line.quantity or 0),
                reference_type="sale_return",
                reference_id=return_sale_row.id,
                note=payload.note or f"POS quick refund for INV-{original.id:05d}",
            )
        )
        db.add(SaleItem(sale_id=return_sale_row.id, item_id=line.item_id, quantity=-line.quantity, price=line.price))
    db.commit()
    logger.info(json.dumps({
        "event": "sale_return",
        "request_id": getattr(request.state, "request_id", None),
        "original_sale_id": original.id,
        "return_sale_id": return_sale_row.id,
        "line_count": len(payload.lines),
    }))
    return {
        "ok": True,
        "return_sale_id": return_sale_row.id,
        "invoice_no": f"INV-{return_sale_row.id:05d}",
        "return_records": processed_returns,
    }

@router.post('/sales/{sale_id}/void')
def void_sale(sale_id: int, reason: str, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    from app.services.activity_service import log_activity
    sale = db.query(Sale).filter(Sale.id == sale_id).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    if sale.is_voided:
        raise HTTPException(status_code=400, detail="Sale is already voided")
    
    # Reverse inventory
    items = db.query(SaleItem).filter(SaleItem.sale_id == sale_id).all()
    for si in items:
        inv = db.query(InventoryItem).filter(InventoryItem.id == si.item_id).first()
        if inv:
            inv.quantity += si.quantity
            db.add(StockMovement(
                item_id=inv.id,
                user_id=current_user.id if current_user else None,
                movement_type="VOID_RETURN",
                quantity=si.quantity,
                reference_type="sale_void",
                reference_id=sale.id,
                note=f"Voided INV-{sale.id:05d}"
            ))
    
    sale.is_voided = True
    sale.void_reason = reason
    
    log_activity(
        db, current_user.id, "Void", "Sale", sale.id,
        f"Voided Invoice INV-{sale.id:05d}. Reason: {reason}",
        is_reversible=False
    )
    
    db.commit()
    return {"ok": True}
