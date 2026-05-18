import csv
import io
import json
import math
import re
import uuid
import zipfile
from datetime import datetime
from typing import Any
from xml.sax.saxutils import escape as xml_escape

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user
from app.config import settings
from app.database import get_db
from app.models import (
    ActivityLog,
    AppSetting,
    Customer,
    Expense,
    InventoryItem,
    RepairTicket,
    Sale,
    Supplier,
    User,
)
from app.services.activity_service import log_activity
from app.services.backup_service import create_backup, list_backup_filenames, restore_backup

router = APIRouter(prefix="/backup", tags=["backup"])

RESTORE_REQUESTS_KEY = "backup_restore_requests_v1"
MAX_RESTORE_REQUESTS = 400


class BackupExportRequest(BaseModel):
    format: str = "CSV"  # CSV | Excel | JSON
    products_inventory: bool = True
    customers: bool = True
    suppliers: bool = True
    sales_invoices: bool = True
    repair_jobs: bool = True
    expenses: bool = True
    audit_logs: bool = True


class RestoreRequestCreateIn(BaseModel):
    filename: str
    reason: str = ""


class RestoreRequestDecisionIn(BaseModel):
    note: str = ""


def _now_iso() -> str:
    return datetime.utcnow().isoformat()


def _role_level(role: str | None) -> int:
    name = str(role or "").strip().lower()
    mapping = {
        "owner": 5,
        "admin": 4,
        "manager": 3,
        "technician": 2,
        "cashier / staff": 1,
        "cashier": 1,
        "staff": 1,
        "employee": 1,
        "view only": 0,
        "viewer": 0,
    }
    return mapping.get(name, 1)


def _can_approve_restore(user: User) -> bool:
    return _role_level(user.role) >= 3


def _can_execute_restore(user: User) -> bool:
    return _role_level(user.role) >= 4


def _get_app_setting(db: Session, key: str, fallback: Any) -> Any:
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    if not row or not row.value:
        return fallback
    try:
        parsed = json.loads(row.value)
        return parsed
    except Exception:
        return fallback


def _set_app_setting(db: Session, key: str, value: Any) -> None:
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    payload = json.dumps(value, ensure_ascii=False)
    if row:
        row.value = payload
    else:
        db.add(AppSetting(key=key, value=payload))
    db.commit()


def _load_restore_requests(db: Session) -> list[dict[str, Any]]:
    payload = _get_app_setting(db, RESTORE_REQUESTS_KEY, [])
    if not isinstance(payload, list):
        return []
    rows = [row for row in payload if isinstance(row, dict)]
    rows.sort(key=lambda r: str(r.get("requested_at") or ""), reverse=True)
    return rows


def _save_restore_requests(db: Session, rows: list[dict[str, Any]]) -> None:
    clipped = rows[:MAX_RESTORE_REQUESTS]
    _set_app_setting(db, RESTORE_REQUESTS_KEY, clipped)


def _find_restore_request(rows: list[dict[str, Any]], request_id: str) -> tuple[int, dict[str, Any] | None]:
    for idx, row in enumerate(rows):
        if str(row.get("request_id")) == str(request_id):
            return idx, row
    return -1, None


def _sanitize_sheet_name(name: str, used: set[str]) -> str:
    cleaned = re.sub(r"[\[\]\*\?/\\:]", "_", str(name or "Sheet")).strip() or "Sheet"
    cleaned = cleaned[:31]
    base = cleaned
    n = 1
    while cleaned in used:
        suffix = f"_{n}"
        cleaned = f"{base[: max(1, 31 - len(suffix))]}{suffix}"
        n += 1
    used.add(cleaned)
    return cleaned


def _excel_col_name(index_zero_based: int) -> str:
    n = index_zero_based + 1
    letters = []
    while n:
        n, rem = divmod(n - 1, 26)
        letters.append(chr(65 + rem))
    return "".join(reversed(letters))


def _is_number(value: Any) -> bool:
    if isinstance(value, bool):
        return False
    if isinstance(value, (int, float)):
        if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
            return False
        return True
    return False


