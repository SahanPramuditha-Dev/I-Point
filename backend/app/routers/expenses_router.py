from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user
from app.database import get_db
from app.models import ActivityLog, Expense, Supplier, User
from app.schemas import ExpenseDecisionIn, ExpenseIn, ExpenseUpdateIn

router = APIRouter(prefix="/expenses", tags=["expenses"])

EXPENSE_STATUSES = {"Pending Approval", "Approved", "Rejected", "Paid", "Cancelled"}


def _parse_iso(value: str | None, *, end_exclusive: bool = False) -> datetime | None:
    if not value:
        return None
    parsed = datetime.fromisoformat(value)
    if end_exclusive:
        parsed = parsed + timedelta(days=1)
    return parsed


def _normalize_status(value: str | None) -> str:
    raw = str(value or "").strip().lower()
    mapping = {
        "pending": "Pending Approval",
        "pending approval": "Pending Approval",
        "approved": "Approved",
        "rejected": "Rejected",
        "paid": "Paid",
        "cancelled": "Cancelled",
        "canceled": "Cancelled",
    }
    return mapping.get(raw, "Pending Approval")


def _next_expense_code(db: Session) -> str:
    day_prefix = datetime.utcnow().strftime("%Y%m%d")
    like_prefix = f"EXP-{day_prefix}-%"
    today_count = db.query(Expense).filter(Expense.expense_code.like(like_prefix)).count()
    return f"EXP-{day_prefix}-{today_count + 1:04d}"


def _display_user(user: User | None) -> str | None:
    if not user:
        return None
    return user.full_name or user.username or f"User #{user.id}"


def _serialize_expense(row: Expense) -> dict[str, Any]:
    return {
        "id": row.id,
        "expense_code": row.expense_code,
        "expense_date": row.expense_date.isoformat() if row.expense_date else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
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
        "receipt_attachment": row.receipt_attachment,
        "notes": row.notes,
        "created_by_user_id": row.created_by_user_id,
        "created_by_name": _display_user(row.created_by),
        "approved_by_user_id": row.approved_by_user_id,
        "approved_by_name": _display_user(row.approved_by),
        "approved_at": row.approved_at.isoformat() if row.approved_at else None,
        "rejection_reason": row.rejection_reason,
        "paid_at": row.paid_at.isoformat() if row.paid_at else None,
        # Compatibility aliases used in older report components.
        "po_number": row.expense_code,
        "total_cost": float(row.amount or 0),
        "note": row.description or row.notes,
    }


def _log_activity(
    db: Session,
    *,
    user_id: int | None,
    action: str,
    entity_id: int,
    description: str,
    old_value: dict[str, Any] | None = None,
    new_value: dict[str, Any] | None = None,
) -> None:
    db.add(
        ActivityLog(
            user_id=user_id,
            action=action,
            entity_type="Expense",
            entity_id=entity_id,
            description=description,
            old_value=None if old_value is None else str(old_value),
            new_value=None if new_value is None else str(new_value),
            is_reversible=action in {"Create", "Update"},
            is_reversed=False,
        )
    )


def _apply_decision(row: Expense, payload: ExpenseDecisionIn, actor: User | None) -> None:
    action = str(payload.action or "").strip().lower()
    note = (payload.note or "").strip() or None
    now = datetime.utcnow()
    if action == "approve":
        row.status = "Approved"
        row.approved_by_user_id = actor.id if actor else None
        row.approved_at = now
        row.rejection_reason = None
    elif action == "reject":
        row.status = "Rejected"
        row.approved_by_user_id = actor.id if actor else None
        row.approved_at = now
        row.rejection_reason = note or "Rejected"
    elif action == "paid":
        row.status = "Paid"
        row.approved_by_user_id = row.approved_by_user_id or (actor.id if actor else None)
        row.approved_at = row.approved_at or now
        row.paid_at = now
        row.rejection_reason = None
    elif action == "cancel":
        row.status = "Cancelled"
    elif action == "pending":
        row.status = "Pending Approval"
        row.approved_by_user_id = None
        row.approved_at = None
        row.rejection_reason = None
        row.paid_at = None
    else:
        raise HTTPException(status_code=400, detail="Invalid action. Use approve, reject, paid, cancel, or pending.")
    if note:
        row.notes = "\n".join([part for part in [row.notes, f"[Decision] {note}"] if part])


