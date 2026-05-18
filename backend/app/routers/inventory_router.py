from datetime import datetime, timedelta
import re
from pathlib import Path
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session, joinedload
from sqlalchemy.exc import OperationalError
from app.database import get_db
from app.auth import get_current_user
from sqlalchemy import func
from app.models import (
    InventoryItem,
    Supplier,
    StockMovement,
    InventorySerial,
    ProductCategory,
    Brand,
    GoodsReceivedNote,
    GoodsReceivedNoteItem,
    PriceAdjustmentLog,
    ProductDiscount,
    StockTakeSession,
    StockTakeLine,
    SupplierLedgerEntry,
    PurchaseOrder,
    PurchaseOrderItem,
    RepairPartUsage,
    Sale,
    SaleItem,
    Customer,
    WarrantyRecord,
    ReturnRecord,
)
from app.schemas import (
    InventoryIn,
    SupplierIn,
    StockAdjustIn,
    CategoryIn,
    BrandIn,
    GrnIn,
    PriceAdjustmentIn,
    DiscountIn,
    StockTakeIn,
    StockTakeLineIn,
    SupplierPaymentIn,
    SupplierNoteIn,
)

router = APIRouter(prefix="/inventory", tags=["inventory"])

UPLOAD_DIR = Path(__file__).resolve().parents[2] / "uploads" / "inventory"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def _normalize_barcode(value: str | None) -> str:
    raw = (value or "").strip().upper()
    return re.sub(r"[^A-Z0-9\-._:/]", "", raw)


def _validated_barcode(value: str | None, fallback_seed: str | None = None) -> str:
    barcode = _normalize_barcode(value) or _normalize_barcode(fallback_seed)
    if not barcode:
        raise HTTPException(status_code=400, detail="Barcode is required")
    if not re.match(r"^[A-Z0-9\-._:/]{3,64}$", barcode):
        raise HTTPException(status_code=400, detail="Invalid barcode format")
    return barcode


def _iso(value):
    return value.isoformat() if value else None


def _ledger_signed(entry: SupplierLedgerEntry) -> float:
    direction = str(entry.direction or "").lower()
    amount = float(entry.amount or 0)
    if direction == "debit":
        return amount
    if direction == "credit":
        return -amount
    return 0.0


def _margin_pct(sale_price: float | int | None, cost_price: float | int | None) -> float | None:
    sale = float(sale_price or 0)
    cost = float(cost_price or 0)
    if sale <= 0:
        return None
    return round(((sale - cost) / sale) * 100, 2)


@router.post("/upload-image")
def upload_inventory_image(file: UploadFile = File(...), _=Depends(get_current_user)):
    allowed = {".png", ".jpg", ".jpeg", ".webp"}
    ext = Path(file.filename or "").suffix.lower()
    if ext not in allowed:
        raise HTTPException(status_code=400, detail="Only PNG/JPG/JPEG/WEBP files are allowed")

    filename = f"{uuid4().hex}{ext}"
    target = UPLOAD_DIR / filename
    data = file.file.read()
    if len(data) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Max image size is 5MB")
    target.write_bytes(data)
    return {"url": f"/uploads/inventory/{filename}"}

