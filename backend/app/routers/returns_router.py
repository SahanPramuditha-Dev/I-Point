from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user
from app.database import get_db
from app.models import (
    DamagedStockLog,
    InventoryItem,
    ReturnRecord,
    Sale,
    SaleItem,
)
from app.schemas import ReturnRecordCreateIn, ReturnRecordProcessIn
from app.services.return_service import (
    RETURN_STATUS_APPROVED,
    RETURN_STATUS_CLOSED,
    RETURN_STATUS_EXCHANGED,
    RETURN_STATUS_PENDING,
    RETURN_STATUS_REFUNDED,
    RETURN_STATUS_REJECTED,
    VALID_REFUND_METHODS,
    VALID_RETURN_REASONS,
    VALID_RETURN_STATUSES,
    VALID_RETURN_TYPES,
    build_return_receipt_payload,
    create_return_record,
    get_returned_qty_for_sale_item,
    parse_invoice_id,
    process_return_record,
)

router = APIRouter(prefix="/returns", tags=["returns"])


def _parse_date(value: str | None, end_exclusive: bool = False) -> datetime | None:
    if not value:
        return None
    dt = datetime.fromisoformat(value)
    if end_exclusive:
        dt = dt + timedelta(days=1)
    return dt


def _serialize_return_record(row: ReturnRecord) -> dict:
    return {
        "id": row.id,
        "return_id": row.return_code,
        "return_type": row.return_type,
        "original_invoice_id": row.original_sale_id,
        "invoice_no": f"INV-{row.original_sale_id:05d}" if row.original_sale_id else None,
        "original_sale_item_id": row.original_sale_item_id,
        "customer_id": row.customer_id,
        "customer_name": row.customer_name,
        "customer_phone": row.customer_phone,
        "product_name": row.product_name,
        "sku_barcode": row.sku_barcode,
        "serial_number": row.serial_number,
        "item_id": row.item_id,
        "quantity": row.quantity,
        "return_reason": row.return_reason,
        "item_condition": row.item_condition,
        "inspection_note": row.inspection_note,
        "staff_member": (
            row.staff_user.full_name or row.staff_user.username
            if row.staff_user
            else None
        ),
        "approved_by": (
            row.approved_by.full_name or row.approved_by.username
            if row.approved_by
            else None
        ),
        "refund_approved_by": (
            row.refund_approved_by.full_name or row.refund_approved_by.username
            if row.refund_approved_by
            else None
        ),
        "decision_status": row.decision_status,
        "refund_amount": float(row.refund_amount or 0),
        "refund_method": row.refund_method,
        "replacement_item_id": row.replacement_item_id,
        "replacement_item_name": row.replacement_item_name,
        "replacement_quantity": row.replacement_quantity,
        "inventory_applied": bool(row.inventory_applied),
        "payment_applied": bool(row.payment_applied),
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        "closed_at": row.closed_at.isoformat() if row.closed_at else None,
    }


def _query_return_records(
    db: Session,
    *,
    q: str | None = None,
    decision_status: str | None = None,
    return_type: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
):
    query = db.query(ReturnRecord).options(
        joinedload(ReturnRecord.staff_user),
        joinedload(ReturnRecord.approved_by),
        joinedload(ReturnRecord.refund_approved_by),
        joinedload(ReturnRecord.sale_item),
        joinedload(ReturnRecord.replacement_item),
    )
    if decision_status and decision_status.lower() != "all":
        query = query.filter(ReturnRecord.decision_status == decision_status)
    if return_type and return_type.lower() != "all":
        query = query.filter(ReturnRecord.return_type == return_type)
    start = _parse_date(date_from)
    end = _parse_date(date_to, end_exclusive=True)
    if start:
        query = query.filter(ReturnRecord.created_at >= start)
    if end:
        query = query.filter(ReturnRecord.created_at < end)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            or_(
                ReturnRecord.return_code.ilike(like),
                ReturnRecord.customer_name.ilike(like),
                ReturnRecord.customer_phone.ilike(like),
                ReturnRecord.product_name.ilike(like),
                ReturnRecord.sku_barcode.ilike(like),
                ReturnRecord.serial_number.ilike(like),
                ReturnRecord.return_reason.ilike(like),
            )
        )
    return query


@router.get("/meta")
def returns_meta(_=Depends(get_current_user)):
    return {
        "statuses": sorted(list(VALID_RETURN_STATUSES)),
        "return_types": sorted(list(VALID_RETURN_TYPES)),
        "return_reasons": sorted(list(VALID_RETURN_REASONS)),
        "refund_methods": sorted(list(VALID_REFUND_METHODS)),
    }


