import json
from datetime import datetime, timedelta
from typing import Iterable

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models import (
    Customer,
    InventoryItem,
    RepairTicket,
    Sale,
    SaleItem,
    WarrantyClaim,
    WarrantyCondition,
    WarrantyRecord,
    WarrantyRule,
)

WARRANTY_STATUS_ACTIVE = "Active"
WARRANTY_STATUS_EXPIRED = "Expired"
WARRANTY_STATUS_CLAIMED = "Claimed"
WARRANTY_STATUS_REJECTED = "Rejected"
WARRANTY_STATUS_REPLACED = "Replaced"

CLAIM_STATUS_PENDING = "Pending Inspection"
CLAIM_STATUS_APPROVED = "Approved"
CLAIM_STATUS_REJECTED = "Rejected"
CLAIM_STATUS_REPAIRED = "Repaired"
CLAIM_STATUS_REPLACED = "Replaced"
CLAIM_STATUS_CLOSED = "Closed"


def ensure_warranty_defaults(db: Session) -> None:
    if db.query(WarrantyRule).count() == 0:
        defaults = [
            WarrantyRule(
                rule_name="Phones Standard Warranty",
                scope_type="product_category",
                scope_value="Phones",
                warranty_days=365,
                description="Default warranty for retail phones.",
                is_active=True,
            ),
            WarrantyRule(
                rule_name="Accessories Warranty",
                scope_type="product_category",
                scope_value="Accessories",
                warranty_days=180,
                description="Warranty for accessories and add-ons.",
                is_active=True,
            ),
            WarrantyRule(
                rule_name="Spare Parts Warranty",
                scope_type="spare_part",
                scope_value="*",
                warranty_days=90,
                description="Default spare-parts warranty period.",
                is_active=True,
            ),
            WarrantyRule(
                rule_name="Repair Service Warranty",
                scope_type="repair_service",
                scope_value="*",
                warranty_days=30,
                description="Default post-repair service warranty.",
                is_active=True,
            ),
            WarrantyRule(
                rule_name="Display Replacement Warranty",
                scope_type="repair_service",
                scope_value="display",
                warranty_days=30,
                description="Warranty period for display replacement jobs.",
                is_active=True,
            ),
            WarrantyRule(
                rule_name="Battery Replacement Warranty",
                scope_type="repair_service",
                scope_value="battery",
                warranty_days=90,
                description="Warranty period for battery replacement jobs.",
                is_active=True,
            ),
        ]
        db.add_all(defaults)

    if db.query(WarrantyCondition).count() == 0:
        conditions = [
            WarrantyCondition(
                condition_code="PHYSICAL_DAMAGE",
                title="Physical damage not covered",
                description="Any cracked body, bent frame, or impact marks voids warranty.",
                is_covered=False,
                is_active=True,
                sort_order=10,
            ),
            WarrantyCondition(
                condition_code="WATER_DAMAGE",
                title="Water damage not covered",
                description="Liquid ingress, corrosion, or moisture indicators are excluded.",
                is_covered=False,
                is_active=True,
                sort_order=20,
            ),
            WarrantyCondition(
                condition_code="BURN_DAMAGE",
                title="Burn damage not covered",
                description="Electrical burns, overheating burns, or short-circuit burns are excluded.",
                is_covered=False,
                is_active=True,
                sort_order=30,
            ),
            WarrantyCondition(
                condition_code="SEAL_REMOVED",
                title="Warranty void if seal removed",
                description="Tamper seals or stickers removed by unauthorized party void warranty.",
                is_covered=False,
                is_active=True,
                sort_order=40,
            ),
            WarrantyCondition(
                condition_code="SOFTWARE_MISUSE",
                title="Software misuse not covered",
                description="Rooting, unsupported firmware changes, or malware misuse are excluded.",
                is_covered=False,
                is_active=True,
                sort_order=50,
            ),
        ]
        db.add_all(conditions)

    db.commit()


