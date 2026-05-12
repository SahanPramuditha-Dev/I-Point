import json
import logging
from fastapi import APIRouter, Depends, HTTPException
from fastapi import Request
from sqlalchemy.orm import Session
from app.database import get_db
from app.auth import get_current_user
from app.models import Sale, SaleItem, InventoryItem, StockMovement
from app.schemas import SaleIn, SaleReturnIn

router = APIRouter(prefix="/pos", tags=["pos"])
logger = logging.getLogger("istore.api")

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
        res_items.append({
            "item_id": si.item_id,
            "name": inv.name if inv else "Unknown Item",
            "quantity": si.quantity,
            "price": si.price,
            "warranty_days": si.warranty_days
        })
        
    return {
        "id": sale.id,
        "invoice_no": f"INV-{sale.id:05d}",
        "customer_id": sale.customer_id,
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
        "lines": res_items
    }
@router.post('/checkout')
def checkout(payload: SaleIn, request: Request, db: Session = Depends(get_db), _=Depends(get_current_user)):
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
    receipt_lines = []
    for line in payload.lines:
        item = db.query(InventoryItem).filter(InventoryItem.id == line.item_id).first()
        if not item or item.quantity < line.quantity:
            raise HTTPException(status_code=400, detail=f"Insufficient stock for item {line.item_id}")
        item.quantity -= line.quantity
        db.add(SaleItem(
            sale_id=sale.id, 
            item_id=line.item_id, 
            quantity=line.quantity, 
            price=line.price, 
            cost_price=item.cost_price,
            warranty_days=line.warranty_days,
            serial_number=line.serial_number
        ))

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
            "line_total": line.quantity * line.price
        })
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
        "lines": receipt_lines
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
    for line in payload.lines:
        item = db.query(InventoryItem).filter(InventoryItem.id == line.item_id).first()
        if not item:
            raise HTTPException(status_code=404, detail=f"Item {line.item_id} not found")
        item.quantity += line.quantity
        db.add(SaleItem(sale_id=return_sale_row.id, item_id=line.item_id, quantity=-line.quantity, price=line.price))
        db.add(StockMovement(
            item_id=item.id,
            movement_type="RETURN",
            quantity=line.quantity,
            reference_type="sale_return",
            reference_id=return_sale_row.id,
            note=payload.note or f"Return for INV-{original.id:05d}"
        ))
    db.commit()
    logger.info(json.dumps({
        "event": "sale_return",
        "request_id": getattr(request.state, "request_id", None),
        "original_sale_id": original.id,
        "return_sale_id": return_sale_row.id,
        "line_count": len(payload.lines),
    }))
    return {"ok": True, "return_sale_id": return_sale_row.id, "invoice_no": f"INV-{return_sale_row.id:05d}"}

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
