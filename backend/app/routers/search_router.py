from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import String, cast, or_, text
from app.database import get_db
from app.auth import get_current_user
from app.models import Sale, RepairTicket, Customer, InventoryItem

router = APIRouter(prefix="/search", tags=["search"])


def _norm(v):
    return str(v or "").strip().lower()


def _score_text(value: str, query: str) -> int:
    t = _norm(value)
    q = _norm(query)
    if not q or not t:
        return 0
    if t == q:
        return 120
    if t.startswith(q):
        return 90
    if q in t:
        return 60
    return 0


def _score_customer(c: Customer, q: str) -> int:
    return max(_score_text(getattr(c, "name", None), q), _score_text(getattr(c, "phone", None), q), _score_text(getattr(c, "email", None), q))


def _score_repair(r: RepairTicket, q: str) -> int:
    score = max(
        _score_text(getattr(r, "ticket_no", None), q),
        _score_text(getattr(r, "imei", None), q),
        _score_text(getattr(r, "device_model", None), q),
    )
    if getattr(r, "status", None) in ("Pending", "Diagnosing"):
        score += 8
    return score


def _score_inventory(i: InventoryItem, q: str) -> int:
    score = max(_score_text(getattr(i, "name", None), q), _score_text(getattr(i, "sku", None), q))
    if (getattr(i, "quantity", 0) or 0) <= 3:
        score += 6
    return score


def _score_sale(s: Sale, q: str) -> int:
    sid = getattr(s, "id", 0) or 0
    invoice = f"INV-{sid:05d}"
    return max(_score_text(invoice, q), _score_text(sid, q))

@router.get('/global')
def global_search(
    q: str = Query(...),
    db: Session = Depends(get_db),
    _=Depends(get_current_user)
):
    customer_cols = {r[1] for r in db.execute(text("PRAGMA table_info(customers)")).fetchall()}
    has_customer_email = "email" in customer_cols

    # Search Customers
    customer_filters = [Customer.name.ilike(f"%{q}%"), Customer.phone.ilike(f"%{q}%")]
    customer_select = [Customer.id, Customer.name, Customer.phone]
    if has_customer_email:
        customer_filters.append(Customer.email.ilike(f"%{q}%"))
        customer_select.append(Customer.email)
    customers = db.query(*customer_select).filter(or_(*customer_filters)).limit(40).all()

    # Search Repairs
    repairs = db.query(
        RepairTicket.id,
        RepairTicket.ticket_no,
        RepairTicket.device_model,
        RepairTicket.status,
        RepairTicket.imei,
    ).filter(
        or_(
            RepairTicket.ticket_no.ilike(f"%{q}%"),
            RepairTicket.imei.ilike(f"%{q}%"),
            RepairTicket.device_model.ilike(f"%{q}%")
        )
    ).limit(40).all()

    # Search Sales
    sales = db.query(Sale.id, Sale.total, Sale.created_at).filter(
        or_(
            cast(Sale.id, String).ilike(f"%{q}%")
        )
    ).limit(40).all()

    # Search Inventory
    inventory = db.query(
        InventoryItem.id,
        InventoryItem.name,
        InventoryItem.sku,
        InventoryItem.quantity,
    ).filter(
        or_(
            InventoryItem.name.ilike(f"%{q}%"),
            InventoryItem.sku.ilike(f"%{q}%")
        )
    ).limit(40).all()

    customers = sorted(customers, key=lambda c: _score_customer(c, q), reverse=True)[:8]
    repairs = sorted(repairs, key=lambda r: _score_repair(r, q), reverse=True)[:8]
    sales = sorted(sales, key=lambda s: _score_sale(s, q), reverse=True)[:8]
    inventory = sorted(inventory, key=lambda i: _score_inventory(i, q), reverse=True)[:8]

    return {
        "customers": [{"id": c.id, "name": c.name, "phone": c.phone, "email": getattr(c, "email", None)} for c in customers],
        "repairs": [{"id": r.id, "ticket_no": r.ticket_no, "device_model": r.device_model, "status": r.status} for r in repairs],
        "sales": [{"id": s.id, "invoice_no": f"INV-{s.id:05d}", "total": s.total, "created_at": s.created_at} for s in sales],
        "inventory": [{"id": i.id, "name": i.name, "sku": i.sku, "quantity": i.quantity} for i in inventory]
    }
@router.get('/suggestions')
def get_suggestions(db: Session = Depends(get_db), _=Depends(get_current_user)):
    from sqlalchemy import func
    from app.models import SaleItem
    
    # 1. Get Top 5 Most Sold Items
    top_sold = db.query(
        InventoryItem.name,
        func.count(SaleItem.id).label('sold_count')
    ).join(SaleItem, InventoryItem.id == SaleItem.item_id)\
     .group_by(InventoryItem.id)\
     .order_by(func.count(SaleItem.id).desc())\
     .limit(5).all()
    
    trending_names = [i.name for i in top_sold]
    
    # 2. Get 3 Recent Customers
    recent_customers = db.query(Customer).order_by(Customer.created_at.desc()).limit(3).all()
    customer_names = [c.name for c in recent_customers]
    
    # Fallback to random if empty
    if not trending_names:
        import random
        items = db.query(InventoryItem).all()
        trending_names = [i.name for i in random.sample(items, min(len(items), 4))] if items else []
        
    suggestions = trending_names + customer_names
    # Add common terms
    suggestions += ["iPhone Screen", "Charging Port", "Battery replacement"]
    
    # Unique and limit
    seen = set()
    result = []
    for s in suggestions:
        if s and s not in seen:
            result.append(s)
            seen.add(s)
            
    return result[:10]