def _cell_xml(cell_ref: str, value: Any) -> str:
    if value is None:
        return f'<c r="{cell_ref}" t="inlineStr"><is><t></t></is></c>'
    if isinstance(value, bool):
        return f'<c r="{cell_ref}" t="b"><v>{1 if value else 0}</v></c>'
    if _is_number(value):
        return f'<c r="{cell_ref}" t="n"><v>{value}</v></c>'

    text = str(value)
    escaped = xml_escape(text)
    if text != text.strip() or "\n" in text or "\t" in text:
        return f'<c r="{cell_ref}" t="inlineStr"><is><t xml:space="preserve">{escaped}</t></is></c>'
    return f'<c r="{cell_ref}" t="inlineStr"><is><t>{escaped}</t></is></c>'


def _sheet_xml(rows: list[dict[str, Any]]) -> str:
    if rows:
        headers = list(rows[0].keys())
        matrix: list[list[Any]] = [headers]
        for row in rows:
            matrix.append([row.get(h, "") for h in headers])
    else:
        matrix = [["No data"], ["-"]]

    parts = [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
        "<sheetData>",
    ]
    for r_idx, row_vals in enumerate(matrix, start=1):
        parts.append(f'<row r="{r_idx}">')
        for c_idx, value in enumerate(row_vals):
            cell_ref = f"{_excel_col_name(c_idx)}{r_idx}"
            parts.append(_cell_xml(cell_ref, value))
        parts.append("</row>")
    parts.extend(["</sheetData>", "</worksheet>"])
    return "".join(parts)


def _workbook_xml(sheet_names: list[str]) -> str:
    sheets = []
    for i, name in enumerate(sheet_names, start=1):
        sheets.append(f'<sheet name="{xml_escape(name)}" sheetId="{i}" r:id="rId{i}"/>')
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        f"<sheets>{''.join(sheets)}</sheets>"
        "</workbook>"
    )


def _workbook_rels_xml(sheet_count: int) -> str:
    rels = []
    for i in range(1, sheet_count + 1):
        rels.append(
            f'<Relationship Id="rId{i}" '
            'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" '
            f'Target="worksheets/sheet{i}.xml"/>'
        )
    rels.append(
        f'<Relationship Id="rId{sheet_count + 1}" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" '
        'Target="styles.xml"/>'
    )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        f"{''.join(rels)}"
        "</Relationships>"
    )


def _content_types_xml(sheet_count: int) -> str:
    overrides = [
        '<Override PartName="/xl/workbook.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
        '<Override PartName="/xl/styles.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
    ]
    for i in range(1, sheet_count + 1):
        overrides.append(
            f'<Override PartName="/xl/worksheets/sheet{i}.xml" '
            'ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        f"{''.join(overrides)}"
        "</Types>"
    )


def _root_rels_xml() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
        'Target="xl/workbook.xml"/>'
        "</Relationships>"
    )


def _styles_xml() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>'
        '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>'
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
        "</styleSheet>"
    )


