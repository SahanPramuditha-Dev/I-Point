import json
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from sqlalchemy.exc import OperationalError
from pydantic import BaseModel
from typing import Any
from app.database import get_db
from app.auth import get_current_user
from app.models import (
    Sale,
    RepairTicket,
    InventoryItem,
    SaleItem,
    RepairPartUsage,
    Expense,
    ActivityLog,
    SecurityAuditLog,
    RepairHistory,
    AppSetting,
)

router = APIRouter(prefix="/reports", tags=["reports"])


class PdfExportColumn(BaseModel):
    label: str


class PdfBranding(BaseModel):
    shop_name: str | None = None
    shop_address: str | None = None
    shop_logo_text: str | None = None


class PdfExportRequest(BaseModel):
    title: str
    columns: list[PdfExportColumn]
    rows: list[list[Any]]
    branding: PdfBranding | None = None
    watermark: str | None = None
    confidential_stamp: bool = False


class ExportScheduleEntry(BaseModel):
    id: str
    report_key: str
    report_name: str
    format: str = "PDF"
    frequency: str = "Weekly"
    delivery_time: str = "09:00"
    email_to: str | None = None
    enabled: bool = True
    created_by: str | None = None
    created_at: str | None = None


class ExportHistoryEntry(BaseModel):
    report_name: str
    report_key: str | None = None
    format: str
    generated_by: str = "System"
    file_size: str = "-"
    status: str = "Success"
    generated_at: str | None = None
    notes: str | None = None
    delivery_channel: str | None = None
    email_to: str | None = None


class ExportPermissionsPayload(BaseModel):
    permissions: dict[str, dict[str, Any]]


class ExportOptionsPayload(BaseModel):
    branding: dict[str, Any] = {}
    watermark_text: str = ""
    confidential_stamp: bool = False


class ExportEmailRequest(BaseModel):
    report_name: str
    report_key: str | None = None
    format: str = "PDF"
    to_email: str
    notes: str | None = None


def _safe_parse_json(value: str | None) -> Any:
    if not value:
        return None
    try:
        return json.loads(value)
    except Exception:
        return value


def _severity_from_activity(action: str | None, description: str | None) -> str:
    action_text = str(action or "").lower()
    desc_text = str(description or "").lower()
    if action_text in {"delete", "void", "reversal"}:
        return "Critical"
    if action_text in {"adjustment", "update"}:
        return "Warning"
    if "failed" in desc_text or "error" in desc_text:
        return "Critical"
    return "Info"


def _severity_from_security_result(result: str | None, action: str | None) -> str:
    result_text = str(result or "").lower()
    action_text = str(action or "").lower()
    if result_text in {"failed", "blocked"}:
        return "Critical"
    if "failed" in action_text or "lock" in action_text:
        return "Critical"
    if "reset" in action_text or "revoke" in action_text:
        return "Warning"
    return "Info"


EXPORT_SCHEDULES_KEY = "export_center_schedules"
EXPORT_HISTORY_KEY = "export_center_history"
EXPORT_PERMISSIONS_KEY = "export_center_permissions"
EXPORT_OPTIONS_KEY = "export_center_options"
DEFAULT_EXPORT_PERMISSIONS = {
    "admin": {"can_export": True, "allowed_reports": ["*"]},
    "manager": {"can_export": True, "allowed_reports": ["overview", "sales", "repairs", "profit-loss", "inventory", "outstanding-payments", "tax-financial", "export-center"]},
    "employee": {"can_export": True, "allowed_reports": ["sales", "repairs", "inventory", "customer-reports"]},
}


def _read_setting_json(db: Session, key: str, default: Any) -> Any:
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    if not row:
        return default
    try:
        return json.loads(row.value or "null")
    except Exception:
        return default


def _write_setting_json(db: Session, key: str, value: Any) -> None:
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    payload = json.dumps(value)
    if not row:
        row = AppSetting(key=key, value=payload)
        db.add(row)
    else:
        row.value = payload
    db.commit()


def _append_export_history(db: Session, entry: dict[str, Any]) -> dict[str, Any]:
    history = _read_setting_json(db, EXPORT_HISTORY_KEY, [])
    if not isinstance(history, list):
        history = []
    history.append(entry)
    _write_setting_json(db, EXPORT_HISTORY_KEY, history)
    return entry


@router.get('/export-center/state')
def export_center_state(db: Session = Depends(get_db), user=Depends(get_current_user)):
    schedules = _read_setting_json(db, EXPORT_SCHEDULES_KEY, [])
    history = _read_setting_json(db, EXPORT_HISTORY_KEY, [])
    permissions = _read_setting_json(db, EXPORT_PERMISSIONS_KEY, DEFAULT_EXPORT_PERMISSIONS)
    options = _read_setting_json(
        db,
        EXPORT_OPTIONS_KEY,
        {"branding": {}, "watermark_text": "", "confidential_stamp": False},
    )
    return {
        "schedules": schedules if isinstance(schedules, list) else [],
        "history": history if isinstance(history, list) else [],
        "permissions": permissions if isinstance(permissions, dict) else DEFAULT_EXPORT_PERMISSIONS,
        "options": options if isinstance(options, dict) else {"branding": {}, "watermark_text": "", "confidential_stamp": False},
        "current_user": {
            "id": user.id,
            "username": user.username,
            "full_name": user.full_name,
            "role": user.role,
        },
    }


