from datetime import datetime, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import and_
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import AppSetting, InventoryItem, Notification, RepairTicket, Sale, WarrantyRecord

router = APIRouter(prefix="/notifications", tags=["notifications"])


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    text = str(value).strip()
    if text.endswith("Z"):
        text = text[:-1]
    try:
        return datetime.fromisoformat(text)
    except Exception:
        return None


def _exists_recent(
    db: Session,
    *,
    notif_type: str,
    title: str,
    entity_type: str | None,
    entity_id: int | None,
    since: datetime,
) -> bool:
    query = db.query(Notification).filter(
        Notification.type == notif_type,
        Notification.title == title,
        Notification.created_at >= since,
    )
    if entity_type is None:
        query = query.filter(Notification.entity_type.is_(None))
    else:
        query = query.filter(Notification.entity_type == entity_type)
    if entity_id is None:
        query = query.filter(Notification.entity_id.is_(None))
    else:
        query = query.filter(Notification.entity_id == entity_id)
    return query.first() is not None


def _add_notification(
    db: Session,
    *,
    notif_type: str,
    title: str,
    message: str,
    entity_type: str | None = None,
    entity_id: int | None = None,
) -> bool:
    dedupe_since = datetime.utcnow() - timedelta(hours=24)
    if _exists_recent(
        db,
        notif_type=notif_type,
        title=title,
        entity_type=entity_type,
        entity_id=entity_id,
        since=dedupe_since,
    ):
        return False
    db.add(
        Notification(
            type=notif_type,
            title=title,
            message=message,
            entity_type=entity_type,
            entity_id=entity_id,
            is_read=False,
            created_at=datetime.utcnow(),
        )
    )
    return True


def _refresh_notifications(db: Session) -> dict:
    now = datetime.utcnow()
    created = 0

    low_stock_items = (
        db.query(InventoryItem)
        .filter(InventoryItem.quantity <= InventoryItem.low_stock_threshold)
        .order_by(InventoryItem.quantity.asc())
        .limit(50)
        .all()
    )
    for item in low_stock_items:
        title = f"Low Stock: {item.name}"
        message = f"{item.name} stock is {int(item.quantity or 0)} (threshold {int(item.low_stock_threshold or 0)})."
        if _add_notification(
            db,
            notif_type="Low Stock",
            title=title,
            message=message,
            entity_type="InventoryItem",
            entity_id=item.id,
        ):
            created += 1

    overdue_repairs = (
        db.query(RepairTicket)
        .filter(
            RepairTicket.estimated_completion.isnot(None),
            RepairTicket.estimated_completion < now,
            RepairTicket.status.notin_(["Delivered", "Cancelled"]),
        )
        .order_by(RepairTicket.estimated_completion.asc())
        .limit(50)
        .all()
    )
    for repair in overdue_repairs:
        title = f"Overdue Repair: {repair.ticket_no}"
        message = f"Repair {repair.ticket_no} for {repair.device_model} is overdue."
        if _add_notification(
            db,
            notif_type="Overdue Repair",
            title=title,
            message=message,
            entity_type="RepairTicket",
            entity_id=repair.id,
        ):
            created += 1

    pending_sales = (
        db.query(Sale)
        .filter(
            Sale.paid == False,  # noqa: E712
            Sale.is_voided == False,  # noqa: E712
            Sale.is_return == False,  # noqa: E712
            Sale.total > 0,
        )
        .order_by(Sale.created_at.desc())
        .limit(50)
        .all()
    )
    for sale in pending_sales:
        title = f"Pending Balance: INV-{sale.id:05d}"
        message = f"Invoice INV-{sale.id:05d} has outstanding payment of LKR {round(float(sale.total or 0), 2):,.2f}."
        if _add_notification(
            db,
            notif_type="Pending Balance",
            title=title,
            message=message,
            entity_type="Sale",
            entity_id=sale.id,
        ):
            created += 1

    warranty_horizon = now + timedelta(days=7)
    expiring_warranties = (
        db.query(WarrantyRecord)
        .filter(
            WarrantyRecord.status == "Active",
            WarrantyRecord.end_date.isnot(None),
            and_(WarrantyRecord.end_date >= now, WarrantyRecord.end_date <= warranty_horizon),
        )
        .order_by(WarrantyRecord.end_date.asc())
        .limit(50)
        .all()
    )
    for warranty in expiring_warranties:
        title = f"Warranty Expiry: {warranty.warranty_code}"
        message = (
            f"Warranty {warranty.warranty_code} for {warranty.product_or_service_name} "
            f"expires on {warranty.end_date.date().isoformat()}."
        )
        if _add_notification(
            db,
            notif_type="Warranty Expiry",
            title=title,
            message=message,
            entity_type="WarrantyRecord",
            entity_id=warranty.id,
        ):
            created += 1

    last_backup_row = db.query(AppSetting).filter(AppSetting.key == "last_backup_at").first()
    last_backup_at = _parse_dt(last_backup_row.value if last_backup_row else None)
    if not last_backup_at or (now - last_backup_at) > timedelta(hours=48):
        title = "Backup Stale"
        message = (
            "No successful backup found in the last 48 hours."
            if not last_backup_at
            else f"Last backup was at {last_backup_at.isoformat()}."
        )
        if _add_notification(
            db,
            notif_type="Backup Warning",
            title=title,
            message=message,
            entity_type="Backup",
            entity_id=None,
        ):
            created += 1

    db.commit()
    return {
        "created": created,
        "low_stock_count": len(low_stock_items),
        "overdue_repairs_count": len(overdue_repairs),
        "pending_sales_count": len(pending_sales),
        "warranty_expiry_count": len(expiring_warranties),
    }


@router.get("")
def list_notifications(db: Session = Depends(get_db), _=Depends(get_current_user)):
    _refresh_notifications(db)
    return db.query(Notification).order_by(Notification.created_at.desc()).limit(100).all()


@router.post("/refresh")
def refresh_notifications(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return _refresh_notifications(db)


@router.put("/{nid}/read")
def mark_read(nid: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    n = db.query(Notification).filter(Notification.id == nid).first()
    if n:
        n.is_read = True
        db.commit()
    return {"ok": True}


@router.put("/read-all")
def mark_all_read(db: Session = Depends(get_db), _=Depends(get_current_user)):
    db.query(Notification).filter(Notification.is_read == False).update({"is_read": True})  # noqa: E712
    db.commit()
    return {"ok": True}


@router.delete("/clear-all")
def clear_all(db: Session = Depends(get_db), _=Depends(get_current_user)):
    db.query(Notification).delete()
    db.commit()
    return {"ok": True}
