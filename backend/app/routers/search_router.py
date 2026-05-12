from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from app.database import get_db
from app.auth import get_current_user
from app.models import Sale, RepairTicket, Customer, InventoryItem

router = APIRouter(prefix="/search", tags=["search"])

@router.get('/global')
def global_search(
    q: str = Query(...),
    db: Session = Depends(get_db),
    _=Depends(get_current_user)
):
    # Search Customers
    customers = db.query(Customer).filter(
        or_(
            Customer.name.ilike(f"%{q}%"),
            Customer.phone.ilike(f"%{q}%")
        )
    ).limit(5).all()

    # Search Repairs
    repairs = db.query(RepairTicket).filter(
        or_(
            RepairTicket.ticket_no.ilike(f"%{q}%"),
            RepairTicket.imei.ilike(f"%{q}%"),
            RepairTicket.device_model.ilike(f"%{q}%")
        )
    ).limit(5).all()

    # Search Sales
    sales = db.query(Sale).filter(
        or_(
            Sale.id.cast(str).ilike(f"%{q}%")
        )
    ).limit(5).all()

    # Search Inventory
    inventory = db.query(InventoryItem).filter(
        or_(
            InventoryItem.name.ilike(f"%{q}%"),
            InventoryItem.sku.ilike(f"%{q}%")
        )
    ).limit(5).all()

    return {
        "customers": [{"id": c.id, "name": c.name, "phone": c.phone} for c in customers],
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