def _build_xlsx_file(sheets: dict[str, list[dict[str, Any]]]) -> bytes:
    used_names: set[str] = set()
    sheet_pairs = [(_sanitize_sheet_name(name, used_names), rows) for name, rows in sheets.items()]
    if not sheet_pairs:
        sheet_pairs = [("Export", [])]

    mem = io.BytesIO()
    with zipfile.ZipFile(mem, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", _content_types_xml(len(sheet_pairs)))
        zf.writestr("_rels/.rels", _root_rels_xml())
        zf.writestr("xl/workbook.xml", _workbook_xml([name for name, _ in sheet_pairs]))
        zf.writestr("xl/_rels/workbook.xml.rels", _workbook_rels_xml(len(sheet_pairs)))
        zf.writestr("xl/styles.xml", _styles_xml())
        for i, (_, rows) in enumerate(sheet_pairs, start=1):
            zf.writestr(f"xl/worksheets/sheet{i}.xml", _sheet_xml(rows))
    mem.seek(0)
    return mem.getvalue()


def _rows_to_csv_bytes(rows: list[dict[str, Any]]) -> bytes:
    sio = io.StringIO()
    if rows:
        headers = list(rows[0].keys())
        writer = csv.DictWriter(sio, fieldnames=headers)
        writer.writeheader()
        for row in rows:
            writer.writerow(row)
    else:
        writer = csv.writer(sio)
        writer.writerow(["No data"])
    return sio.getvalue().encode("utf-8")


def _collect_export_rows(db: Session, req: BackupExportRequest) -> dict[str, list[dict[str, Any]]]:
    sheets: dict[str, list[dict[str, Any]]] = {}

    if req.products_inventory:
        items = db.query(InventoryItem).order_by(InventoryItem.id.asc()).all()
        sheets["Products_Inventory"] = [
            {
                "id": item.id,
                "sku": item.sku,
                "barcode": item.barcode,
                "name": item.name,
                "category": item.category,
                "brand": item.brand,
                "model": item.model,
                "quantity": int(item.quantity or 0),
                "damaged_quantity": int(item.damaged_quantity or 0),
                "cost_price": float(item.cost_price or 0),
                "sale_price": float(item.sale_price or 0),
                "warranty_days": int(item.warranty_days or 0),
                "location": item.location,
            }
            for item in items
        ]

    if req.customers:
        customers = db.query(Customer).order_by(Customer.id.asc()).all()
        sheets["Customers"] = [
            {
                "id": c.id,
                "name": c.name,
                "phone": c.phone,
                "email": c.email,
                "address": c.address,
                "created_at": c.created_at.isoformat() if c.created_at else None,
            }
            for c in customers
        ]

    if req.suppliers:
        suppliers = db.query(Supplier).order_by(Supplier.id.asc()).all()
        sheets["Suppliers"] = [
            {
                "id": s.id,
                "name": s.name,
                "contact": s.contact,
                "email": s.email,
                "address": s.address,
                "notes": s.notes,
                "payment_terms_days": int(s.payment_terms_days or 0),
                "opening_balance": float(s.opening_balance or 0),
            }
            for s in suppliers
        ]

    if req.sales_invoices:
        sales = db.query(Sale).options(joinedload(Sale.customer)).order_by(Sale.created_at.desc()).all()
        sheets["Sales_Invoices"] = [
            {
                "id": sale.id,
                "invoice_no": f"INV-{sale.id:05d}",
                "created_at": sale.created_at.isoformat() if sale.created_at else None,
                "customer_id": sale.customer_id,
                "customer_name": sale.customer.name if sale.customer else None,
                "payment_method": sale.payment_method,
                "subtotal": float(sale.subtotal or 0),
                "discount_amount": float(sale.discount_amount or 0),
                "tax_amount": float(sale.tax_amount or 0),
                "total": float(sale.total or 0),
                "paid": bool(sale.paid),
                "is_return": bool(sale.is_return),
                "is_voided": bool(sale.is_voided),
            }
            for sale in sales
        ]

    if req.repair_jobs:
        repairs = db.query(RepairTicket).options(joinedload(RepairTicket.customer)).order_by(RepairTicket.created_at.desc()).all()
        sheets["Repair_Jobs"] = [
            {
                "id": rep.id,
                "ticket_no": rep.ticket_no,
                "created_at": rep.created_at.isoformat() if rep.created_at else None,
                "customer_id": rep.customer_id,
                "customer_name": rep.customer.name if rep.customer else None,
                "device_model": rep.device_model,
                "imei": rep.imei,
                "status": rep.status,
                "priority": rep.priority,
                "technician": rep.technician,
                "estimated_cost": float(rep.estimated_cost or 0),
                "advance_payment": float(rep.advance_payment or 0),
                "delivered_at": rep.delivered_at.isoformat() if rep.delivered_at else None,
            }
            for rep in repairs
        ]

    if req.expenses:
        expenses = db.query(Expense).options(joinedload(Expense.supplier)).order_by(Expense.expense_date.desc()).all()
        sheets["Expenses"] = [
            {
                "id": row.id,
                "expense_code": row.expense_code,
                "expense_date": row.expense_date.isoformat() if row.expense_date else None,
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "category": row.category,
                "description": row.description,
                "payment_method": row.payment_method,
                "supplier_id": row.supplier_id,
                "supplier_name": row.supplier.name if row.supplier else None,
                "vendor_name": row.vendor_name,
                "reference_no": row.reference_no,
                "status": row.status,
                "amount": float(row.amount or 0),
                "is_recurring": bool(row.is_recurring),
                "recurring_cycle": row.recurring_cycle,
                "approved_at": row.approved_at.isoformat() if row.approved_at else None,
                "paid_at": row.paid_at.isoformat() if row.paid_at else None,
                "notes": row.notes,
            }
            for row in expenses
        ]

    if req.audit_logs:
        logs = db.query(ActivityLog).options(joinedload(ActivityLog.user)).order_by(ActivityLog.created_at.desc()).limit(5000).all()
        sheets["Audit_Logs"] = [
            {
                "id": log.id,
                "created_at": log.created_at.isoformat() if log.created_at else None,
                "user_id": log.user_id,
                "user_name": (log.user.full_name if log.user and log.user.full_name else (log.user.username if log.user else "System")),
                "action": log.action,
                "entity_type": log.entity_type,
                "entity_id": log.entity_id,
                "description": log.description,
                "is_reversible": bool(log.is_reversible),
                "is_reversed": bool(log.is_reversed),
            }
            for log in logs
        ]

    return sheets


def _export_history_note(req: BackupExportRequest) -> str:
    picked = []
    for key, label in [
        ("products_inventory", "products"),
        ("customers", "customers"),
        ("suppliers", "suppliers"),
        ("sales_invoices", "sales"),
        ("repair_jobs", "repairs"),
        ("expenses", "expenses"),
        ("audit_logs", "audit"),
    ]:
        if bool(getattr(req, key, False)):
            picked.append(label)
    return f"datasets={','.join(picked)}"


@router.post("/create")
def create_backup_endpoint(is_auto: bool = False, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    try:
        result = create_backup(db, is_auto=is_auto, trigger="auto" if is_auto else "manual")
        log_activity(
            db=db,
            user_id=user.id if user else None,
            action="Create",
            entity_type="Backup",
            entity_id=0,
            description=f"{'Auto' if is_auto else 'Manual'} backup created: {result.get('filename')}",
            new_value=result.get("metadata"),
            is_reversible=False,
        )
        return result
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/last")
def get_last_backup(db: Session = Depends(get_db), _=Depends(get_current_user)):
    row = db.query(AppSetting).filter(AppSetting.key == "last_backup_at").first()
    return {"last_backup_at": row.value if row else None}


@router.get("")
def list_backups(_=Depends(get_current_user)):
    return list_backup_filenames()


@router.get("/restore/requests")
def list_restore_requests(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return _load_restore_requests(db)


@router.post("/restore/request")
def create_restore_request(payload: RestoreRequestCreateIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    filename = str(payload.filename or "").strip()
    if not filename:
        raise HTTPException(status_code=400, detail="filename is required")
    if filename not in list_backup_filenames():
        raise HTTPException(status_code=404, detail="backup file not found")

    requests = _load_restore_requests(db)
    request_id = f"RR-{uuid.uuid4().hex[:10].upper()}"
    created = {
        "request_id": request_id,
        "filename": filename,
        "reason": str(payload.reason or "").strip(),
        "requested_by_user_id": user.id,
        "requested_by": user.full_name or user.username,
        "requested_at": _now_iso(),
        "status": "Pending Approval",
        "approval_note": "",
        "approved_by_user_id": None,
        "approved_by": None,
        "approved_at": None,
        "rejection_note": "",
        "rejected_by_user_id": None,
        "rejected_by": None,
        "rejected_at": None,
        "executed_by_user_id": None,
        "executed_by": None,
        "executed_at": None,
        "execution_result": None,
    }
    requests.insert(0, created)
    _save_restore_requests(db, requests)

    log_activity(
        db=db,
        user_id=user.id,
        action="Create",
        entity_type="BackupRestoreRequest",
        entity_id=0,
        description=f"Restore request created for backup: {filename}",
        new_value=created,
        is_reversible=False,
    )
    return created


@router.post("/restore/requests/{request_id}/approve")
def approve_restore_request(request_id: str, payload: RestoreRequestDecisionIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not _can_approve_restore(user):
        raise HTTPException(status_code=403, detail="Manager/Admin/Owner role required to approve restore requests")

    requests = _load_restore_requests(db)
    idx, row = _find_restore_request(requests, request_id)
    if row is None:
        raise HTTPException(status_code=404, detail="restore request not found")
    if row.get("status") != "Pending Approval":
        raise HTTPException(status_code=409, detail=f"Cannot approve request in status: {row.get('status')}")

    row["status"] = "Approved"
    row["approved_by_user_id"] = user.id
    row["approved_by"] = user.full_name or user.username
    row["approved_at"] = _now_iso()
    row["approval_note"] = str(payload.note or "").strip()
    requests[idx] = row
    _save_restore_requests(db, requests)

    log_activity(
        db=db,
        user_id=user.id,
        action="Update",
        entity_type="BackupRestoreRequest",
        entity_id=0,
        description=f"Restore request approved: {request_id}",
        new_value={"request_id": request_id, "status": "Approved", "note": row.get("approval_note")},
        is_reversible=False,
    )
    return row


@router.post("/restore/requests/{request_id}/reject")
def reject_restore_request(request_id: str, payload: RestoreRequestDecisionIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not _can_approve_restore(user):
        raise HTTPException(status_code=403, detail="Manager/Admin/Owner role required to reject restore requests")

    requests = _load_restore_requests(db)
    idx, row = _find_restore_request(requests, request_id)
    if row is None:
        raise HTTPException(status_code=404, detail="restore request not found")
    if row.get("status") != "Pending Approval":
        raise HTTPException(status_code=409, detail=f"Cannot reject request in status: {row.get('status')}")

    row["status"] = "Rejected"
    row["rejected_by_user_id"] = user.id
    row["rejected_by"] = user.full_name or user.username
    row["rejected_at"] = _now_iso()
    row["rejection_note"] = str(payload.note or "").strip()
    requests[idx] = row
    _save_restore_requests(db, requests)

    log_activity(
        db=db,
        user_id=user.id,
        action="Update",
        entity_type="BackupRestoreRequest",
        entity_id=0,
        description=f"Restore request rejected: {request_id}",
        new_value={"request_id": request_id, "status": "Rejected", "note": row.get("rejection_note")},
        is_reversible=False,
    )
    return row


@router.post("/restore/requests/{request_id}/execute")
def execute_restore_request(request_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not _can_execute_restore(user):
        raise HTTPException(status_code=403, detail="Admin/Owner role required to execute restore")

    requests = _load_restore_requests(db)
    idx, row = _find_restore_request(requests, request_id)
    if row is None:
        raise HTTPException(status_code=404, detail="restore request not found")
    if row.get("status") != "Approved":
        raise HTTPException(status_code=409, detail=f"Only approved requests can be executed. Current status: {row.get('status')}")

    filename = str(row.get("filename") or "")
    try:
        result = restore_backup(db, filename)
    except FileNotFoundError as exc:
        row["status"] = "Failed"
        row["execution_result"] = str(exc)
        row["executed_at"] = _now_iso()
        row["executed_by_user_id"] = user.id
        row["executed_by"] = user.full_name or user.username
        requests[idx] = row
        _save_restore_requests(db, requests)
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        row["status"] = "Failed"
        row["execution_result"] = str(exc)
        row["executed_at"] = _now_iso()
        row["executed_by_user_id"] = user.id
        row["executed_by"] = user.full_name or user.username
        requests[idx] = row
        _save_restore_requests(db, requests)
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        row["status"] = "Failed"
        row["execution_result"] = str(exc)
        row["executed_at"] = _now_iso()
        row["executed_by_user_id"] = user.id
        row["executed_by"] = user.full_name or user.username
        requests[idx] = row
        _save_restore_requests(db, requests)
        raise HTTPException(status_code=500, detail=str(exc))

    row["status"] = "Executed"
    row["executed_at"] = _now_iso()
    row["executed_by_user_id"] = user.id
    row["executed_by"] = user.full_name or user.username
    row["execution_result"] = "success"
    row["restore_output"] = result
    requests[idx] = row
    _save_restore_requests(db, requests)

    log_activity(
        db=db,
        user_id=user.id,
        action="Restore",
        entity_type="Backup",
        entity_id=0,
        description=f"Backup restore executed via workflow: {filename}",
        new_value={"request_id": request_id, "result": result},
        is_reversible=False,
    )
    return {"request": row, "restore_result": result}


@router.post("/restore/{filename}")
def restore_backup_endpoint(filename: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """
    Direct restore endpoint kept for backward compatibility.
    For normal operations, use request -> approve -> execute workflow endpoints.
    """
    if not _can_execute_restore(user):
        raise HTTPException(status_code=403, detail="Admin/Owner role required for direct restore")
    try:
        result = restore_backup(db, filename)
        log_activity(
            db=db,
            user_id=user.id,
            action="Restore",
            entity_type="Backup",
            entity_id=0,
            description=f"Direct backup restore executed: {filename}",
            new_value=result,
            is_reversible=False,
        )
        return result
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/export-data")
def export_system_data(payload: BackupExportRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    fmt = str(payload.format or "CSV").strip().lower()
    if fmt not in {"csv", "excel", "json"}:
        raise HTTPException(status_code=400, detail="format must be one of: CSV, Excel, JSON")

    datasets = _collect_export_rows(db, payload)
    if not datasets:
        raise HTTPException(status_code=400, detail="No datasets selected for export")

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    export_note = _export_history_note(payload)

    if fmt == "json":
        data = json.dumps({"generated_at": _now_iso(), "datasets": datasets}, ensure_ascii=False, indent=2).encode("utf-8")
        filename = f"system_export_{timestamp}.json"
        media_type = "application/json"
        stream = io.BytesIO(data)
    elif fmt == "excel":
        data = _build_xlsx_file(datasets)
        filename = f"system_export_{timestamp}.xlsx"
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        stream = io.BytesIO(data)
    else:
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, mode="w", compression=zipfile.ZIP_DEFLATED) as zf:
            for name, rows in datasets.items():
                zf.writestr(f"{name}.csv", _rows_to_csv_bytes(rows))
        stream.seek(0)
        data = stream.getvalue()
        filename = f"system_export_{timestamp}.zip"
        media_type = "application/zip"
        stream = io.BytesIO(data)

    log_activity(
        db=db,
        user_id=user.id if user else None,
        action="Export",
        entity_type="BackupDataExport",
        entity_id=0,
        description=f"System data export generated ({fmt.upper()}): {filename}",
        new_value={"filename": filename, "format": fmt.upper(), "note": export_note},
        is_reversible=False,
    )

    return StreamingResponse(
        stream,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/scheduler/status")
def get_scheduler_status(_=Depends(get_current_user)):
    try:
        from app.services.backup_scheduler import get_scheduler
    except Exception:
        return {"enabled": False, "reason": "Scheduler service unavailable"}

    scheduler = get_scheduler()
    if not settings.backup_schedule_enabled:
        return {"enabled": False, "reason": "Disabled in configuration"}
    if scheduler is None:
        return {"enabled": False, "reason": "Scheduler not initialized"}
    if not scheduler.running:
        return {"enabled": False, "reason": "Scheduler not running"}
    job = scheduler.get_job("daily_backup")
    if not job:
        return {"enabled": False, "reason": "Daily backup job not found"}
    return {
        "enabled": True,
        "scheduler_running": scheduler.running,
        "job_name": job.name,
        "job_id": job.id,
        "next_run_time": job.next_run_time.isoformat() if job.next_run_time else None,
        "schedule": f"{settings.backup_schedule_hour:02d}:{settings.backup_schedule_minute:02d} daily ({settings.backup_schedule_timezone})",
        "keep_count": settings.backup_keep_local,
    }


@router.post("/scheduler/trigger-now")
def trigger_backup_now(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    try:
        result = create_backup(db, is_auto=True, trigger="scheduled-manual-trigger")
        log_activity(
            db=db,
            user_id=user.id if user else None,
            action="Create",
            entity_type="Backup",
            entity_id=0,
            description=f"Scheduled backup manually triggered: {result.get('filename')}",
            new_value=result.get("metadata"),
            is_reversible=False,
        )
        return result
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
