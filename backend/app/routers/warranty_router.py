import json
import re
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user
from app.database import get_db
from app.models import (
    Customer,
    InventoryItem,
    RepairTicket,
    Sale,
    WarrantyClaim,
    WarrantyCondition,
    WarrantyRecord,
    WarrantyRule,
)
from app.schemas import (
    WarrantyClaimIn,
    WarrantyClaimUpdateIn,
    WarrantyConditionIn,
    WarrantyRecordIn,
    WarrantyRuleIn,
)
from app.services.warranty_service import (
    CLAIM_STATUS_APPROVED,
    CLAIM_STATUS_PENDING,
    CLAIM_STATUS_REJECTED,
    CLAIM_STATUS_REPLACED,
    WARRANTY_STATUS_ACTIVE,
    WARRANTY_STATUS_CLAIMED,
    WARRANTY_STATUS_EXPIRED,
    WARRANTY_STATUS_REJECTED,
    WARRANTY_STATUS_REPLACED,
    apply_claim_status_to_warranty,
    ensure_warranty_defaults,
    refresh_warranty_statuses,
    stamp_claim_code,
)

router = APIRouter(prefix="/warranty", tags=["warranty"])


def _parse_iso_date(value: str | None, end_exclusive: bool = False) -> datetime | None:
    if not value:
        return None
    dt = datetime.fromisoformat(value)
    if end_exclusive:
        dt = dt + timedelta(days=1)
    return dt


def _parse_conditions_json(value: str | None) -> list[dict]:
    if not value:
        return []
    try:
        loaded = json.loads(value)
        return loaded if isinstance(loaded, list) else []
    except Exception:
        return []


def _serialize_record(row: WarrantyRecord) -> dict:
    invoice_no = f"INV-{row.invoice_id:05d}" if row.invoice_id else None
    repair_no = row.repair_ticket.ticket_no if row.repair_ticket else None
    return {
        "id": row.id,
        "warranty_id": row.warranty_code,
        "invoice_id": row.invoice_id,
        "invoice_no": invoice_no,
        "repair_ticket_id": row.repair_ticket_id,
        "repair_ticket_no": repair_no,
        "sale_item_id": row.sale_item_id,
        "item_id": row.item_id,
        "customer_id": row.customer_id,
        "customer_name": row.customer_name,
        "customer_phone": row.customer_phone,
        "product_or_service_name": row.product_or_service_name,
        "product_category": row.product_category,
        "brand": row.brand,
        "supplier_name": row.supplier_name,
        "device_brand_model": row.device_brand_model,
        "imei_or_serial": row.imei_or_serial,
        "serial_number": row.serial_number,
        "warranty_type": row.warranty_type,
        "start_date": row.start_date.isoformat() if row.start_date else None,
        "end_date": row.end_date.isoformat() if row.end_date else None,
        "status": row.status,
        "quantity_covered": row.quantity_covered,
        "warranty_days": row.warranty_days,
        "conditions": _parse_conditions_json(row.conditions_json),
        "notes": row.notes,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        "claims_count": len(row.claims or []),
        "latest_claim_status": row.claims[-1].claim_status if row.claims else None,
    }