@router.get('')
def list_inventory(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(InventoryItem).all()

@router.post('')
def create_inventory(payload: InventoryIn, db: Session = Depends(get_db), _=Depends(get_current_user)):
    data = payload.model_dump()
    data["barcode"] = _validated_barcode(payload.barcode, payload.sku)
    duplicate = db.query(InventoryItem).filter(InventoryItem.barcode == data["barcode"]).first()
    if duplicate:
        raise HTTPException(status_code=400, detail=f"Duplicate barcode detected: {data['barcode']}")
    item = InventoryItem(**data)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item

@router.put('/{item_id}')
def update_inventory(item_id: int, payload: InventoryIn, db: Session = Depends(get_db), _=Depends(get_current_user)):
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    update_data = payload.model_dump()
    update_data["barcode"] = _validated_barcode(payload.barcode, payload.sku)
    duplicate = (
        db.query(InventoryItem)
        .filter(InventoryItem.barcode == update_data["barcode"], InventoryItem.id != item_id)
        .first()
    )
    if duplicate:
        raise HTTPException(status_code=400, detail=f"Duplicate barcode detected: {update_data['barcode']}")
    for k, v in update_data.items():
        setattr(item, k, v)
    db.commit()
    db.refresh(item)
    return item

@router.delete('/{item_id}')
def delete_inventory(item_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    db.delete(item)
    db.commit()
    return {"ok": True}

@router.get('/suppliers')
def suppliers(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(Supplier).all()

@router.post('/suppliers')
def create_supplier(payload: SupplierIn, db: Session = Depends(get_db), _=Depends(get_current_user)):
    s = Supplier(**payload.model_dump())
    db.add(s)
    db.commit()
    db.refresh(s)
    return s

@router.put('/suppliers/{supplier_id}')
def update_supplier(supplier_id: int, payload: SupplierIn, db: Session = Depends(get_db), _=Depends(get_current_user)):
    s = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Supplier not found")
    s.name = payload.name
    s.contact = payload.contact
    s.email = payload.email
    s.address = payload.address
    s.notes = payload.notes
    s.payment_terms_days = payload.payment_terms_days
    s.opening_balance = payload.opening_balance
    db.commit()
    db.refresh(s)
    return s

@router.delete('/suppliers/{supplier_id}')
def delete_supplier(supplier_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    s = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Supplier not found")
    db.delete(s)
    db.commit()
    return {"ok": True}


@router.get('/suppliers/{supplier_id}/account')
def supplier_account(supplier_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")

    ledger_rows = (
        db.query(SupplierLedgerEntry)
        .options(joinedload(SupplierLedgerEntry.created_by))
        .filter(SupplierLedgerEntry.supplier_id == supplier_id)
        .order_by(SupplierLedgerEntry.created_at.desc())
        .limit(400)
        .all()
    )
    po_rows = (
        db.query(PurchaseOrder)
        .options(joinedload(PurchaseOrder.items))
        .filter(PurchaseOrder.supplier_id == supplier_id)
        .order_by(PurchaseOrder.created_at.desc())
        .limit(250)
        .all()
    )
    grn_rows = (
        db.query(GoodsReceivedNote)
        .options(joinedload(GoodsReceivedNote.lines))
        .filter(GoodsReceivedNote.supplier_id == supplier_id)
        .order_by(GoodsReceivedNote.created_at.desc())
        .limit(250)
        .all()
    )

    total_debits = sum(float(r.amount or 0) for r in ledger_rows if str(r.direction or "").lower() == "debit")
    total_credits = sum(float(r.amount or 0) for r in ledger_rows if str(r.direction or "").lower() == "credit")
    ledger_grn_refs = {
        int(r.reference_id)
        for r in ledger_rows
        if str(r.direction or "").lower() == "debit" and str(r.reference_type or "").lower() == "grn" and r.reference_id
    }
    imputed_grn_debits = 0.0
    for row in grn_rows:
        if int(row.id or 0) in ledger_grn_refs:
            continue
        row_total = sum(max(0, int(line.quantity or 0) - int(line.damaged_qty or 0)) * float(line.unit_cost or 0) for line in (row.lines or []))
        imputed_grn_debits += float(row_total or 0)
    effective_debits = total_debits + imputed_grn_debits
    opening_balance = float(supplier.opening_balance or 0)
    outstanding_balance = opening_balance + effective_debits - total_credits
    total_po_value = sum(float(r.total_cost or 0) for r in po_rows)
    total_received_po_value = sum(float(r.total_cost or 0) for r in po_rows if str(r.status or "").lower() == "received")

    return {
        "supplier": {
            "id": supplier.id,
            "name": supplier.name,
            "contact": supplier.contact,
            "email": supplier.email,
            "address": supplier.address,
            "notes": supplier.notes,
            "payment_terms_days": int(supplier.payment_terms_days or 0),
            "opening_balance": opening_balance,
        },
        "summary": {
            "opening_balance": opening_balance,
            "total_debits": round(effective_debits, 2),
            "ledger_debits_only": round(total_debits, 2),
            "imputed_grn_debits": round(imputed_grn_debits, 2),
            "total_credits": round(total_credits, 2),
            "outstanding_balance": round(outstanding_balance, 2),
            "po_count": len(po_rows),
            "grn_count": len(grn_rows),
            "po_total_value": round(total_po_value, 2),
            "received_po_total_value": round(total_received_po_value, 2),
        },
        "purchase_orders": [
            {
                "id": row.id,
                "po_number": row.po_number,
                "status": row.status,
                "total_cost": float(row.total_cost or 0),
                "created_at": _iso(row.created_at),
                "received_at": _iso(row.received_at),
                "line_count": len(row.items or []),
            }
            for row in po_rows
        ],
        "grns": [
            {
                "id": row.id,
                "grn_no": row.grn_no,
                "po_id": row.po_id,
                "invoice_no": row.invoice_no,
                "note": row.note,
                "created_at": _iso(row.created_at),
                "line_count": len(row.lines or []),
                "grn_total": round(
                    sum(max(0, int(line.quantity or 0) - int(line.damaged_qty or 0)) * float(line.unit_cost or 0) for line in (row.lines or [])),
                    2,
                ),
            }
            for row in grn_rows
        ],
        "ledger_entries": [
            {
                "id": row.id,
                "entry_type": row.entry_type,
                "direction": row.direction,
                "amount": float(row.amount or 0),
                "signed_amount": round(_ledger_signed(row), 2),
                "reference_type": row.reference_type,
                "reference_id": row.reference_id,
                "note": row.note,
                "created_at": _iso(row.created_at),
                "created_by_user_id": row.created_by_user_id,
                "created_by_name": row.created_by.full_name if row.created_by else None,
            }
            for row in ledger_rows
        ],
    }


@router.post('/suppliers/{supplier_id}/payments')
def supplier_payment(
    supplier_id: int,
    payload: SupplierPaymentIn,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    amount = float(payload.amount or 0)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Payment amount must be greater than zero")
    row = SupplierLedgerEntry(
        supplier_id=supplier_id,
        entry_type="payment",
        direction="credit",
        amount=amount,
        reference_type="manual_payment",
        note=(payload.note or "").strip() or "Supplier payment recorded",
        created_by_user_id=current_user.id if current_user else None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {
        "ok": True,
        "entry": {
            "id": row.id,
            "entry_type": row.entry_type,
            "direction": row.direction,
            "amount": float(row.amount or 0),
            "reference_type": row.reference_type,
            "reference_id": row.reference_id,
            "note": row.note,
            "created_at": _iso(row.created_at),
        },
    }


@router.post('/suppliers/{supplier_id}/notes')
def supplier_note(
    supplier_id: int,
    payload: SupplierNoteIn,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    supplier = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    note = (payload.note or "").strip()
    if len(note) < 2:
        raise HTTPException(status_code=400, detail="Note is too short")
    row = SupplierLedgerEntry(
        supplier_id=supplier_id,
        entry_type="note",
        direction="memo",
        amount=0,
        reference_type="supplier_note",
        note=note,
        created_by_user_id=current_user.id if current_user else None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {
        "ok": True,
        "entry": {
            "id": row.id,
            "entry_type": row.entry_type,
            "direction": row.direction,
            "amount": float(row.amount or 0),
            "note": row.note,
            "created_at": _iso(row.created_at),
        },
    }

@router.post('/adjust')
def adjust_stock(payload: StockAdjustIn, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    from app.services.activity_service import log_activity
    item = db.query(InventoryItem).filter(InventoryItem.id == payload.item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    if not payload.note or len(payload.note.strip()) < 5:
        raise HTTPException(status_code=400, detail="A descriptive reason (min 5 chars) is mandatory for stock adjustments")

    old_qty = item.quantity
    new_qty = old_qty + payload.quantity_change
    
    if new_qty < 0:
        raise HTTPException(status_code=400, detail="Stock level cannot be negative")

    item.quantity = new_qty
    db.add(StockMovement(
        item_id=item.id,
        user_id=current_user.id if current_user else None,
        movement_type="ADJUSTMENT",
        quantity=payload.quantity_change,
        note=payload.note
    ))
    
    log_activity(
        db, current_user.id, "Adjustment", "InventoryItem", item.id,
        f"Stock adjusted by {payload.quantity_change}. Reason: {payload.note}",
        {"quantity": old_qty}, {"quantity": new_qty},
        is_reversible=True
    )
    
    db.commit()
    return {"ok": True, "new_quantity": item.quantity}

@router.get('/movements')
def movements(db: Session = Depends(get_db), _=Depends(get_current_user)):
    rows = db.query(StockMovement).order_by(StockMovement.created_at.desc()).limit(200).all()
    return [{
        "id": m.id,
        "item_id": m.item_id,
        "user_id": m.user_id,
        "item_name": m.item.name if m.item else "",
        "movement_type": m.movement_type,
        "quantity": m.quantity,
        "reference_type": m.reference_type,
        "reference_id": m.reference_id,
        "note": m.note,
        "created_at": m.created_at.isoformat()
    } for m in rows]


@router.get('/reports/analytics')
def inventory_reports_analytics(
    dead_days: int = 90,
    period_days: int = 90,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    dead_days = max(1, min(int(dead_days or 90), 3650))
    period_days = max(1, min(int(period_days or 90), 3650))
    now = datetime.utcnow()
    dead_cutoff = now - timedelta(days=dead_days)
    period_cutoff = now - timedelta(days=period_days)
    try:
        items = db.query(InventoryItem).all()
        outbound_last_rows = (
            db.query(StockMovement.item_id, func.max(StockMovement.created_at))
            .filter(StockMovement.movement_type.in_(["SALE", "REPAIR_CONSUME", "OUT"]))
            .group_by(StockMovement.item_id)
            .all()
        )
        outbound_last_map = {int(item_id): last_dt for item_id, last_dt in outbound_last_rows if item_id}
        dead_rows = []
        for item in items:
            qty = int(item.quantity or 0)
            if qty <= 0:
                continue
            last_outbound = outbound_last_map.get(int(item.id))
            if last_outbound and last_outbound >= dead_cutoff:
                continue
            stock_value = round(qty * float(item.cost_price or 0), 2)
            dead_rows.append(
                {
                    "item_id": item.id,
                    "sku": item.sku,
                    "name": item.name,
                    "category": item.category,
                    "brand": item.brand,
                    "quantity": qty,
                    "cost_price": float(item.cost_price or 0),
                    "sale_price": float(item.sale_price or 0),
                    "stock_value": stock_value,
                    "last_outbound_at": _iso(last_outbound),
                    "days_since_outbound": (now.date() - last_outbound.date()).days if last_outbound else None,
                }
            )
        dead_rows.sort(key=lambda row: row["stock_value"], reverse=True)
        dead_total_value = round(sum(float(row["stock_value"] or 0) for row in dead_rows), 2)

        supplier_rows = db.query(Supplier).order_by(Supplier.name.asc()).all()
        po_period_rows = (
            db.query(
                PurchaseOrder.supplier_id,
                func.count(PurchaseOrder.id),
                func.coalesce(func.sum(PurchaseOrder.total_cost), 0),
                func.max(PurchaseOrder.created_at),
            )
            .filter(PurchaseOrder.created_at >= period_cutoff)
            .group_by(PurchaseOrder.supplier_id)
            .all()
        )
        po_period_map = {
            int(supplier_id): {
                "po_count": int(po_count or 0),
                "po_value": float(po_value or 0),
                "last_po_at": last_po_at,
            }
            for supplier_id, po_count, po_value, last_po_at in po_period_rows
            if supplier_id
        }
        grn_net_value_expr = (
            (func.coalesce(GoodsReceivedNoteItem.quantity, 0) - func.coalesce(GoodsReceivedNoteItem.damaged_qty, 0))
            * func.coalesce(GoodsReceivedNoteItem.unit_cost, 0)
        )
        grn_period_rows = (
            db.query(
                GoodsReceivedNote.supplier_id,
                func.count(func.distinct(GoodsReceivedNote.id)),
                func.coalesce(func.sum(grn_net_value_expr), 0),
                func.max(GoodsReceivedNote.created_at),
            )
            .outerjoin(GoodsReceivedNoteItem, GoodsReceivedNoteItem.grn_id == GoodsReceivedNote.id)
            .filter(GoodsReceivedNote.created_at >= period_cutoff)
            .group_by(GoodsReceivedNote.supplier_id)
            .all()
        )
        grn_period_map = {
            int(supplier_id): {
                "grn_count": int(grn_count or 0),
                "received_value": float(received_value or 0),
                "last_grn_at": last_grn_at,
            }
            for supplier_id, grn_count, received_value, last_grn_at in grn_period_rows
            if supplier_id
        }
        ledger_rows = db.query(
            SupplierLedgerEntry.supplier_id,
            SupplierLedgerEntry.direction,
            SupplierLedgerEntry.amount,
        ).all()
        ledger_balance_map: dict[int, float] = {}
        for supplier_id, direction, amount in ledger_rows:
            if not supplier_id:
                continue
            signed = 0.0
            normalized = str(direction or "").lower()
            if normalized == "debit":
                signed = float(amount or 0)
            elif normalized == "credit":
                signed = -float(amount or 0)
            ledger_balance_map[int(supplier_id)] = ledger_balance_map.get(int(supplier_id), 0.0) + signed

        supplier_purchase_rows = []
        for supplier in supplier_rows:
            po_period = po_period_map.get(int(supplier.id), {"po_count": 0, "po_value": 0.0, "last_po_at": None})
            grn_period = grn_period_map.get(int(supplier.id), {"grn_count": 0, "received_value": 0.0, "last_grn_at": None})
            last_purchase_at = grn_period["last_grn_at"] or po_period["last_po_at"]
            outstanding_balance = round(float(supplier.opening_balance or 0) + float(ledger_balance_map.get(int(supplier.id), 0.0)), 2)
            supplier_purchase_rows.append(
                {
                    "supplier_id": supplier.id,
                    "supplier_name": supplier.name,
                    "period_po_count": int(po_period["po_count"]),
                    "period_po_value": round(float(po_period["po_value"] or 0), 2),
                    "period_grn_count": int(grn_period["grn_count"]),
                    "period_received_value": round(float(grn_period["received_value"] or 0), 2),
                    "last_purchase_at": _iso(last_purchase_at),
                    "outstanding_balance": outstanding_balance,
                }
            )
        supplier_purchase_rows.sort(key=lambda row: row["period_received_value"], reverse=True)
        period_supplier_received_total = round(
            sum(float(row["period_received_value"] or 0) for row in supplier_purchase_rows),
            2,
        )

        repair_usage_rows = (
            db.query(
                RepairPartUsage.item_id,
                InventoryItem.name,
                InventoryItem.sku,
                func.sum(RepairPartUsage.quantity),
                func.coalesce(func.sum(RepairPartUsage.quantity * RepairPartUsage.unit_cost), 0),
                func.count(RepairPartUsage.id),
                func.max(RepairPartUsage.created_at),
            )
            .join(InventoryItem, InventoryItem.id == RepairPartUsage.item_id)
            .filter(RepairPartUsage.created_at >= period_cutoff)
            .group_by(RepairPartUsage.item_id, InventoryItem.name, InventoryItem.sku)
            .order_by(func.sum(RepairPartUsage.quantity).desc())
            .limit(120)
            .all()
        )
        repair_part_rows = [
            {
                "item_id": int(item_id),
                "item_name": item_name,
                "sku": sku,
                "quantity_used": int(quantity_used or 0),
                "usage_value": round(float(usage_value or 0), 2),
                "usage_events": int(usage_events or 0),
                "last_used_at": _iso(last_used_at),
            }
            for item_id, item_name, sku, quantity_used, usage_value, usage_events, last_used_at in repair_usage_rows
            if item_id
        ]
        repair_total_qty = int(sum(int(row["quantity_used"] or 0) for row in repair_part_rows))
        repair_total_value = round(sum(float(row["usage_value"] or 0) for row in repair_part_rows), 2)

        return {
            "generated_at": _iso(now),
            "dead_stock": {
                "days_threshold": dead_days,
                "summary": {
                    "item_count": len(dead_rows),
                    "total_value": dead_total_value,
                },
                "rows": dead_rows[:200],
            },
            "supplier_purchases": {
                "period_days": period_days,
                "summary": {
                    "supplier_count": len(supplier_purchase_rows),
                    "period_received_total": period_supplier_received_total,
                },
                "rows": supplier_purchase_rows[:200],
            },
            "repair_parts_usage": {
                "period_days": period_days,
                "summary": {
                    "line_count": len(repair_part_rows),
                    "total_quantity_used": repair_total_qty,
                    "total_usage_value": repair_total_value,
                },
                "rows": repair_part_rows,
            },
        }
    except OperationalError:
        return {
            "generated_at": _iso(now),
            "dead_stock": {"days_threshold": dead_days, "summary": {"item_count": 0, "total_value": 0}, "rows": []},
            "supplier_purchases": {"period_days": period_days, "summary": {"supplier_count": 0, "period_received_total": 0}, "rows": []},
            "repair_parts_usage": {"period_days": period_days, "summary": {"line_count": 0, "total_quantity_used": 0, "total_usage_value": 0}, "rows": []},
        }

@router.get('/meta')
def inventory_meta(db: Session = Depends(get_db), _=Depends(get_current_user)):
    brands = [r[0] for r in db.query(InventoryItem.brand).filter(InventoryItem.brand.isnot(None), InventoryItem.brand != "").distinct().all()]
    categories = [r[0] for r in db.query(InventoryItem.category).filter(InventoryItem.category.isnot(None), InventoryItem.category != "").distinct().all()]
    return {"brands": brands, "categories": categories}

@router.get('/variants')
def variants(db: Session = Depends(get_db), _=Depends(get_current_user)):
    rows = (
        db.query(
            InventoryItem.brand,
            InventoryItem.model,
            InventoryItem.storage,
            InventoryItem.color,
            InventoryItem.condition,
            InventoryItem.category,
            func.sum(InventoryItem.quantity).label("qty"),
            func.count(InventoryItem.id).label("products"),
            func.avg(InventoryItem.sale_price).label("avg_sale"),
        )
        .group_by(
            InventoryItem.brand,
            InventoryItem.model,
            InventoryItem.storage,
            InventoryItem.color,
            InventoryItem.condition,
            InventoryItem.category,
        )
        .order_by(func.sum(InventoryItem.quantity).desc())
        .all()
    )
    return [
        {
            "brand": r.brand,
            "model": r.model,
            "storage": r.storage,
            "color": r.color,
            "condition": r.condition,
            "category": r.category,
            "quantity": int(r.qty or 0),
            "product_count": int(r.products or 0),
            "avg_sale_price": float(r.avg_sale or 0),
        }
        for r in rows
    ]

@router.get('/serials/search')
def search_serials(query: str = "", db: Session = Depends(get_db), _=Depends(get_current_user)):
    q = (query or "").strip()
    if not q:
        rows = db.query(InventorySerial).order_by(InventorySerial.created_at.desc()).limit(100).all()
    else:
        like = f"%{q}%"
        rows = (
            db.query(InventorySerial)
            .join(InventoryItem, InventoryItem.id == InventorySerial.item_id)
            .filter(
                (InventorySerial.serial_number.ilike(like)) |
                (InventoryItem.sku.ilike(like)) |
                (InventoryItem.name.ilike(like))
            )
            .order_by(InventorySerial.created_at.desc())
            .limit(200)
            .all()
        )
    return [
        {
            "id": s.id,
            "item_id": s.item_id,
            "item_name": s.item.name if s.item else "",
            "sku": s.item.sku if s.item else "",
            "serial_number": s.serial_number,
            "status": s.status,
            "sale_id": s.sale_id,
            "created_at": s.created_at.isoformat() if s.created_at else None,
        }
        for s in rows
    ]


@router.get('/serials/{serial_id}/detail')
def serial_detail(serial_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    serial = (
        db.query(InventorySerial)
        .options(joinedload(InventorySerial.item))
        .filter(InventorySerial.id == serial_id)
        .first()
    )
    if not serial:
        raise HTTPException(status_code=404, detail="Serial record not found")

    serial_text = str(serial.serial_number or "")
    sale_rows = (
        db.query(SaleItem, Sale, Customer)
        .join(Sale, Sale.id == SaleItem.sale_id)
        .outerjoin(Customer, Customer.id == Sale.customer_id)
        .filter(SaleItem.serial_number == serial_text)
        .order_by(Sale.created_at.desc())
        .all()
    )
    warranty_rows = (
        db.query(WarrantyRecord)
        .filter(
            (WarrantyRecord.serial_number == serial_text)
            | (WarrantyRecord.imei_or_serial == serial_text)
        )
        .order_by(WarrantyRecord.created_at.desc())
        .all()
    )
    return_rows = (
        db.query(ReturnRecord)
        .filter(ReturnRecord.serial_number == serial_text)
        .order_by(ReturnRecord.created_at.desc())
        .all()
    )
    movement_rows = (
        db.query(StockMovement)
        .filter(StockMovement.item_id == serial.item_id)
        .order_by(StockMovement.created_at.desc())
        .limit(120)
        .all()
    )

    return {
        "serial": {
            "id": serial.id,
            "item_id": serial.item_id,
            "item_name": serial.item.name if serial.item else None,
            "sku": serial.item.sku if serial.item else None,
            "serial_number": serial.serial_number,
            "status": serial.status,
            "sale_id": serial.sale_id,
            "created_at": _iso(serial.created_at),
        },
        "sales_history": [
            {
                "sale_id": sale.id,
                "invoice_no": f"INV-{sale.id:05d}",
                "customer_id": sale.customer_id,
                "customer_name": customer.name if customer else "Walk-in",
                "customer_phone": customer.phone if customer else None,
                "quantity": int(line.quantity or 0),
                "unit_price": float(line.price or 0),
                "total": round(float(line.price or 0) * int(line.quantity or 0), 2),
                "is_return": bool(sale.is_return),
                "payment_method": sale.payment_method,
                "created_at": _iso(sale.created_at),
            }
            for line, sale, customer in sale_rows
        ],
        "warranty_links": [
            {
                "warranty_id": row.id,
                "warranty_code": row.warranty_code,
                "invoice_id": row.invoice_id,
                "status": row.status,
                "warranty_type": row.warranty_type,
                "customer_name": row.customer_name,
                "start_date": _iso(row.start_date),
                "end_date": _iso(row.end_date),
                "created_at": _iso(row.created_at),
            }
            for row in warranty_rows
        ],
        "return_history": [
            {
                "id": row.id,
                "return_code": row.return_code,
                "return_type": row.return_type,
                "decision_status": row.decision_status,
                "quantity": int(row.quantity or 0),
                "refund_amount": float(row.refund_amount or 0),
                "created_at": _iso(row.created_at),
            }
            for row in return_rows
        ],
        "stock_movements": [
            {
                "id": row.id,
                "movement_type": row.movement_type,
                "quantity": int(row.quantity or 0),
                "reference_type": row.reference_type,
                "reference_id": row.reference_id,
                "note": row.note,
                "created_at": _iso(row.created_at),
            }
            for row in movement_rows
        ],
    }
@router.get('/{item_id}/serials')
def list_serials(item_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    from app.models import InventorySerial
    return db.query(InventorySerial).filter(InventorySerial.item_id == item_id).all()

@router.post('/{item_id}/serials')
def add_serial(item_id: int, serial_number: str, db: Session = Depends(get_db), _=Depends(get_current_user)):
    from app.models import InventorySerial, InventoryItem
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item: raise HTTPException(404, "Item not found")
    
    existing = db.query(InventorySerial).filter(InventorySerial.serial_number == serial_number).first()
    if existing: raise HTTPException(400, "Serial number already exists")
    
    s = InventorySerial(item_id=item_id, serial_number=serial_number)
    db.add(s)
    # Increment quantity if it was added manually? 
    # Usually serial addition should be part of a stock IN, but for simplicity here we just add it.
    item.quantity += 1
    db.commit()
    db.refresh(s)
    return s

@router.delete('/serials/{serial_id}')
def delete_serial(serial_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    from app.models import InventorySerial, InventoryItem
    s = db.query(InventorySerial).filter(InventorySerial.id == serial_id).first()
    if not s: raise HTTPException(404, "Serial not found")
    item = db.query(InventoryItem).filter(InventoryItem.id == s.item_id).first()
    if item: item.quantity = max(0, item.quantity - 1)
    db.delete(s)
    db.commit()
    return {"ok": True}


@router.get('/categories')
def list_categories(db: Session = Depends(get_db), _=Depends(get_current_user)):
    rows = db.query(ProductCategory).order_by(ProductCategory.name.asc()).all()
    counts = dict(
        db.query(func.lower(InventoryItem.category), func.count(InventoryItem.id))
        .filter(InventoryItem.category.isnot(None), InventoryItem.category != "")
        .group_by(func.lower(InventoryItem.category))
        .all()
    )
    return [
        {
            "id": row.id,
            "name": row.name,
            "icon_url": row.icon_url,
            # Keep backward compatibility for older clients using `icon`.
            "icon": row.icon_url,
            "parent_id": row.parent_id,
            "is_active": row.is_active,
            "product_count": int(counts.get((row.name or "").strip().lower(), 0)),
        }
        for row in rows
    ]


@router.post('/categories')
def create_category(payload: CategoryIn, db: Session = Depends(get_db), _=Depends(get_current_user)):
    row = ProductCategory(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put('/categories/{category_id}')
def update_category(category_id: int, payload: CategoryIn, db: Session = Depends(get_db), _=Depends(get_current_user)):
    row = db.query(ProductCategory).filter(ProductCategory.id == category_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Category not found")
    for k, v in payload.model_dump().items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


@router.delete('/categories/{category_id}')
def delete_category(category_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    row = db.query(ProductCategory).filter(ProductCategory.id == category_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Category not found")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.get('/brands')
def list_brands(db: Session = Depends(get_db), _=Depends(get_current_user)):
    rows = db.query(Brand).order_by(Brand.name.asc()).all()
    counts = dict(
        db.query(func.lower(InventoryItem.brand), func.count(InventoryItem.id))
        .filter(InventoryItem.brand.isnot(None), InventoryItem.brand != "")
        .group_by(func.lower(InventoryItem.brand))
        .all()
    )
    return [
        {
            "id": row.id,
            "name": row.name,
            "logo_url": row.logo_url,
            "is_active": row.is_active,
            "product_count": int(counts.get((row.name or "").strip().lower(), 0)),
        }
        for row in rows
    ]


@router.post('/brands')
def create_brand(payload: BrandIn, db: Session = Depends(get_db), _=Depends(get_current_user)):
    row = Brand(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.put('/brands/{brand_id}')
def update_brand(brand_id: int, payload: BrandIn, db: Session = Depends(get_db), _=Depends(get_current_user)):
    row = db.query(Brand).filter(Brand.id == brand_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Brand not found")
    for k, v in payload.model_dump().items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return row


@router.delete('/brands/{brand_id}')
def delete_brand(brand_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    row = db.query(Brand).filter(Brand.id == brand_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Brand not found")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.get('/grn')
def list_grn(db: Session = Depends(get_db), _=Depends(get_current_user)):
    try:
        rows = db.query(GoodsReceivedNote).order_by(GoodsReceivedNote.created_at.desc()).limit(100).all()
    except OperationalError:
        # Older local DB without GRN tables: return empty until startup table sync runs.
        return []
    return [
        {
            "id": r.id,
            "grn_no": r.grn_no,
            "supplier_id": r.supplier_id,
            "supplier_name": r.supplier.name if r.supplier else "",
            "po_id": r.po_id,
            "po_number": r.po.po_number if r.po else None,
            "invoice_no": r.invoice_no,
            "note": r.note,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        } for r in rows
    ]


@router.post('/grn')
def create_grn(payload: GrnIn, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    supplier = db.query(Supplier).filter(Supplier.id == payload.supplier_id).first()
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    linked_po = None
    if payload.po_id:
        linked_po = db.query(PurchaseOrder).filter(PurchaseOrder.id == payload.po_id).first()
        if not linked_po:
            raise HTTPException(status_code=404, detail="Purchase order not found")
        if int(linked_po.supplier_id or 0) != int(payload.supplier_id):
            raise HTTPException(status_code=400, detail="PO supplier mismatch")
        existing = db.query(GoodsReceivedNote).filter(GoodsReceivedNote.po_id == linked_po.id).first()
        if existing:
            raise HTTPException(status_code=400, detail="PO already linked to an existing GRN")

    ts = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    grn = GoodsReceivedNote(
        grn_no=f"GRN-{ts}",
        supplier_id=payload.supplier_id,
        po_id=payload.po_id,
        invoice_no=payload.invoice_no,
        note=payload.note
    )
    db.add(grn)
    db.flush()
    grn_total = 0.0
    for line in payload.lines:
        item = db.query(InventoryItem).filter(InventoryItem.id == line.item_id).first()
        if not item:
            raise HTTPException(status_code=404, detail=f"Item not found: {line.item_id}")
        net_received = max(0, int(line.quantity) - int(line.damaged_qty or 0))
        line_cost = float(line.unit_cost or 0)
        item.quantity += net_received
        if line_cost > 0:
            item.cost_price = line_cost
        db.add(GoodsReceivedNoteItem(
            grn_id=grn.id,
            item_id=item.id,
            quantity=line.quantity,
            damaged_qty=line.damaged_qty,
            unit_cost=line_cost,
        ))
        db.add(StockMovement(
            item_id=item.id,
            user_id=current_user.id if current_user else None,
            movement_type="IN",
            quantity=net_received,
            reference_type="grn",
            reference_id=grn.id,
            note=f"GRN {grn.grn_no} invoice {payload.invoice_no or '-'}"
        ))
        grn_total += float(net_received) * line_cost
    if linked_po:
        linked_po.status = "Received"
        linked_po.received_at = datetime.utcnow()
    db.add(
        SupplierLedgerEntry(
            supplier_id=supplier.id,
            entry_type="purchase",
            direction="debit",
            amount=round(grn_total, 2),
            reference_type="grn",
            reference_id=grn.id,
            note=f"GRN {grn.grn_no}" + (f" linked to {linked_po.po_number}" if linked_po else ""),
            created_by_user_id=current_user.id if current_user else None,
        )
    )
    db.commit()
    return {
        "ok": True,
        "grn_id": grn.id,
        "grn_no": grn.grn_no,
        "po_id": grn.po_id,
        "grn_total": round(grn_total, 2),
    }


@router.get('/discounts')
def list_discounts(db: Session = Depends(get_db), _=Depends(get_current_user)):
    try:
        rows = db.query(ProductDiscount).order_by(ProductDiscount.id.desc()).limit(200).all()
    except OperationalError:
        # Older local DB without discount table: return empty until startup table sync runs.
        return []
    return [{
        "id": d.id,
        "item_id": d.item_id,
        "item_name": d.item.name if d.item else "",
        "discount_type": d.discount_type,
        "value": d.value,
        "start_date": d.start_date.isoformat() if d.start_date else None,
        "end_date": d.end_date.isoformat() if d.end_date else None,
        "is_active": d.is_active,
        "note": d.note,
    } for d in rows]


@router.post('/discounts')
def create_discount(payload: DiscountIn, db: Session = Depends(get_db), _=Depends(get_current_user)):
    row = ProductDiscount(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.get('/price-adjustments')
def list_price_adjustments(db: Session = Depends(get_db), _=Depends(get_current_user)):
    try:
        rows = db.query(PriceAdjustmentLog).order_by(PriceAdjustmentLog.created_at.desc()).limit(200).all()
    except OperationalError:
        # Older local DB without price adjustment table: return empty until startup table sync runs.
        return []
    return [{
        "id": r.id,
        "item_id": r.item_id,
        "item_name": r.item.name if r.item else "",
        "old_cost_price": r.old_cost_price,
        "old_sale_price": r.old_sale_price,
        "new_cost_price": r.new_cost_price,
        "new_sale_price": r.new_sale_price,
        "old_margin_amount": round(float(r.old_sale_price or 0) - float(r.old_cost_price or 0), 2),
        "new_margin_amount": round(float(r.new_sale_price or 0) - float(r.new_cost_price or 0), 2),
        "old_margin_pct": _margin_pct(r.old_sale_price, r.old_cost_price),
        "new_margin_pct": _margin_pct(r.new_sale_price, r.new_cost_price),
        "reason": r.reason,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    } for r in rows]


@router.post('/price-adjustments')
def create_price_adjustment(payload: PriceAdjustmentIn, db: Session = Depends(get_db), _=Depends(get_current_user)):
    target = str(payload.target or "both").strip().lower()
    if target not in {"both", "sale", "cost"}:
        raise HTTPException(status_code=400, detail="Invalid target. Use one of: both, sale, cost")
    mode = str(payload.mode or "absolute").strip().lower()
    if mode not in {"absolute", "percentage"}:
        raise HTTPException(status_code=400, detail="Invalid mode. Use one of: absolute, percentage")

    target_item_ids: list[int] = []
    if payload.item_id is not None:
        target_item_ids.append(int(payload.item_id))
    if payload.item_ids:
        for raw_id in payload.item_ids:
            numeric_id = int(raw_id)
            if numeric_id not in target_item_ids:
                target_item_ids.append(numeric_id)
    if not target_item_ids:
        raise HTTPException(status_code=400, detail="At least one item id is required")

    if mode == "percentage":
        if payload.percent_change is None:
            raise HTTPException(status_code=400, detail="percent_change is required for percentage mode")
        percent_change = float(payload.percent_change)
    else:
        percent_change = 0.0
        if target in {"both", "cost"} and payload.new_cost_price is None:
            raise HTTPException(status_code=400, detail="new_cost_price is required for the selected target")
        if target in {"both", "sale"} and payload.new_sale_price is None:
            raise HTTPException(status_code=400, detail="new_sale_price is required for the selected target")

    items = db.query(InventoryItem).filter(InventoryItem.id.in_(target_item_ids)).all()
    found_ids = {int(item.id) for item in items}
    missing_ids = [item_id for item_id in target_item_ids if item_id not in found_ids]
    if missing_ids:
        raise HTTPException(status_code=404, detail=f"Item not found: {missing_ids[0]}")

    factor = 1.0 + (percent_change / 100.0)
    reason_text = (payload.reason or "").strip()
    created_rows = []
    for item in items:
        old_cost = float(item.cost_price or 0)
        old_sale = float(item.sale_price or 0)

        if mode == "percentage":
            new_cost = old_cost
            new_sale = old_sale
            if target in {"both", "cost"}:
                new_cost = max(0.0, round(old_cost * factor, 4))
            if target in {"both", "sale"}:
                new_sale = max(0.0, round(old_sale * factor, 4))
        else:
            new_cost = old_cost if target == "sale" else max(0.0, float(payload.new_cost_price or 0))
            new_sale = old_sale if target == "cost" else max(0.0, float(payload.new_sale_price or 0))

        row = PriceAdjustmentLog(
            item_id=item.id,
            old_cost_price=old_cost,
            old_sale_price=old_sale,
            new_cost_price=new_cost,
            new_sale_price=new_sale,
            reason=reason_text,
        )
        item.cost_price = new_cost
        item.sale_price = new_sale
        db.add(row)
        db.flush()
        created_rows.append(
            {
                "id": row.id,
                "item_id": item.id,
                "item_name": item.name,
                "old_cost_price": old_cost,
                "old_sale_price": old_sale,
                "new_cost_price": new_cost,
                "new_sale_price": new_sale,
                "old_margin_amount": round(old_sale - old_cost, 2),
                "new_margin_amount": round(new_sale - new_cost, 2),
                "old_margin_pct": _margin_pct(old_sale, old_cost),
                "new_margin_pct": _margin_pct(new_sale, new_cost),
                "reason": reason_text,
                "created_at": _iso(row.created_at),
            }
        )

    db.commit()
    created_rows.sort(key=lambda row: row["id"], reverse=True)
    return {
        "ok": True,
        "updated_count": len(created_rows),
        "mode": mode,
        "target": target,
        "adjustments": created_rows,
    }


@router.get('/stock-takes')
def list_stock_takes(db: Session = Depends(get_db), _=Depends(get_current_user)):
    try:
        rows = db.query(StockTakeSession).order_by(StockTakeSession.created_at.desc()).limit(100).all()
    except OperationalError:
        # Older local DB without stock-take tables: return empty until startup table sync runs.
        return []
    session_ids = [r.id for r in rows]
    line_counts = {}
    net_variance = {}
    if session_ids:
        line_counts = dict(
            db.query(StockTakeLine.session_id, func.count(StockTakeLine.id))
            .filter(StockTakeLine.session_id.in_(session_ids))
            .group_by(StockTakeLine.session_id)
            .all()
        )
        net_variance = dict(
            db.query(StockTakeLine.session_id, func.sum(StockTakeLine.difference))
            .filter(StockTakeLine.session_id.in_(session_ids))
            .group_by(StockTakeLine.session_id)
            .all()
        )
    return [{
        "id": r.id,
        "name": r.name,
        "note": r.note,
        "status": r.status,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "closed_at": r.closed_at.isoformat() if r.closed_at else None,
        "line_count": int(line_counts.get(r.id, 0)),
        "net_variance_units": int(net_variance.get(r.id, 0) or 0),
    } for r in rows]


@router.post('/stock-takes')
def create_stock_take(payload: StockTakeIn, db: Session = Depends(get_db), _=Depends(get_current_user)):
    row = StockTakeSession(name=payload.name, note=payload.note, status="Open")
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.post('/stock-takes/{session_id}/lines')
def submit_stock_take_line(session_id: int, payload: StockTakeLineIn, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    session = db.query(StockTakeSession).filter(StockTakeSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Stock take session not found")
    if str(session.status or "").lower() != "open":
        raise HTTPException(status_code=400, detail="Session is already closed")
    item = db.query(InventoryItem).filter(InventoryItem.id == payload.item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    existing = (
        db.query(StockTakeLine)
        .filter(StockTakeLine.session_id == session_id, StockTakeLine.item_id == item.id)
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="This item already has a submitted count in this session")
    diff = int(payload.physical_qty) - int(item.quantity or 0)
    line = StockTakeLine(
        session_id=session_id,
        item_id=item.id,
        system_qty=item.quantity,
        physical_qty=payload.physical_qty,
        difference=diff,
    )
    item.quantity = payload.physical_qty
    db.add(line)
    db.add(StockMovement(
        item_id=item.id,
        user_id=current_user.id if current_user else None,
        movement_type="ADJUSTMENT",
        quantity=diff,
        reference_type="stock_take",
        reference_id=session_id,
        note=f"Stock take {session.name}"
    ))
    db.commit()
    return {"ok": True, "difference": diff}


@router.get('/stock-takes/{session_id}')
def stock_take_detail(session_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    session = db.query(StockTakeSession).filter(StockTakeSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Stock take session not found")
    lines = (
        db.query(StockTakeLine)
        .options(joinedload(StockTakeLine.item))
        .filter(StockTakeLine.session_id == session_id)
        .order_by(StockTakeLine.id.asc())
        .all()
    )
    variance_increase = sum(int(l.difference or 0) for l in lines if int(l.difference or 0) > 0)
    variance_decrease = sum(abs(int(l.difference or 0)) for l in lines if int(l.difference or 0) < 0)
    zero_variance_count = sum(1 for l in lines if int(l.difference or 0) == 0)
    return {
        "session": {
            "id": session.id,
            "name": session.name,
            "note": session.note,
            "status": session.status,
            "created_at": _iso(session.created_at),
            "closed_at": _iso(session.closed_at),
        },
        "summary": {
            "line_count": len(lines),
            "variance_increase_units": int(variance_increase),
            "variance_decrease_units": int(variance_decrease),
            "net_variance_units": int(variance_increase - variance_decrease),
            "balanced_lines": int(zero_variance_count),
        },
        "lines": [
            {
                "id": line.id,
                "item_id": line.item_id,
                "item_name": line.item.name if line.item else f"Item #{line.item_id}",
                "sku": line.item.sku if line.item else None,
                "system_qty": int(line.system_qty or 0),
                "physical_qty": int(line.physical_qty or 0),
                "difference": int(line.difference or 0),
            }
            for line in lines
        ],
    }


@router.post('/stock-takes/{session_id}/close')
def close_stock_take(session_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    session = db.query(StockTakeSession).filter(StockTakeSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Stock take session not found")
    if str(session.status or "").lower() == "closed":
        return {"ok": True, "already_closed": True, "closed_at": _iso(session.closed_at)}
    session.status = "Closed"
    session.closed_at = datetime.utcnow()
    db.commit()
    return {"ok": True, "status": session.status, "closed_at": _iso(session.closed_at)}