def refresh_warranty_statuses(db: Session) -> None:
    now = datetime.utcnow()
    rows = (
        db.query(WarrantyRecord)
        .filter(~WarrantyRecord.status.in_([WARRANTY_STATUS_REPLACED, WARRANTY_STATUS_REJECTED]))
        .all()
    )
    touched = False
    for row in rows:
        if row.status == WARRANTY_STATUS_CLAIMED:
            continue
        desired = WARRANTY_STATUS_ACTIVE if row.end_date and row.end_date >= now else WARRANTY_STATUS_EXPIRED
        if row.status != desired:
            row.status = desired
            touched = True
    if touched:
        db.commit()


def _is_spare_part(item: InventoryItem | None) -> bool:
    if not item:
        return False
    type_hint = str(item.product_type or "").lower()
    cat_hint = str(item.category or "").lower()
    return "spare" in type_hint or "spare" in cat_hint or "part" in cat_hint


def _list_active_conditions_payload(db: Session) -> str:
    rows = (
        db.query(WarrantyCondition)
        .filter(WarrantyCondition.is_active == True)  # noqa: E712
        .order_by(WarrantyCondition.sort_order.asc(), WarrantyCondition.id.asc())
        .all()
    )
    payload = [
        {
            "code": r.condition_code,
            "title": r.title,
            "description": r.description,
            "is_covered": bool(r.is_covered),
        }
        for r in rows
    ]
    return json.dumps(payload)


def _find_rule_days(
    db: Session,
    scope_type: str,
    scope_candidates: Iterable[str],
) -> int:
    candidates = [str(x).strip() for x in scope_candidates if str(x or "").strip()]
    if "*" not in candidates:
        candidates.append("*")
    rules = (
        db.query(WarrantyRule)
        .filter(
            WarrantyRule.is_active == True,  # noqa: E712
            WarrantyRule.scope_type == scope_type,
            or_(*[WarrantyRule.scope_value.ilike(candidate) for candidate in candidates]),
        )
        .all()
    )
    if not rules:
        return 0

    candidate_order = {value.lower(): index for index, value in enumerate(candidates)}
    rules.sort(
        key=lambda r: (
            candidate_order.get(str(r.scope_value or "").lower(), len(candidates)),
            -int(r.warranty_days or 0),
        )
    )
    return max(0, int(rules[0].warranty_days or 0))


def resolve_sale_item_warranty_days(
    db: Session,
    item: InventoryItem | None,
    explicit_days: int | None = None,
) -> int:
    if explicit_days and int(explicit_days) > 0:
        return int(explicit_days)
    if item and int(item.warranty_days or 0) > 0:
        return int(item.warranty_days or 0)
    if not item:
        return 0
    if _is_spare_part(item):
        return _find_rule_days(db, "spare_part", [item.category, item.product_type, "*"])
    return _find_rule_days(db, "product_category", [item.category, "*"])


def resolve_repair_warranty_days(db: Session, repair: RepairTicket) -> int:
    issue_text = str(repair.issue or "").strip().lower()
    model_text = str(repair.device_model or "").strip().lower()
    tokens = [token for token in {issue_text, model_text, f"{issue_text} {model_text}".strip()} if token]
    return _find_rule_days(db, "repair_service", tokens + ["*"])


def _normalize_record_status(end_date: datetime) -> str:
    return WARRANTY_STATUS_ACTIVE if end_date >= datetime.utcnow() else WARRANTY_STATUS_EXPIRED


def _set_warranty_code(row: WarrantyRecord) -> None:
    if not row.warranty_code:
        row.warranty_code = f"WTY-{row.id:07d}"


def _set_claim_code(row: WarrantyClaim) -> None:
    if not row.claim_code:
        row.claim_code = f"CLM-{row.id:07d}"