def _serialize_claim(row: WarrantyClaim) -> dict:
    return {
        "id": row.id,
        "claim_id": row.claim_code,
        "warranty_id": row.warranty_id,
        "warranty_code": row.warranty.warranty_code if row.warranty else None,
        "customer_name": row.warranty.customer_name if row.warranty else None,
        "customer_phone": row.warranty.customer_phone if row.warranty else None,
        "product_or_service_name": row.warranty.product_or_service_name if row.warranty else None,
        "warranty_status": row.warranty.status if row.warranty else None,
        "customer_complaint": row.customer_complaint,
        "technician_inspection_note": row.technician_inspection_note,
        "claim_status": row.claim_status,
        "claim_decision": row.claim_decision,
        "replacement_item": row.replacement_item,
        "repair_action": row.repair_action,
        "processed_by": (
            row.processed_by.full_name or row.processed_by.username
            if row.processed_by
            else None
        ),
        "approved_by": (
            row.approved_by.full_name or row.approved_by.username
            if row.approved_by
            else None
        ),
        "approved_at": row.approved_at.isoformat() if row.approved_at else None,
        "closed_at": row.closed_at.isoformat() if row.closed_at else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def _build_record_query(
    db: Session,
    status: str | None = None,
    warranty_type: str | None = None,
    category: str | None = None,
    brand: str | None = None,
    supplier: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    q: str | None = None,
):
    query = (
        db.query(WarrantyRecord)
        .options(
            joinedload(WarrantyRecord.repair_ticket),
            joinedload(WarrantyRecord.claims),
        )
    )
    if status and status.lower() != "all":
        query = query.filter(WarrantyRecord.status == status)
    if warranty_type and warranty_type.lower() != "all":
        query = query.filter(WarrantyRecord.warranty_type == warranty_type)
    if category and category.lower() != "all":
        query = query.filter(WarrantyRecord.product_category == category)
    if brand and brand.lower() != "all":
        query = query.filter(WarrantyRecord.brand == brand)
    if supplier and supplier.lower() != "all":
        query = query.filter(WarrantyRecord.supplier_name == supplier)
    start = _parse_iso_date(date_from)
    end = _parse_iso_date(date_to, end_exclusive=True)
    if start:
        query = query.filter(WarrantyRecord.start_date >= start)
    if end:
        query = query.filter(WarrantyRecord.start_date < end)
    if q:
        normalized_q = q.strip()
        invoice_id_match = None
        if normalized_q.lower().startswith("inv-"):
            digits = re.sub(r"[^\d]", "", normalized_q)
            if digits:
                invoice_id_match = int(digits)
        like = f"%{q.strip()}%"
        clauses = [
            WarrantyRecord.warranty_code.ilike(like),
            WarrantyRecord.customer_name.ilike(like),
            WarrantyRecord.customer_phone.ilike(like),
            WarrantyRecord.imei_or_serial.ilike(like),
            WarrantyRecord.serial_number.ilike(like),
            WarrantyRecord.product_or_service_name.ilike(like),
        ]
        if invoice_id_match is not None:
            clauses.append(WarrantyRecord.invoice_id == invoice_id_match)
        query = query.filter(or_(*clauses))
    return query


@router.get("/dashboard")
def warranty_dashboard(
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    ensure_warranty_defaults(db)
    refresh_warranty_statuses(db)
    now = datetime.utcnow()
    soon_cutoff = now + timedelta(days=14)

    record_query = _build_record_query(db, date_from=date_from, date_to=date_to)
    records = record_query.all()
    active = [r for r in records if r.status == WARRANTY_STATUS_ACTIVE and r.end_date >= now]
    expired = [r for r in records if r.status == WARRANTY_STATUS_EXPIRED or r.end_date < now]
    expiring_soon = [r for r in active if r.end_date <= soon_cutoff]

    claim_query = db.query(WarrantyClaim)
    start = _parse_iso_date(date_from)
    end = _parse_iso_date(date_to, end_exclusive=True)
    if start:
        claim_query = claim_query.filter(WarrantyClaim.created_at >= start)
    if end:
        claim_query = claim_query.filter(WarrantyClaim.created_at < end)
    claims = claim_query.all()

    pending_claims = [c for c in claims if c.claim_status == CLAIM_STATUS_PENDING]
    approved_claims = [c for c in claims if c.claim_status == CLAIM_STATUS_APPROVED]
    rejected_claims = [c for c in claims if c.claim_status == CLAIM_STATUS_REJECTED]

    return {
        "kpis": {
            "active_warranties": len(active),
            "expired_warranties": len(expired),
            "pending_claims": len(pending_claims),
            "approved_claims": len(approved_claims),
            "rejected_claims": len(rejected_claims),
            "expiring_soon": len(expiring_soon),
            "total_warranties": len(records),
            "total_claims": len(claims),
        },
        "top_expiring": [
            {
                "warranty_id": row.warranty_code,
                "customer_name": row.customer_name,
                "product_or_service_name": row.product_or_service_name,
                "end_date": row.end_date.isoformat() if row.end_date else None,
                "days_left": max(0, int((row.end_date - now).days)) if row.end_date else 0,
                "status": row.status,
            }
            for row in sorted(expiring_soon, key=lambda r: r.end_date)[:10]
        ],
    }


@router.get("/records")
def list_warranty_records(
    status: str | None = Query(default=None),
    warranty_type: str | None = Query(default=None),
    category: str | None = Query(default=None),
    brand: str | None = Query(default=None),
    supplier: str | None = Query(default=None),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    q: str | None = Query(default=None),
    limit: int = Query(default=500, ge=1, le=2000),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    refresh_warranty_statuses(db)
    rows = (
        _build_record_query(
            db,
            status=status,
            warranty_type=warranty_type,
            category=category,
            brand=brand,
            supplier=supplier,
            date_from=date_from,
            date_to=date_to,
            q=q,
        )
        .order_by(WarrantyRecord.created_at.desc())
        .limit(limit)
        .all()
    )
    return [_serialize_record(row) for row in rows]


@router.get("/records/{warranty_record_id}")
def get_warranty_record(
    warranty_record_id: int,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    row = (
        db.query(WarrantyRecord)
        .options(
            joinedload(WarrantyRecord.repair_ticket),
            joinedload(WarrantyRecord.claims).joinedload(WarrantyClaim.processed_by),
            joinedload(WarrantyRecord.claims).joinedload(WarrantyClaim.approved_by),
        )
        .filter(WarrantyRecord.id == warranty_record_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Warranty record not found")
    payload = _serialize_record(row)
    payload["claims"] = [_serialize_claim(claim) for claim in row.claims]
    return payload


@router.post("/records")
def create_warranty_record(
    payload: WarrantyRecordIn,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    start_date = payload.start_date
    end_date = payload.end_date or (start_date + timedelta(days=max(0, int(payload.warranty_days or 0))))
    if end_date < start_date:
        raise HTTPException(status_code=400, detail="End date cannot be earlier than start date")

    row = WarrantyRecord(
        invoice_id=payload.invoice_id,
        repair_ticket_id=payload.repair_ticket_id,
        sale_item_id=payload.sale_item_id,
        item_id=payload.item_id,
        customer_id=payload.customer_id,
        customer_name=payload.customer_name,
        customer_phone=payload.customer_phone,
        product_or_service_name=payload.product_or_service_name,
        product_category=payload.product_category,
        brand=payload.brand,
        supplier_name=payload.supplier_name,
        device_brand_model=payload.device_brand_model,
        imei_or_serial=payload.imei_or_serial,
        serial_number=payload.serial_number,
        warranty_type=payload.warranty_type,
        start_date=start_date,
        end_date=end_date,
        status=payload.status if payload.status else (WARRANTY_STATUS_ACTIVE if end_date >= datetime.utcnow() else WARRANTY_STATUS_EXPIRED),
        quantity_covered=max(1, int(payload.quantity_covered or 1)),
        warranty_days=max(0, int(payload.warranty_days or 0)),
        conditions_json=payload.conditions_json,
        notes=payload.notes,
        created_by_id=current_user.id,
    )
    db.add(row)
    db.flush()
    row.warranty_code = f"WTY-{row.id:07d}"
    db.commit()
    db.refresh(row)
    return _serialize_record(row)


@router.put("/records/{warranty_record_id}/status")
def update_warranty_record_status(
    warranty_record_id: int,
    status: str,
    notes: str | None = None,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    row = db.query(WarrantyRecord).filter(WarrantyRecord.id == warranty_record_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Warranty record not found")

    valid = {
        WARRANTY_STATUS_ACTIVE,
        WARRANTY_STATUS_EXPIRED,
        WARRANTY_STATUS_CLAIMED,
        WARRANTY_STATUS_REJECTED,
        WARRANTY_STATUS_REPLACED,
    }
    if status not in valid:
        raise HTTPException(status_code=400, detail="Invalid warranty status")
    row.status = status
    if notes is not None:
        row.notes = notes
    db.commit()
    db.refresh(row)
    return _serialize_record(row)


@router.get("/lookup")
def warranty_lookup(
    invoice_id: int | None = Query(default=None),
    customer_phone: str | None = Query(default=None),
    imei: str | None = Query(default=None),
    warranty_id: str | None = Query(default=None),
    serial_number: str | None = Query(default=None),
    q: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    refresh_warranty_statuses(db)
    query = (
        db.query(WarrantyRecord)
        .options(joinedload(WarrantyRecord.repair_ticket), joinedload(WarrantyRecord.claims))
    )
    if invoice_id:
        query = query.filter(WarrantyRecord.invoice_id == invoice_id)
    if customer_phone:
        query = query.filter(WarrantyRecord.customer_phone.ilike(f"%{customer_phone.strip()}%"))
    if imei:
        query = query.filter(WarrantyRecord.imei_or_serial.ilike(f"%{imei.strip()}%"))
    if warranty_id:
        query = query.filter(WarrantyRecord.warranty_code.ilike(f"%{warranty_id.strip()}%"))
    if serial_number:
        query = query.filter(WarrantyRecord.serial_number.ilike(f"%{serial_number.strip()}%"))
    if q:
        normalized_q = q.strip()
        invoice_id_match = None
        if normalized_q.lower().startswith("inv-"):
            digits = re.sub(r"[^\d]", "", normalized_q)
            if digits:
                invoice_id_match = int(digits)
        like = f"%{q.strip()}%"
        clauses = [
            WarrantyRecord.warranty_code.ilike(like),
            WarrantyRecord.customer_phone.ilike(like),
            WarrantyRecord.customer_name.ilike(like),
            WarrantyRecord.imei_or_serial.ilike(like),
            WarrantyRecord.serial_number.ilike(like),
            WarrantyRecord.product_or_service_name.ilike(like),
        ]
        if invoice_id_match is not None:
            clauses.append(WarrantyRecord.invoice_id == invoice_id_match)
        query = query.filter(or_(*clauses))
    rows = query.order_by(WarrantyRecord.created_at.desc()).limit(100).all()
    return [_serialize_record(row) for row in rows]


@router.get("/claims")
def list_warranty_claims(
    claim_status: str | None = Query(default=None),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    q: str | None = Query(default=None),
    limit: int = Query(default=500, ge=1, le=2000),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    query = (
        db.query(WarrantyClaim)
        .options(
            joinedload(WarrantyClaim.warranty),
            joinedload(WarrantyClaim.processed_by),
            joinedload(WarrantyClaim.approved_by),
        )
    )
    if claim_status and claim_status.lower() != "all":
        query = query.filter(WarrantyClaim.claim_status == claim_status)
    start = _parse_iso_date(date_from)
    end = _parse_iso_date(date_to, end_exclusive=True)
    if start:
        query = query.filter(WarrantyClaim.created_at >= start)
    if end:
        query = query.filter(WarrantyClaim.created_at < end)
    if q:
        like = f"%{q.strip()}%"
        query = query.join(WarrantyClaim.warranty).filter(
            or_(
                WarrantyClaim.claim_code.ilike(like),
                WarrantyRecord.warranty_code.ilike(like),
                WarrantyRecord.customer_name.ilike(like),
                WarrantyRecord.customer_phone.ilike(like),
                WarrantyRecord.product_or_service_name.ilike(like),
                WarrantyClaim.customer_complaint.ilike(like),
            )
        )
    rows = query.order_by(WarrantyClaim.created_at.desc()).limit(limit).all()
    return [_serialize_claim(row) for row in rows]


@router.post("/claims")
def create_warranty_claim(
    payload: WarrantyClaimIn,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    warranty = (
        db.query(WarrantyRecord)
        .filter(WarrantyRecord.id == payload.warranty_id)
        .first()
    )
    if not warranty:
        raise HTTPException(status_code=404, detail="Warranty record not found")

    row = WarrantyClaim(
        warranty_id=payload.warranty_id,
        customer_complaint=payload.customer_complaint,
        technician_inspection_note=payload.technician_inspection_note,
        claim_status=payload.claim_status,
        claim_decision=payload.claim_decision,
        replacement_item=payload.replacement_item,
        repair_action=payload.repair_action,
        processed_by_id=current_user.id,
    )
    db.add(row)
    db.flush()
    stamp_claim_code(row)
    apply_claim_status_to_warranty(warranty, row.claim_status)
    db.commit()
    db.refresh(row)
    return _serialize_claim(row)


@router.put("/claims/{claim_id}")
def update_warranty_claim(
    claim_id: int,
    payload: WarrantyClaimUpdateIn,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    row = (
        db.query(WarrantyClaim)
        .options(joinedload(WarrantyClaim.warranty))
        .filter(WarrantyClaim.id == claim_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Claim not found")

    update_data = payload.model_dump(exclude_none=True)
    for key, value in update_data.items():
        setattr(row, key, value)

    if payload.claim_status:
        if payload.claim_status in {CLAIM_STATUS_APPROVED, CLAIM_STATUS_REJECTED, CLAIM_STATUS_REPLACED}:
            row.approved_by_id = current_user.id
            row.approved_at = datetime.utcnow()
        if payload.claim_status == "Closed":
            row.closed_at = datetime.utcnow()
        apply_claim_status_to_warranty(row.warranty, payload.claim_status)

    row.processed_by_id = current_user.id
    db.commit()
    db.refresh(row)
    return _serialize_claim(row)


@router.get("/rules")
def list_warranty_rules(
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    ensure_warranty_defaults(db)
    rows = db.query(WarrantyRule).order_by(WarrantyRule.scope_type.asc(), WarrantyRule.id.asc()).all()
    return [
        {
            "id": row.id,
            "rule_name": row.rule_name,
            "scope_type": row.scope_type,
            "scope_value": row.scope_value,
            "warranty_days": row.warranty_days,
            "description": row.description,
            "is_active": row.is_active,
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        }
        for row in rows
    ]


@router.post("/rules")
def create_warranty_rule(
    payload: WarrantyRuleIn,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    row = WarrantyRule(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return {
        "id": row.id,
        "rule_name": row.rule_name,
        "scope_type": row.scope_type,
        "scope_value": row.scope_value,
        "warranty_days": row.warranty_days,
        "description": row.description,
        "is_active": row.is_active,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


@router.put("/rules/{rule_id}")
def update_warranty_rule(
    rule_id: int,
    payload: WarrantyRuleIn,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    row = db.query(WarrantyRule).filter(WarrantyRule.id == rule_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Warranty rule not found")
    for key, value in payload.model_dump().items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return {
        "id": row.id,
        "rule_name": row.rule_name,
        "scope_type": row.scope_type,
        "scope_value": row.scope_value,
        "warranty_days": row.warranty_days,
        "description": row.description,
        "is_active": row.is_active,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


@router.delete("/rules/{rule_id}")
def delete_warranty_rule(
    rule_id: int,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    row = db.query(WarrantyRule).filter(WarrantyRule.id == rule_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Warranty rule not found")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.get("/conditions")
def list_warranty_conditions(
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    ensure_warranty_defaults(db)
    rows = db.query(WarrantyCondition).order_by(WarrantyCondition.sort_order.asc(), WarrantyCondition.id.asc()).all()
    return [
        {
            "id": row.id,
            "condition_code": row.condition_code,
            "title": row.title,
            "description": row.description,
            "is_covered": row.is_covered,
            "is_active": row.is_active,
            "sort_order": row.sort_order,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
        for row in rows
    ]


@router.post("/conditions")
def create_warranty_condition(
    payload: WarrantyConditionIn,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    exists = (
        db.query(WarrantyCondition)
        .filter(WarrantyCondition.condition_code == payload.condition_code)
        .first()
    )
    if exists:
        raise HTTPException(status_code=400, detail="Condition code already exists")
    row = WarrantyCondition(**payload.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return {
        "id": row.id,
        "condition_code": row.condition_code,
        "title": row.title,
        "description": row.description,
        "is_covered": row.is_covered,
        "is_active": row.is_active,
        "sort_order": row.sort_order,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


@router.put("/conditions/{condition_id}")
def update_warranty_condition(
    condition_id: int,
    payload: WarrantyConditionIn,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    row = db.query(WarrantyCondition).filter(WarrantyCondition.id == condition_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Condition not found")
    for key, value in payload.model_dump().items():
        setattr(row, key, value)
    db.commit()
    db.refresh(row)
    return {
        "id": row.id,
        "condition_code": row.condition_code,
        "title": row.title,
        "description": row.description,
        "is_covered": row.is_covered,
        "is_active": row.is_active,
        "sort_order": row.sort_order,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


@router.delete("/conditions/{condition_id}")
def delete_warranty_condition(
    condition_id: int,
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    row = db.query(WarrantyCondition).filter(WarrantyCondition.id == condition_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Condition not found")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.get("/reports")
def warranty_reports(
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    refresh_warranty_statuses(db)
    rows = _build_record_query(db, date_from=date_from, date_to=date_to).all()
    claims = (
        db.query(WarrantyClaim)
        .options(joinedload(WarrantyClaim.warranty))
        .all()
    )
    start = _parse_iso_date(date_from)
    end = _parse_iso_date(date_to, end_exclusive=True)
    if start:
        claims = [c for c in claims if c.created_at and c.created_at >= start]
    if end:
        claims = [c for c in claims if c.created_at and c.created_at < end]

    active_rows = [r for r in rows if r.status == WARRANTY_STATUS_ACTIVE]
    expired_rows = [r for r in rows if r.status == WARRANTY_STATUS_EXPIRED]
    rejected_claim_rows = [c for c in claims if c.claim_status == CLAIM_STATUS_REJECTED]
    replacement_claim_rows = [c for c in claims if c.claim_status == CLAIM_STATUS_REPLACED]

    summary_by_status: dict[str, int] = {}
    for claim in claims:
        key = claim.claim_status or "Unknown"
        summary_by_status[key] = summary_by_status.get(key, 0) + 1

    trend_map: dict[str, dict] = {}
    for claim in claims:
        if not claim.created_at:
            continue
        month_key = claim.created_at.strftime("%Y-%m")
        if month_key not in trend_map:
            trend_map[month_key] = {
                "month": month_key,
                "total_claims": 0,
                "approved": 0,
                "rejected": 0,
            }
        trend_map[month_key]["total_claims"] += 1
        if claim.claim_status == CLAIM_STATUS_APPROVED:
            trend_map[month_key]["approved"] += 1
        if claim.claim_status == CLAIM_STATUS_REJECTED:
            trend_map[month_key]["rejected"] += 1

    return {
        "kpis": {
            "active_warranties": len(active_rows),
            "expired_warranties": len(expired_rows),
            "claims_total": len(claims),
            "claims_pending": len([c for c in claims if c.claim_status == CLAIM_STATUS_PENDING]),
            "claims_rejected": len(rejected_claim_rows),
            "claims_replaced": len(replacement_claim_rows),
        },
        "active_warranties": [_serialize_record(r) for r in active_rows[:500]],
        "expired_warranties": [_serialize_record(r) for r in expired_rows[:500]],
        "claims_summary": [{"status": k, "count": v} for k, v in sorted(summary_by_status.items())],
        "rejected_claims": [_serialize_claim(c) for c in rejected_claim_rows[:500]],
        "replacement_history": [_serialize_claim(c) for c in replacement_claim_rows[:500]],
        "claim_trend": [trend_map[key] for key in sorted(trend_map.keys())],
    }


@router.get("/filters")
def warranty_filters(
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    categories = [
        row[0]
        for row in db.query(WarrantyRecord.product_category)
        .filter(WarrantyRecord.product_category.isnot(None), WarrantyRecord.product_category != "")
        .distinct()
        .all()
    ]
    brands = [
        row[0]
        for row in db.query(WarrantyRecord.brand)
        .filter(WarrantyRecord.brand.isnot(None), WarrantyRecord.brand != "")
        .distinct()
        .all()
    ]
    suppliers = [
        row[0]
        for row in db.query(WarrantyRecord.supplier_name)
        .filter(WarrantyRecord.supplier_name.isnot(None), WarrantyRecord.supplier_name != "")
        .distinct()
        .all()
    ]
    customers = [
        {"id": row.id, "name": row.name, "phone": row.phone}
        for row in db.query(Customer).order_by(Customer.name.asc()).all()
    ]
    inventory_items = [
        {
            "id": row.id,
            "name": row.name,
            "category": row.category,
            "brand": row.brand,
        }
        for row in db.query(InventoryItem).order_by(InventoryItem.name.asc()).all()
    ]
    repairs = [
        {
            "id": row.id,
            "ticket_no": row.ticket_no,
            "device_model": row.device_model,
            "status": row.status,
        }
        for row in db.query(RepairTicket).order_by(RepairTicket.created_at.desc()).limit(200).all()
    ]
    invoices = [
        {
            "id": row.id,
            "invoice_no": f"INV-{row.id:05d}",
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
        for row in db.query(Sale).order_by(Sale.created_at.desc()).limit(200).all()
    ]
    return {
        "categories": categories,
        "brands": brands,
        "suppliers": suppliers,
        "customers": customers,
        "inventory_items": inventory_items,
        "repairs": repairs,
        "invoices": invoices,
    }