@router.get("")
def list_expenses(
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    status: str | None = Query(default=None),
    category: str | None = Query(default=None),
    recurring: bool | None = Query(default=None),
    search: str | None = Query(default=None),
    limit: int = Query(default=1000, ge=1, le=5000),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    query = db.query(Expense).options(
        joinedload(Expense.created_by),
        joinedload(Expense.approved_by),
        joinedload(Expense.supplier),
    )
    start = _parse_iso(date_from)
    end = _parse_iso(date_to, end_exclusive=True)
    if start:
        query = query.filter(Expense.expense_date >= start)
    if end:
        query = query.filter(Expense.expense_date < end)
    if status:
        normalized = _normalize_status(status)
        query = query.filter(Expense.status == normalized)
    if category:
        query = query.filter(Expense.category == category)
    if recurring is not None:
        query = query.filter(Expense.is_recurring == bool(recurring))
    if search:
        text = f"%{str(search).strip()}%"
        query = query.filter(
            Expense.expense_code.ilike(text)
            | Expense.category.ilike(text)
            | Expense.description.ilike(text)
            | Expense.vendor_name.ilike(text)
            | Expense.reference_no.ilike(text)
            | Expense.notes.ilike(text)
        )
    rows = query.order_by(Expense.expense_date.desc(), Expense.created_at.desc()).limit(limit).all()
    return [_serialize_expense(row) for row in rows]


@router.get("/summary")
def expense_summary(
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _=Depends(get_current_user),
):
    query = db.query(Expense)
    start = _parse_iso(date_from)
    end = _parse_iso(date_to, end_exclusive=True)
    if start:
        query = query.filter(Expense.expense_date >= start)
    if end:
        query = query.filter(Expense.expense_date < end)
    rows = query.all()

    total_amount = sum(float(row.amount or 0) for row in rows)
    by_status = {status: 0.0 for status in sorted(EXPENSE_STATUSES)}
    for row in rows:
        by_status[row.status] = by_status.get(row.status, 0.0) + float(row.amount or 0)

    by_category_rows = (
        db.query(
            Expense.category,
            func.coalesce(func.sum(Expense.amount), 0),
            func.count(Expense.id),
        )
        .filter(Expense.id.in_([row.id for row in rows]) if rows else False)
        .group_by(Expense.category)
        .order_by(func.sum(Expense.amount).desc())
        .all()
    )

    return {
        "total_expenses": round(total_amount, 2),
        "records": len(rows),
        "pending_count": len([row for row in rows if row.status == "Pending Approval"]),
        "approved_count": len([row for row in rows if row.status == "Approved"]),
        "paid_count": len([row for row in rows if row.status == "Paid"]),
        "rejected_count": len([row for row in rows if row.status == "Rejected"]),
        "by_status_amount": {key: round(value, 2) for key, value in by_status.items()},
        "by_category": [
            {"category": category or "Uncategorized", "total": round(float(total or 0), 2), "count": int(count or 0)}
            for category, total, count in by_category_rows
        ],
    }


@router.get("/{expense_id}")
def get_expense(expense_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    row = (
        db.query(Expense)
        .options(joinedload(Expense.created_by), joinedload(Expense.approved_by), joinedload(Expense.supplier))
        .filter(Expense.id == expense_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Expense not found")
    return _serialize_expense(row)


@router.post("")
def create_expense(payload: ExpenseIn, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    if float(payload.amount or 0) < 0:
        raise HTTPException(status_code=400, detail="Amount must be non-negative")
    category = str(payload.category or "").strip()
    if not category:
        raise HTTPException(status_code=400, detail="category is required")

    if payload.supplier_id:
        supplier = db.query(Supplier).filter(Supplier.id == payload.supplier_id).first()
        if not supplier:
            raise HTTPException(status_code=404, detail="Supplier not found")

    row = Expense(
        expense_code=_next_expense_code(db),
        expense_date=payload.expense_date or datetime.utcnow(),
        category=category,
        description=payload.description,
        amount=float(payload.amount or 0),
        payment_method=payload.payment_method or "Cash",
        status="Pending Approval",
        supplier_id=payload.supplier_id,
        vendor_name=payload.vendor_name,
        reference_no=payload.reference_no,
        is_recurring=bool(payload.is_recurring),
        recurring_cycle=payload.recurring_cycle,
        receipt_attachment=payload.receipt_attachment,
        notes=payload.notes,
        created_by_user_id=current_user.id if current_user else None,
    )
    db.add(row)
    db.flush()
    _log_activity(
        db,
        user_id=current_user.id if current_user else None,
        action="Create",
        entity_id=row.id,
        description=f"Expense {row.expense_code} created ({row.category})",
        new_value={"amount": row.amount, "status": row.status},
    )
    db.commit()
    db.refresh(row)
    return _serialize_expense(row)


@router.put("/{expense_id}")
def update_expense(
    expense_id: int,
    payload: ExpenseUpdateIn,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    row = db.query(Expense).filter(Expense.id == expense_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Expense not found")
    if row.status == "Paid":
        raise HTTPException(status_code=400, detail="Paid expenses are immutable")

    old = _serialize_expense(row)
    updates = payload.model_dump(exclude_unset=True)
    if "amount" in updates and float(updates["amount"] or 0) < 0:
        raise HTTPException(status_code=400, detail="Amount must be non-negative")
    if "status" in updates and _normalize_status(updates["status"]) not in EXPENSE_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")

    if "status" in updates:
        updates["status"] = _normalize_status(updates["status"])
    if "category" in updates and not str(updates["category"] or "").strip():
        raise HTTPException(status_code=400, detail="category cannot be empty")
    if "category" in updates:
        updates["category"] = str(updates["category"]).strip()

    if "supplier_id" in updates and updates["supplier_id"]:
        supplier = db.query(Supplier).filter(Supplier.id == updates["supplier_id"]).first()
        if not supplier:
            raise HTTPException(status_code=404, detail="Supplier not found")

    for key, value in updates.items():
        setattr(row, key, value)

    _log_activity(
        db,
        user_id=current_user.id if current_user else None,
        action="Update",
        entity_id=row.id,
        description=f"Expense {row.expense_code} updated",
        old_value={"amount": old["amount"], "status": old["status"]},
        new_value={"amount": row.amount, "status": row.status},
    )
    db.commit()
    db.refresh(row)
    return _serialize_expense(row)


@router.put("/{expense_id}/approve")
def approve_expense(
    expense_id: int,
    payload: ExpenseDecisionIn,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    row = db.query(Expense).filter(Expense.id == expense_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Expense not found")
    old_status = row.status
    _apply_decision(row, payload, current_user)
    _log_activity(
        db,
        user_id=current_user.id if current_user else None,
        action="Approve",
        entity_id=row.id,
        description=f"Expense {row.expense_code} decision: {payload.action}",
        old_value={"status": old_status},
        new_value={"status": row.status},
    )
    db.commit()
    db.refresh(row)
    return _serialize_expense(row)


@router.delete("/{expense_id}")
def delete_expense(expense_id: int, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    row = db.query(Expense).filter(Expense.id == expense_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Expense not found")
    if row.status == "Paid":
        raise HTTPException(status_code=400, detail="Paid expenses cannot be deleted")
    code = row.expense_code
    db.delete(row)
    _log_activity(
        db,
        user_id=current_user.id if current_user else None,
        action="Delete",
        entity_id=expense_id,
        description=f"Expense {code} deleted",
    )
    db.commit()
    return {"ok": True}