@router.put('/export-center/schedules')
def save_export_center_schedules(
    payload: list[ExportScheduleEntry],
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    if str(user.role or "").lower() not in {"admin", "manager"}:
        raise HTTPException(status_code=403, detail="Insufficient permissions to manage schedules")
    rows = [row.model_dump() for row in payload]
    _write_setting_json(db, EXPORT_SCHEDULES_KEY, rows)
    return {"ok": True, "count": len(rows)}


@router.put('/export-center/permissions')
def save_export_center_permissions(
    payload: ExportPermissionsPayload,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    if str(user.role or "").lower() != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    _write_setting_json(db, EXPORT_PERMISSIONS_KEY, payload.permissions)
    return {"ok": True}


@router.put('/export-center/options')
def save_export_center_options(
    payload: ExportOptionsPayload,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    if str(user.role or "").lower() not in {"admin", "manager"}:
        raise HTTPException(status_code=403, detail="Insufficient permissions to change branding options")
    _write_setting_json(db, EXPORT_OPTIONS_KEY, payload.model_dump())
    return {"ok": True}


@router.post('/export-center/history')
def create_export_history_entry(
    payload: ExportHistoryEntry,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    entry = payload.model_dump()
    if not entry.get("generated_at"):
        entry["generated_at"] = datetime.utcnow().isoformat()
    if not entry.get("generated_by"):
        entry["generated_by"] = user.full_name or user.username or "System"
    _append_export_history(db, entry)
    return {"ok": True, "entry": entry}


@router.post('/export-center/send-email')
def send_export_report_email(
    payload: ExportEmailRequest,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    entry = {
        "report_name": payload.report_name,
        "report_key": payload.report_key,
        "format": payload.format,
        "generated_by": user.full_name or user.username or "System",
        "file_size": "-",
        "status": "Email Queued",
        "generated_at": datetime.utcnow().isoformat(),
        "notes": payload.notes or "Email delivery requested from Export Center",
        "delivery_channel": "Email",
        "email_to": payload.to_email,
    }
    _append_export_history(db, entry)
    return {"ok": True, "queued": True, "message": "Email request queued", "entry": entry}

@router.get('/summary')
def summary(
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _=Depends(get_current_user)
):
    # Date Filtering
    sales_q = db.query(Sale)
    repair_q = db.query(RepairTicket).filter(RepairTicket.status == "Delivered")
    expense_q = db.query(Expense).filter(Expense.status.in_(["Approved", "Paid"]))
    
    if date_from:
        start_dt = datetime.fromisoformat(date_from)
        sales_q = sales_q.filter(Sale.created_at >= start_dt)
        repair_q = repair_q.filter(RepairTicket.delivered_at >= start_dt)
        expense_q = expense_q.filter(Expense.expense_date >= start_dt)
    if date_to:
        end_dt = datetime.fromisoformat(date_to) + timedelta(days=1)
        sales_q = sales_q.filter(Sale.created_at < end_dt)
        repair_q = repair_q.filter(RepairTicket.delivered_at < end_dt)
        expense_q = expense_q.filter(Expense.expense_date < end_dt)

    # Basic Stats
    sales_count = sales_q.count()
    total_sales = sales_q.filter(Sale.is_voided == False).with_entities(func.coalesce(func.sum(Sale.total), 0)).scalar() or 0
    cash_sales = sales_q.filter(Sale.is_voided == False).with_entities(func.coalesce(func.sum(Sale.cash_amount), 0)).scalar() or 0
    card_sales = sales_q.filter(Sale.is_voided == False).with_entities(func.coalesce(func.sum(Sale.card_amount), 0)).scalar() or 0
    voided_total = db.query(func.coalesce(func.sum(Sale.total), 0)).filter(Sale.is_voided == True).scalar() or 0
    
    # COGS
    active_sale_ids = sales_q.filter(Sale.is_voided == False).with_entities(Sale.id)
    cogs = db.query(func.coalesce(func.sum(SaleItem.quantity * SaleItem.cost_price), 0))\
             .filter(SaleItem.sale_id.in_(active_sale_ids)).scalar() or 0
    
    # Repair Stats
    repair_revenue = repair_q.with_entities(func.coalesce(func.sum(RepairTicket.estimated_cost), 0)).scalar() or 0
    repair_ids = repair_q.with_entities(RepairTicket.id)
    repair_parts_cost = db.query(func.coalesce(func.sum(RepairPartUsage.quantity * RepairPartUsage.unit_cost), 0))\
                          .filter(RepairPartUsage.repair_id.in_(repair_ids)).scalar() or 0
    total_expenses = expense_q.with_entities(func.coalesce(func.sum(Expense.amount), 0)).scalar() or 0
    
    # Inventory
    inventory_value = db.query(func.coalesce(func.sum(InventoryItem.quantity * InventoryItem.cost_price), 0)).scalar() or 0
    total_repairs_all_time = db.query(func.count(RepairTicket.id)).scalar() or 0
    
    total_revenue = total_sales + repair_revenue
    total_cost = cogs + repair_parts_cost
    gross_profit = total_revenue - total_cost
    net_profit = gross_profit - total_expenses
    recent_sales = sales_q.order_by(Sale.created_at.desc()).limit(10).all()

    return {
        "summary": {
            "total_revenue": total_revenue,
            "gross_profit": gross_profit,
            "sales_revenue": total_sales,
            "repair_revenue": repair_revenue,
            "expenses": total_expenses,
            "net_profit": net_profit,
        },
        "audit": {
            "cash_in_hand_expected": cash_sales + repair_revenue,
            "card_payments": card_sales,
            "voided_invoices": voided_total,
            "sales_count": sales_count,
            "expenses_total": total_expenses,
        },
        "inventory": {
            "total_value": inventory_value,
            "total_repairs": total_repairs_all_time
        },
        "recent_sales": [
            {
                "id": s.id,
                "invoice_no": f"INV-{s.id:05d}",
                "total": s.total,
                "is_voided": s.is_voided,
                "payment_method": s.payment_method,
                "created_at": s.created_at.isoformat()
            } for s in recent_sales
        ]
    }


@router.get('/expenses')
def detailed_expenses_report(
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _=Depends(get_current_user)
):
    exp_q = db.query(Expense).options(joinedload(Expense.created_by), joinedload(Expense.approved_by), joinedload(Expense.supplier))
    if date_from:
        exp_q = exp_q.filter(Expense.expense_date >= datetime.fromisoformat(date_from))
    if date_to:
        exp_q = exp_q.filter(Expense.expense_date < datetime.fromisoformat(date_to) + timedelta(days=1))

    rows = exp_q.order_by(Expense.expense_date.desc(), Expense.created_at.desc()).all()
    return [
        {
            "id": row.id,
            "expense_code": row.expense_code,
            "expense_date": row.expense_date.isoformat() if row.expense_date else None,
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "category": row.category,
            "description": row.description,
            "amount": float(row.amount or 0),
            "payment_method": row.payment_method,
            "status": row.status,
            "supplier_id": row.supplier_id,
            "supplier_name": row.supplier.name if row.supplier else None,
            "vendor_name": row.vendor_name or (row.supplier.name if row.supplier else None),
            "reference_no": row.reference_no,
            "is_recurring": bool(row.is_recurring),
            "recurring_cycle": row.recurring_cycle,
            "created_by": row.created_by.full_name if row.created_by and row.created_by.full_name else (row.created_by.username if row.created_by else "System"),
            "approved_by": row.approved_by.full_name if row.approved_by and row.approved_by.full_name else (row.approved_by.username if row.approved_by else None),
            "approved_at": row.approved_at.isoformat() if row.approved_at else None,
            "rejection_reason": row.rejection_reason,
            "paid_at": row.paid_at.isoformat() if row.paid_at else None,
            "notes": row.notes,
            # Compatibility aliases
            "po_number": row.expense_code,
            "total_cost": float(row.amount or 0),
            "note": row.description or row.notes,
        }
        for row in rows
    ]


@router.get('/audit-activity')
def audit_activity_report(
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    limit: int = Query(default=500, ge=50, le=2000),
    db: Session = Depends(get_db),
    _=Depends(get_current_user)
):
    activity_q = db.query(ActivityLog).options(joinedload(ActivityLog.user))
    security_q = db.query(SecurityAuditLog).options(joinedload(SecurityAuditLog.user))
    start_dt = datetime.fromisoformat(date_from) if date_from else None
    end_dt_exclusive = (datetime.fromisoformat(date_to) + timedelta(days=1)) if date_to else None

    if start_dt:
        activity_q = activity_q.filter(ActivityLog.created_at >= start_dt)
        security_q = security_q.filter(SecurityAuditLog.created_at >= start_dt - timedelta(days=1))
    if end_dt_exclusive:
        activity_q = activity_q.filter(ActivityLog.created_at < end_dt_exclusive)
        security_q = security_q.filter(SecurityAuditLog.created_at < end_dt_exclusive + timedelta(days=1))

    activity_logs = activity_q.order_by(ActivityLog.created_at.desc()).limit(limit).all()
    try:
        security_logs = security_q.order_by(SecurityAuditLog.created_at.desc()).limit(max(limit * 6, 1200)).all()
    except OperationalError:
        security_logs = []

    security_by_user: dict[int, list[SecurityAuditLog]] = {}
    for security_log in security_logs:
        if security_log.user_id is None:
            continue
        security_by_user.setdefault(int(security_log.user_id), []).append(security_log)

    def _best_security_match(log: ActivityLog) -> SecurityAuditLog | None:
        if log.user_id is None or not log.created_at:
            return None
        candidates = security_by_user.get(int(log.user_id), [])
        if not candidates:
            return None
        best: SecurityAuditLog | None = None
        best_distance = 9_999_999.0
        for candidate in candidates:
            if not candidate.created_at:
                continue
            distance = abs((candidate.created_at - log.created_at).total_seconds())
            if distance < best_distance:
                best_distance = distance
                best = candidate
            if best_distance <= 60:
                break
        if best and best_distance <= 3600:
            return best
        return None

    rows = []
    for log in activity_logs:
        user_name = "System"
        if log.user:
            user_name = log.user.full_name or log.user.username or "System"
        matched_security = _best_security_match(log)
        rows.append({
            "id": log.id,
            "source": "activity_log",
            "timestamp": log.created_at.isoformat() if log.created_at else None,
            "user_id": log.user_id,
            "user": user_name,
            "action_type": log.action,
            "module": log.entity_type,
            "record_id": log.entity_id,
            "description": log.description,
            "old_value": _safe_parse_json(log.old_value),
            "new_value": _safe_parse_json(log.new_value),
            "old_value_raw": log.old_value,
            "new_value_raw": log.new_value,
            "recoverable": bool(log.is_reversible) and not bool(log.is_reversed),
            "is_reversed": bool(log.is_reversed),
            "severity": _severity_from_activity(log.action, log.description),
            "ip_address": matched_security.ip_address if matched_security else None,
            "device": matched_security.device_info if matched_security else None,
        })

    for log in security_logs:
        user_name = "System"
        if log.user:
            user_name = log.user.full_name or log.user.username or "System"
        rows.append({
            "id": f"sec-{log.id}",
            "source": "security_audit",
            "timestamp": log.created_at.isoformat() if log.created_at else None,
            "user_id": log.user_id,
            "user": user_name,
            "action_type": log.action,
            "module": log.target_type or "Security",
            "record_id": log.target_id,
            "description": log.detail or log.target_ref or "Security audit event",
            "old_value": None,
            "new_value": _safe_parse_json(log.metadata_json),
            "old_value_raw": None,
            "new_value_raw": log.metadata_json,
            "recoverable": False,
            "is_reversed": False,
            "severity": _severity_from_security_result(log.result, log.action),
            "ip_address": log.ip_address,
            "device": log.device_info,
        })

    rows.sort(key=lambda row: row.get("timestamp") or "", reverse=True)
    return rows[:limit]


@router.get('/audit-repair-history')
def audit_repair_history_report(
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    limit: int = Query(default=1000, ge=100, le=3000),
    db: Session = Depends(get_db),
    _=Depends(get_current_user)
):
    query = (
        db.query(RepairHistory, RepairTicket)
        .join(RepairTicket, RepairTicket.id == RepairHistory.repair_id)
    )
    if date_from:
        query = query.filter(RepairHistory.created_at >= datetime.fromisoformat(date_from))
    if date_to:
        query = query.filter(RepairHistory.created_at < datetime.fromisoformat(date_to) + timedelta(days=1))

    rows = query.order_by(RepairHistory.created_at.desc()).limit(limit).all()
    output = []
    for history, ticket in rows:
        note = history.note or ""
        old_status = None
        lower_note = note.lower()
        if "changed from" in lower_note and " to " in lower_note:
            try:
                after_from = note.split("from", 1)[1]
                old_status = after_from.split("to", 1)[0].strip(" .:-")
            except Exception:
                old_status = None
        output.append({
            "id": history.id,
            "timestamp": history.created_at.isoformat() if history.created_at else None,
            "repair_id": history.repair_id,
            "job_id": ticket.ticket_no if ticket and ticket.ticket_no else f"Repair #{history.repair_id}",
            "old_status": old_status,
            "new_status": history.status,
            "changed_by": "System",
            "notes": note,
        })
    return output

@router.get('/export-sales')
def export_sales(
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    import csv
    import io
    from fastapi.responses import StreamingResponse
    
    sales_q = db.query(Sale)
    if date_from:
        sales_q = sales_q.filter(Sale.created_at >= datetime.fromisoformat(date_from))
    if date_to:
        sales_q = sales_q.filter(Sale.created_at < datetime.fromisoformat(date_to) + timedelta(days=1))
    
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Invoice No", "Date", "Customer ID", "Payment Method", "Subtotal", "Total", "Is Return", "Voided"])
    
    for s in sales_q.all():
        writer.writerow([f"INV-{s.id:05d}", s.created_at.isoformat(), s.customer_id, s.payment_method, s.subtotal, s.total, s.is_return, s.is_voided])
    
    csv_content = output.getvalue()
    _append_export_history(db, {
        "report_name": "Sales Report",
        "report_key": "sales",
        "format": "CSV",
        "generated_by": user.full_name or user.username or "System",
        "file_size": f"{len(csv_content.encode('utf-8')) / 1024:.1f} KB",
        "status": "Success",
        "generated_at": datetime.utcnow().isoformat(),
        "notes": f"Backend export {date_from or '-'} to {date_to or '-'}",
    })
    output.seek(0)
    return StreamingResponse(
        output, 
        media_type="text/csv", 
        headers={"Content-Disposition": f"attachment; filename=sales_report_{datetime.now().strftime('%Y%m%d')}.csv"}
    )

@router.get('/export-repairs')
def export_repairs(
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    import csv
    import io
    from fastapi.responses import StreamingResponse
    
    rep_q = db.query(RepairTicket)
    if date_from:
        rep_q = rep_q.filter(RepairTicket.created_at >= datetime.fromisoformat(date_from))
    if date_to:
        rep_q = rep_q.filter(RepairTicket.created_at < datetime.fromisoformat(date_to) + timedelta(days=1))
    
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Ticket No", "Intake Date", "Delivery Date", "Customer ID", "Device", "Status", "Est Cost", "Advance Paid"])
    
    for r in rep_q.all():
        writer.writerow([r.ticket_no, r.created_at.isoformat(), r.delivered_at.isoformat() if r.delivered_at else "", r.customer_id, r.device_model, r.status, r.estimated_cost, r.advance_payment])
    
    csv_content = output.getvalue()
    _append_export_history(db, {
        "report_name": "Repairs Report",
        "report_key": "repairs",
        "format": "CSV",
        "generated_by": user.full_name or user.username or "System",
        "file_size": f"{len(csv_content.encode('utf-8')) / 1024:.1f} KB",
        "status": "Success",
        "generated_at": datetime.utcnow().isoformat(),
        "notes": f"Backend export {date_from or '-'} to {date_to or '-'}",
    })
    output.seek(0)
    return StreamingResponse(
        output, 
        media_type="text/csv", 
        headers={"Content-Disposition": f"attachment; filename=repairs_report_{datetime.now().strftime('%Y%m%d')}.csv"}
    )

@router.get('/export-inventory')
def export_inventory(
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    import csv
    import io
    from fastapi.responses import StreamingResponse
    
    inv_q = db.query(InventoryItem)
    
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["SKU/Barcode", "Product Name", "Quantity", "Cost Price", "Retail Price", "Asset Value", "Potential Revenue"])
    
    for i in inv_q.all():
        writer.writerow([i.barcode or i.sku, i.name, i.quantity, i.cost_price, i.sale_price, i.quantity * i.cost_price, i.quantity * i.sale_price])
    
    csv_content = output.getvalue()
    _append_export_history(db, {
        "report_name": "Inventory Report",
        "report_key": "inventory",
        "format": "CSV",
        "generated_by": user.full_name or user.username or "System",
        "file_size": f"{len(csv_content.encode('utf-8')) / 1024:.1f} KB",
        "status": "Success",
        "generated_at": datetime.utcnow().isoformat(),
        "notes": "Backend inventory export",
    })
    output.seek(0)
    return StreamingResponse(
        output, 
        media_type="text/csv", 
        headers={"Content-Disposition": f"attachment; filename=inventory_report_{datetime.now().strftime('%Y%m%d')}.csv"}
    )

@router.get('/sales')
def detailed_sales_report(
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _=Depends(get_current_user)
):
    sales_q = db.query(Sale)
    if date_from:
        start_dt = datetime.fromisoformat(date_from)
        sales_q = sales_q.filter(Sale.created_at >= start_dt)
    if date_to:
        end_dt = datetime.fromisoformat(date_to) + timedelta(days=1)
        sales_q = sales_q.filter(Sale.created_at < end_dt)

    sales = sales_q.options(joinedload(Sale.customer)).order_by(Sale.created_at.desc()).all()
    sale_ids = [s.id for s in sales]

    sale_lines_map: dict[int, list[dict[str, Any]]] = {}
    line_count_map: dict[int, int] = {}
    item_qty_map: dict[int, int] = {}
    if sale_ids:
        line_rows = (
            db.query(SaleItem, InventoryItem)
            .outerjoin(InventoryItem, InventoryItem.id == SaleItem.item_id)
            .filter(SaleItem.sale_id.in_(sale_ids))
            .all()
        )
        for line, item in line_rows:
            sale_lines_map.setdefault(line.sale_id, []).append({
                "item_id": line.item_id,
                "item_name": item.name if item else f"Item #{line.item_id}",
                "category": item.category if item else "Unknown",
                "quantity": int(line.quantity or 0),
                "unit_price": float(line.price or 0),
                "line_revenue": float((line.quantity or 0) * (line.price or 0)),
                "line_cost": float((line.quantity or 0) * (line.cost_price or 0)),
                "line_profit": float((line.quantity or 0) * ((line.price or 0) - (line.cost_price or 0))),
            })
            line_count_map[line.sale_id] = line_count_map.get(line.sale_id, 0) + 1
            item_qty_map[line.sale_id] = item_qty_map.get(line.sale_id, 0) + abs(int(line.quantity or 0))

    cancel_meta_map: dict[int, dict[str, Any]] = {}
    if sale_ids:
        void_logs = (
            db.query(ActivityLog)
            .options(joinedload(ActivityLog.user))
            .filter(
                ActivityLog.entity_type == "Sale",
                ActivityLog.action == "Void",
                ActivityLog.entity_id.in_(sale_ids),
            )
            .order_by(ActivityLog.created_at.desc())
            .all()
        )
        for log in void_logs:
            if log.entity_id in cancel_meta_map:
                continue
            cancel_meta_map[log.entity_id] = {
                "cancelled_at": log.created_at.isoformat() if log.created_at else None,
                "cancelled_by": log.user.full_name if log.user and log.user.full_name else (
                    log.user.username if log.user and log.user.username else "Unknown"
                ),
            }

    def payment_split(sale: Sale) -> tuple[float, float, float]:
        cash = float(sale.cash_amount or 0)
        card = float(sale.card_amount or 0)
        credit = max(0.0, float(sale.total or 0) - cash - card)
        return cash, card, credit

    def invoice_type(sale: Sale, credit_amt: float) -> str:
        if not sale.paid:
            return "Pending"
        method = str(sale.payment_method or "").lower()
        if credit_amt > 0 or "credit" in method or "partial" in method or "due" in method:
            return "Partial"
        return "Full"

    def status_label(sale: Sale) -> str:
        if sale.is_voided:
            return "Cancelled"
        if sale.is_return:
            return "Refunded"
        if not sale.paid:
            return "Pending"
        return "Paid"

    output = []
    for s in sales:
        cash_amount, card_amount, credit_amount = payment_split(s)
        output.append({
            "id": s.id,
            "invoice_no": f"INV-{s.id:05d}",
            "subtotal": s.subtotal,
            "discount_amount": s.discount_amount,
            "tax_amount": s.tax_amount,
            "total": s.total,
            "payment_method": s.payment_method,
            "cash_amount": cash_amount,
            "card_amount": card_amount,
            "credit_amount": credit_amount,
            "paid": s.paid,
            "is_voided": s.is_voided,
            "is_return": s.is_return,
            "status": status_label(s),
            "invoice_type": invoice_type(s, credit_amount),
            "void_reason": s.void_reason,
            "cancelled_at": cancel_meta_map.get(s.id, {}).get("cancelled_at"),
            "cancelled_by": cancel_meta_map.get(s.id, {}).get("cancelled_by"),
            "created_at": s.created_at.isoformat(),
            "customer_id": s.customer_id,
            "customer_name": s.customer.name if s.customer else "Walk-in",
            "cashier": "N/A",
            "line_count": line_count_map.get(s.id, 0),
            "item_qty": item_qty_map.get(s.id, 0),
            "lines": sale_lines_map.get(s.id, []),
        })
    return output

@router.get('/repairs')
def detailed_repairs_report(
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _=Depends(get_current_user)
):
    def classify_issue(issue_text: str | None) -> str:
        text = str(issue_text or "").lower()
        if any(token in text for token in ["screen", "display", "touch", "glass"]):
            return "Screen"
        if any(token in text for token in ["battery", "drain", "charging fast drop"]):
            return "Battery"
        if any(token in text for token in ["charge", "charging", "port", "usb"]):
            return "Charging"
        if any(token in text for token in ["software", "os", "boot", "update", "slow", "hang", "stuck"]):
            return "Software"
        if any(token in text for token in ["camera", "lens", "focus"]):
            return "Camera"
        if any(token in text for token in ["audio", "mic", "speaker", "earpiece"]):
            return "Audio"
        if any(token in text for token in ["water", "liquid", "moist"]):
            return "Water Damage"
        if any(token in text for token in ["wifi", "bluetooth", "network", "signal"]):
            return "Network"
        if any(token in text for token in ["board", "ic", "power", "motherboard"]):
            return "Hardware"
        return "General"

    def extract_brand_model(device_text: str | None) -> tuple[str, str]:
        raw = str(device_text or "").strip()
        if not raw:
            return "Unknown", "Unknown"
        known_brands = [
            "Apple", "Samsung", "Xiaomi", "Redmi", "Vivo", "Oppo", "Huawei", "Realme", "Nokia", "Google",
        ]
        tokens = raw.split()
        first = tokens[0] if tokens else raw
        brand = next((b for b in known_brands if first.lower().startswith(b.lower())), first)
        model = raw[len(brand):].strip() if raw.lower().startswith(brand.lower()) else " ".join(tokens[1:]).strip()
        return brand or "Unknown", model or raw

    now_utc = datetime.utcnow()
    rep_q = db.query(RepairTicket)
    if date_from:
        start_dt = datetime.fromisoformat(date_from)
        rep_q = rep_q.filter(RepairTicket.created_at >= start_dt)
    if date_to:
        end_dt = datetime.fromisoformat(date_to) + timedelta(days=1)
        rep_q = rep_q.filter(RepairTicket.created_at < end_dt)

    tickets = (
        rep_q.options(joinedload(RepairTicket.customer))
        .order_by(RepairTicket.created_at.desc())
        .all()
    )
    repair_ids = [t.id for t in tickets]

    parts_by_repair: dict[int, list[dict[str, Any]]] = {}
    parts_total_by_repair: dict[int, float] = {}
    parts_qty_by_repair: dict[int, int] = {}
    if repair_ids:
        part_rows = (
            db.query(RepairPartUsage)
            .options(joinedload(RepairPartUsage.item).joinedload(InventoryItem.supplier))
            .filter(RepairPartUsage.repair_id.in_(repair_ids))
            .all()
        )
        for part in part_rows:
            line_total = float((part.quantity or 0) * (part.unit_cost or 0))
            parts_by_repair.setdefault(part.repair_id, []).append({
                "part_id": part.item_id,
                "part_name": part.item.name if part.item else f"Item #{part.item_id}",
                "supplier": part.item.supplier.name if part.item and part.item.supplier else "Unknown",
                "quantity": int(part.quantity or 0),
                "unit_cost": float(part.unit_cost or 0),
                "line_cost": line_total,
            })
            parts_total_by_repair[part.repair_id] = parts_total_by_repair.get(part.repair_id, 0.0) + line_total
            parts_qty_by_repair[part.repair_id] = parts_qty_by_repair.get(part.repair_id, 0) + int(part.quantity or 0)

    cancellation_map: dict[int, dict[str, Any]] = {}
    if repair_ids:
        cancel_rows = (
            db.query(RepairHistory)
            .filter(
                RepairHistory.repair_id.in_(repair_ids),
                RepairHistory.status == "Cancelled",
            )
            .order_by(RepairHistory.created_at.desc())
            .all()
        )
        for row in cancel_rows:
            if row.repair_id in cancellation_map:
                continue
            cancellation_map[row.repair_id] = {
                "cancelled_at": row.created_at.isoformat() if row.created_at else None,
                "cancellation_reason": row.note or "No reason specified",
            }

    repeat_counter: dict[tuple[str, str], int] = {}
    for ticket in tickets:
        imei_key = (ticket.imei or "").strip()
        issue_key = classify_issue(ticket.issue)
        if not imei_key:
            continue
        key = (imei_key, issue_key)
        repeat_counter[key] = repeat_counter.get(key, 0) + 1

    output = []
    for t in tickets:
        parts_cost_total = float(parts_total_by_repair.get(t.id, 0.0))
        completion_dt = t.delivered_at or now_utc
        time_taken_hours = 0.0
        if t.created_at and completion_dt:
            time_taken_hours = max(0.0, round((completion_dt - t.created_at).total_seconds() / 3600, 2))

        estimated_labor_cost = max(0.0, float(t.estimated_cost or 0) - parts_cost_total)
        # Proxy labor cost model (time-based) for quote variance tracking where no explicit final labor entry exists.
        hourly_rate = 850.0
        actual_labor_cost = max(estimated_labor_cost, round(time_taken_hours * hourly_rate, 2))
        actual_cost = round(parts_cost_total + actual_labor_cost, 2)
        cost_variance = round(actual_cost - float(t.estimated_cost or 0), 2)
        job_profitability = round(float(t.estimated_cost or 0) - actual_cost, 2)

        is_closed = str(t.status or "").lower() in {"completed", "delivered", "cancelled"}
        sla_breached = False
        if t.estimated_completion:
            if t.delivered_at:
                sla_breached = t.delivered_at > t.estimated_completion
            elif not is_closed:
                sla_breached = now_utc > t.estimated_completion

        issue_type = classify_issue(t.issue)
        repair_type = issue_type
        brand, model = extract_brand_model(t.device_model)
        repeat_key = ((t.imei or "").strip(), issue_type)
        is_repeat_repair = bool(repeat_key[0]) and repeat_counter.get(repeat_key, 0) > 1
        warranty_claim = str(t.warranty_status or "").lower() not in {"", "none", "no"}

        output.append({
            "id": t.id,
            "ticket_no": t.ticket_no,
            "customer_id": t.customer_id,
            "customer_name": t.customer.name if t.customer else "Unknown",
            "device": t.device_model,
            "device_brand": brand,
            "device_model_name": model,
            "imei": t.imei,
            "issue": t.issue,
            "issue_type": issue_type,
            "repair_type": repair_type,
            "status": t.status,
            "priority": t.priority,
            "technician": t.technician,
            "warranty_status": t.warranty_status,
            "warranty_claim": warranty_claim,
            "estimated_cost": float(t.estimated_cost or 0),
            "advance_payment": float(t.advance_payment or 0),
            "parts_cost_total": parts_cost_total,
            "parts_qty_total": int(parts_qty_by_repair.get(t.id, 0)),
            "estimated_labor_cost": estimated_labor_cost,
            "labor_cost": actual_labor_cost,
            "actual_cost": actual_cost,
            "cost_variance": cost_variance,
            "job_profitability": job_profitability,
            "created_at": t.created_at.isoformat() if t.created_at else None,
            "delivered_at": t.delivered_at.isoformat() if t.delivered_at else None,
            "estimated_completion": t.estimated_completion.isoformat() if t.estimated_completion else None,
            "time_taken_hours": time_taken_hours,
            "sla_breached": sla_breached,
            "is_repeat_repair": is_repeat_repair,
            "customer_rating": None,
            "cancellation_reason": cancellation_map.get(t.id, {}).get("cancellation_reason"),
            "cancelled_at": cancellation_map.get(t.id, {}).get("cancelled_at"),
            "parts_lines": parts_by_repair.get(t.id, []),
        })

    return output

@router.get('/inventory')
def detailed_inventory_report(
    db: Session = Depends(get_db),
    _=Depends(get_current_user)
):
    items = db.query(InventoryItem).all()
    return [{
        "id": i.id,
        "name": i.name,
        "category": i.category,
        "brand": i.brand,
        "supplier_id": i.supplier_id,
        "quantity": i.quantity,
        "low_stock_threshold": i.low_stock_threshold,
        "cost_price": i.cost_price,
        "sale_price": i.sale_price,
        "total_value": i.quantity * i.cost_price,
        "potential_revenue": i.quantity * i.sale_price
    } for i in items]


@router.post('/export-pdf')
def export_pdf_report(
    payload: PdfExportRequest,
    db: Session = Depends(get_db),
    user=Depends(get_current_user)
):
    import io
    from datetime import datetime
    from fastapi.responses import StreamingResponse
    from fpdf import FPDF

    pdf = FPDF(orientation="L", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=12)
    pdf.add_page()

    if payload.watermark:
        pdf.set_text_color(232, 232, 232)
        pdf.set_font("Helvetica", "B", 36)
        pdf.text(70, 110, str(payload.watermark)[:45])
        pdf.set_text_color(0, 0, 0)

    if payload.confidential_stamp:
        pdf.set_text_color(180, 0, 0)
        pdf.set_font("Helvetica", "B", 12)
        pdf.set_xy(243, 8)
        pdf.cell(35, 7, "CONFIDENTIAL", border=1, align="C")
        pdf.set_text_color(0, 0, 0)

    if payload.branding:
        pdf.set_font("Helvetica", "B", 12)
        pdf.cell(0, 7, str(payload.branding.shop_name or "").strip()[:90], ln=True)
        if payload.branding.shop_address:
            pdf.set_font("Helvetica", "", 8)
            pdf.set_text_color(90, 90, 90)
            pdf.cell(0, 5, str(payload.branding.shop_address).strip()[:120], ln=True)
            pdf.set_text_color(0, 0, 0)
        if payload.branding.shop_logo_text:
            pdf.set_xy(220, 10)
            pdf.set_font("Helvetica", "B", 9)
            pdf.cell(55, 6, str(payload.branding.shop_logo_text)[:30], border=1, align="C")
        pdf.ln(1)

    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(0, 10, payload.title[:90], ln=True)
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(100, 100, 100)
    pdf.cell(0, 6, f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}", ln=True)
    pdf.ln(2)
    pdf.set_text_color(0, 0, 0)

    col_count = max(1, len(payload.columns))
    table_width = 277.0
    col_width = table_width / col_count

    pdf.set_font("Helvetica", "B", 8)
    pdf.set_fill_color(232, 240, 255)
    for col in payload.columns:
        pdf.cell(col_width, 7, str(col.label)[:30], border=1, align="L", fill=True)
    pdf.ln()

    pdf.set_font("Helvetica", "", 8)
    for row in payload.rows:
        for idx in range(col_count):
            value = row[idx] if idx < len(row) else ""
            cell_text = str(value if value is not None else "")[:30]
            pdf.cell(col_width, 6, cell_text, border=1, align="L")
        pdf.ln()

    pdf_bytes = pdf.output()
    _append_export_history(db, {
        "report_name": payload.title,
        "report_key": "export-center",
        "format": "PDF",
        "generated_by": user.full_name or user.username or "System",
        "file_size": f"{len(pdf_bytes) / 1024:.1f} KB",
        "status": "Success",
        "generated_at": datetime.utcnow().isoformat(),
        "notes": "PDF export generated",
    })
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename={payload.title.lower().replace(' ', '_')}_{datetime.now().strftime('%Y%m%d')}.pdf"
        },
    )