@router.get("/dashboard")
def returns_dashboard(
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    rows = _query_return_records(db, date_from=date_from, date_to=date_to).all()
    total_returns = len(rows)
    pending_returns = len([r for r in rows if r.decision_status == RETURN_STATUS_PENDING])
    approved_returns = len([r for r in rows if r.decision_status == RETURN_STATUS_APPROVED])
    rejected_returns = len([r for r in rows if r.decision_status == RETURN_STATUS_REJECTED])
    refunded_rows = [r for r in rows if r.decision_status in {RETURN_STATUS_REFUNDED, RETURN_STATUS_CLOSED}]
    exchange_rows = [r for r in rows if r.decision_status == RETURN_STATUS_EXCHANGED]
    refund_total = round(sum(float(r.refund_amount or 0) for r in refunded_rows), 2)

    status_distribution_map: dict[str, int] = {}
    reason_distribution_map: dict[str, int] = {}
    for row in rows:
        status_distribution_map[row.decision_status] = status_distribution_map.get(row.decision_status, 0) + 1
        reason_distribution_map[row.return_reason] = reason_distribution_map.get(row.return_reason, 0) + 1

    return {
        "kpis": {
            "total_returns": total_returns,
            "pending_returns": pending_returns,
            "approved_returns": approved_returns,
            "rejected_returns": rejected_returns,
            "refund_total": refund_total,
            "exchange_count": len(exchange_rows),
        },
        "status_distribution": [
            {"status": key, "count": value}
            for key, value in sorted(status_distribution_map.items(), key=lambda x: x[0])
        ],
        "reason_distribution": [
            {"reason": key, "count": value}
            for key, value in sorted(reason_distribution_map.items(), key=lambda x: x[0])
        ],
        "latest_returns": [_serialize_return_record(row) for row in rows[:20]],
    }


@router.get("/records")
def list_return_records(
    q: str | None = Query(default=None),
    decision_status: str | None = Query(default=None),
    return_type: str | None = Query(default=None),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    limit: int = Query(default=500, ge=1, le=2000),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    rows = (
        _query_return_records(
            db,
            q=q,
            decision_status=decision_status,
            return_type=return_type,
            date_from=date_from,
            date_to=date_to,
        )
        .order_by(ReturnRecord.created_at.desc())
        .limit(limit)
        .all()
    )
    return [_serialize_return_record(row) for row in rows]


@router.get("/records/{record_id}")
def get_return_record(
    record_id: int,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    row = (
        db.query(ReturnRecord)
        .options(
            joinedload(ReturnRecord.staff_user),
            joinedload(ReturnRecord.approved_by),
            joinedload(ReturnRecord.refund_approved_by),
            joinedload(ReturnRecord.item),
            joinedload(ReturnRecord.replacement_item),
            joinedload(ReturnRecord.sale_item),
            joinedload(ReturnRecord.sale),
            joinedload(ReturnRecord.damaged_logs).joinedload(DamagedStockLog.item),
            joinedload(ReturnRecord.damaged_logs).joinedload(DamagedStockLog.created_by),
        )
        .filter(ReturnRecord.id == record_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Return record not found")
    payload = _serialize_return_record(row)
    payload["damaged_stock_logs"] = [
        {
            "id": log.id,
            "item_name": log.item.name if log.item else None,
            "quantity": log.quantity,
            "reason": log.reason,
            "note": log.note,
            "created_by": (
                log.created_by.full_name or log.created_by.username
                if log.created_by
                else None
            ),
            "created_at": log.created_at.isoformat() if log.created_at else None,
        }
        for log in row.damaged_logs
    ]
    payload["line_unit_price"] = float(row.sale_item.price or 0) if row.sale_item else 0
    payload["line_total"] = float(row.sale_item.price or 0) * int(row.quantity or 0) if row.sale_item else 0
    return payload


@router.post("/records")
def create_return_record_endpoint(
    payload: ReturnRecordCreateIn,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    row = create_return_record(
        db,
        original_sale_id=payload.original_invoice_id,
        original_sale_item_id=payload.original_sale_item_id,
        quantity=payload.quantity,
        return_type=payload.return_type,
        return_reason=payload.return_reason,
        item_condition=payload.item_condition,
        inspection_note=payload.inspection_note,
        staff_user_id=current_user.id if current_user else None,
    )
    db.commit()
    db.refresh(row)
    return _serialize_return_record(row)


@router.put("/records/{record_id}/process")
def process_return_record_endpoint(
    record_id: int,
    payload: ReturnRecordProcessIn,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    row = (
        db.query(ReturnRecord)
        .options(joinedload(ReturnRecord.sale_item))
        .filter(ReturnRecord.id == record_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Return record not found")

    process_return_record(
        db,
        record=row,
        decision_status=payload.decision_status,
        actor_user_id=current_user.id if current_user else None,
        return_reason=payload.return_reason,
        item_condition=payload.item_condition,
        inspection_note=payload.inspection_note,
        refund_amount=payload.refund_amount,
        refund_method=payload.refund_method,
        replacement_item_id=payload.replacement_item_id,
        replacement_quantity=payload.replacement_quantity,
        process_note=payload.process_note,
    )
    db.commit()
    db.refresh(row)
    return _serialize_return_record(row)


@router.get("/records/{record_id}/receipt")
def get_return_receipt(
    record_id: int,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    row = (
        db.query(ReturnRecord)
        .options(joinedload(ReturnRecord.sale_item))
        .filter(ReturnRecord.id == record_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Return record not found")
    return build_return_receipt_payload(row)


@router.get("/invoice-lookup/{invoice_ref}")
def invoice_lookup(
    invoice_ref: str,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    sale_id = parse_invoice_id(invoice_ref)
    sale = db.query(Sale).options(joinedload(Sale.customer)).filter(Sale.id == sale_id).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if sale.is_return:
        raise HTTPException(status_code=400, detail="Invoice is a return invoice")
    if sale.is_voided:
        raise HTTPException(status_code=400, detail="Invoice has been voided")

    lines = db.query(SaleItem).filter(SaleItem.sale_id == sale.id).all()
    # Fallback join for item details
    item_map = {}
    item_ids = [line.item_id for line in lines if line.item_id]
    if item_ids:
        item_rows = db.query(InventoryItem).filter(InventoryItem.id.in_(item_ids)).all()
        item_map = {item.id: item for item in item_rows}

    items_payload = []
    for line in lines:
        item = item_map.get(line.item_id)
        sold_qty = max(0, int(line.quantity or 0))
        returned_qty = get_returned_qty_for_sale_item(db, line.id)
        returnable_qty = max(0, sold_qty - returned_qty)
        return_history_rows = (
            db.query(ReturnRecord)
            .filter(ReturnRecord.original_sale_item_id == line.id)
            .order_by(ReturnRecord.created_at.desc())
            .all()
        )
        items_payload.append(
            {
                "sale_item_id": line.id,
                "item_id": line.item_id,
                "product_name": item.name if item else f"Item #{line.item_id}",
                "sku": item.sku if item else None,
                "barcode": item.barcode if item else None,
                "serial_number": line.serial_number,
                "unit_price": float(line.price or 0),
                "sold_qty": sold_qty,
                "already_returned_qty": returned_qty,
                "returnable_qty": returnable_qty,
                "return_history": [_serialize_return_record(r) for r in return_history_rows],
            }
        )

    return {
        "invoice_id": sale.id,
        "invoice_no": f"INV-{sale.id:05d}",
        "customer_id": sale.customer_id,
        "customer_name": sale.customer.name if sale.customer else "Walk-in",
        "customer_phone": sale.customer.phone if sale.customer else None,
        "payment_method": sale.payment_method,
        "total": float(sale.total or 0),
        "created_at": sale.created_at.isoformat() if sale.created_at else None,
        "items": items_payload,
        "return_records": [
            _serialize_return_record(r)
            for r in db.query(ReturnRecord)
            .filter(ReturnRecord.original_sale_id == sale.id)
            .order_by(ReturnRecord.created_at.desc())
            .all()
        ],
    }


@router.get("/reports")
def returns_reports(
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    rows = _query_return_records(db, date_from=date_from, date_to=date_to).all()
    refund_rows = [r for r in rows if r.decision_status in {RETURN_STATUS_REFUNDED, RETURN_STATUS_CLOSED}]
    exchange_rows = [r for r in rows if r.decision_status == RETURN_STATUS_EXCHANGED]
    warranty_replacement_rows = [r for r in rows if r.return_type == "Warranty Replacement"]

    start = _parse_date(date_from)
    end = _parse_date(date_to, end_exclusive=True)
    damaged_query = db.query(DamagedStockLog).options(
        joinedload(DamagedStockLog.item),
        joinedload(DamagedStockLog.return_record),
    )
    if start:
        damaged_query = damaged_query.filter(DamagedStockLog.created_at >= start)
    if end:
        damaged_query = damaged_query.filter(DamagedStockLog.created_at < end)
    damaged_rows = damaged_query.order_by(DamagedStockLog.created_at.desc()).all()

    reason_summary = {}
    for row in rows:
        reason_summary[row.return_reason] = reason_summary.get(row.return_reason, 0) + 1

    status_summary = {}
    for row in rows:
        status_summary[row.decision_status] = status_summary.get(row.decision_status, 0) + 1

    return {
        "summary": {
            "total_returns": len(rows),
            "total_refund_amount": round(sum(float(r.refund_amount or 0) for r in refund_rows), 2),
            "total_exchanges": len(exchange_rows),
            "damaged_stock_items": len(damaged_rows),
            "warranty_replacements": len(warranty_replacement_rows),
        },
        "return_summary_report": [
            {
                "status": key,
                "count": value,
            }
            for key, value in sorted(status_summary.items(), key=lambda x: x[0])
        ],
        "refund_report": [_serialize_return_record(row) for row in refund_rows],
        "exchange_report": [_serialize_return_record(row) for row in exchange_rows],
        "damaged_stock_report": [
            {
                "id": row.id,
                "return_id": row.return_record.return_code if row.return_record else None,
                "product_name": row.item.name if row.item else None,
                "quantity": row.quantity,
                "reason": row.reason,
                "created_at": row.created_at.isoformat() if row.created_at else None,
            }
            for row in damaged_rows
        ],
        "warranty_replacement_report": [
            _serialize_return_record(row) for row in warranty_replacement_rows
        ],
        "reason_summary": [
            {"reason": key, "count": value}
            for key, value in sorted(reason_summary.items(), key=lambda x: x[0])
        ],
    }