def create_sale_warranty_records(
    db: Session,
    sale: Sale,
    sale_items: list[SaleItem],
    customer: Customer | None,
    created_by_id: int | None = None,
) -> list[WarrantyRecord]:
    if sale.is_return:
        return []

    items_by_id: dict[int, InventoryItem] = {}
    item_ids = [line.item_id for line in sale_items if line.item_id]
    if item_ids:
        rows = db.query(InventoryItem).filter(InventoryItem.id.in_(item_ids)).all()
        items_by_id = {row.id: row for row in rows}

    conditions_json = _list_active_conditions_payload(db)
    created: list[WarrantyRecord] = []
    sale_time = sale.created_at or datetime.utcnow()

    for line in sale_items:
        if not line.item_id or int(line.quantity or 0) <= 0:
            continue
        item = items_by_id.get(line.item_id)
        days = resolve_sale_item_warranty_days(db, item, line.warranty_days)
        if days <= 0:
            continue
        end_date = sale_time + timedelta(days=days)
        warranty_type = "Spare Part" if _is_spare_part(item) else "Product"
        device_brand_model = ""
        if item:
            device_brand_model = " ".join(
                [segment for segment in [item.brand, item.model, item.storage] if segment]
            ).strip()

        row = WarrantyRecord(
            invoice_id=sale.id,
            sale_item_id=line.id,
            item_id=item.id if item else None,
            customer_id=customer.id if customer else sale.customer_id,
            customer_name=customer.name if customer else "Walk-in",
            customer_phone=customer.phone if customer else None,
            product_or_service_name=item.name if item else f"Item #{line.item_id}",
            product_category=item.category if item else None,
            brand=item.brand if item else None,
            supplier_name=item.supplier.name if item and item.supplier else None,
            device_brand_model=device_brand_model or None,
            imei_or_serial=line.serial_number,
            serial_number=line.serial_number,
            warranty_type=warranty_type,
            start_date=sale_time,
            end_date=end_date,
            status=_normalize_record_status(end_date),
            quantity_covered=max(1, int(line.quantity or 1)),
            warranty_days=days,
            conditions_json=conditions_json,
            created_by_id=created_by_id,
            notes=f"Auto-created from invoice INV-{sale.id:05d}",
        )
        db.add(row)
        db.flush()
        _set_warranty_code(row)
        created.append(row)

    return created


def create_repair_warranty_record(
    db: Session,
    repair: RepairTicket,
    customer: Customer | None,
    created_by_id: int | None = None,
) -> WarrantyRecord | None:
    existing = (
        db.query(WarrantyRecord)
        .filter(
            WarrantyRecord.repair_ticket_id == repair.id,
            WarrantyRecord.warranty_type == "Repair Service",
        )
        .first()
    )
    if existing:
        return existing

    days = resolve_repair_warranty_days(db, repair)
    if days <= 0:
        return None

    start_date = repair.delivered_at or datetime.utcnow()
    end_date = start_date + timedelta(days=days)
    conditions_json = _list_active_conditions_payload(db)
    row = WarrantyRecord(
        invoice_id=None,
        repair_ticket_id=repair.id,
        sale_item_id=None,
        item_id=None,
        customer_id=customer.id if customer else repair.customer_id,
        customer_name=customer.name if customer else "Walk-in",
        customer_phone=customer.phone if customer else None,
        product_or_service_name=f"Repair Service - {repair.issue[:90] if repair.issue else repair.device_model}",
        product_category="Repair Service",
        brand=None,
        supplier_name=None,
        device_brand_model=repair.device_model,
        imei_or_serial=repair.imei,
        serial_number=repair.imei,
        warranty_type="Repair Service",
        start_date=start_date,
        end_date=end_date,
        status=_normalize_record_status(end_date),
        quantity_covered=1,
        warranty_days=days,
        conditions_json=conditions_json,
        created_by_id=created_by_id,
        notes=f"Auto-created after delivery for ticket {repair.ticket_no}",
    )
    db.add(row)
    db.flush()
    _set_warranty_code(row)
    return row


def apply_claim_status_to_warranty(warranty: WarrantyRecord, claim_status: str) -> None:
    status = str(claim_status or "").strip()
    if status == CLAIM_STATUS_REJECTED:
        warranty.status = WARRANTY_STATUS_REJECTED
        return
    if status == CLAIM_STATUS_REPLACED:
        warranty.status = WARRANTY_STATUS_REPLACED
        return
    if status == CLAIM_STATUS_REPAIRED:
        warranty.status = _normalize_record_status(warranty.end_date)
        return
    if status in {CLAIM_STATUS_PENDING, CLAIM_STATUS_APPROVED, CLAIM_STATUS_CLOSED}:
        warranty.status = WARRANTY_STATUS_CLAIMED


def stamp_claim_code(claim: WarrantyClaim) -> None:
    _set_claim_code(claim)
