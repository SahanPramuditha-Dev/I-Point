from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app.auth import get_current_user
from app.models import Customer, Sale, RepairTicket

router = APIRouter(prefix="/ledger", tags=["ledger"])

@router.get('/customer/{customer_id}')
def get_customer_ledger(customer_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    
    sales = db.query(Sale).filter(Sale.customer_id == customer_id, Sale.is_voided == False).all()
    repairs = db.query(RepairTicket).filter(RepairTicket.customer_id == customer_id).all()
    
    total_spent = sum(s.total for s in sales) + sum(r.estimated_cost for r in repairs if r.status == "Delivered")
    pending_payments = sum(r.estimated_cost - r.advance_payment for r in repairs if r.status != "Delivered" and r.status != "Cancelled")
    
    return {
        "customer": {
            "id": customer.id,
            "name": customer.name,
            "phone": customer.phone
        },
        "stats": {
            "total_spent": total_spent,
            "pending_payments": pending_payments,
            "repair_count": len(repairs),
            "purchase_count": len(sales)
        },
        "history": sorted(
            [{"type": "Sale", "id": s.id, "amount": s.total, "date": s.created_at, "status": "Paid"} for s in sales] +
            [{"type": "Repair", "id": r.id, "amount": r.estimated_cost, "date": r.created_at, "status": r.status} for r in repairs],
            key=lambda x: x["date"], reverse=True
        )
    }
