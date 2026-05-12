from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.auth import get_current_user
from app.models import Customer, Sale, RepairTicket
from app.schemas import CustomerIn

router = APIRouter(prefix="/customers", tags=["customers"])

@router.get('')
def list_customers(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(Customer).all()

@router.post('')
def create_customer(payload: CustomerIn, db: Session = Depends(get_db), _=Depends(get_current_user)):
    c = Customer(**payload.model_dump())
    db.add(c)
    db.commit()
    db.refresh(c)
    return c

@router.put('/{customer_id}')
def update_customer(customer_id: int, payload: CustomerIn, db: Session = Depends(get_db), _=Depends(get_current_user)):
    c = db.query(Customer).filter(Customer.id == customer_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found")
    for k, v in payload.model_dump().items():
        setattr(c, k, v)
    db.commit()
    db.refresh(c)
    return c

@router.delete('/{customer_id}')
def delete_customer(customer_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    c = db.query(Customer).filter(Customer.id == customer_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found")
    db.delete(c)
    db.commit()
    return {"ok": True}

@router.get('/{customer_id}/history')
def customer_history(customer_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    sales = db.query(Sale).filter(Sale.customer_id == customer_id).order_by(Sale.created_at.desc()).all()
    repairs = db.query(RepairTicket).filter(RepairTicket.customer_id == customer_id).order_by(RepairTicket.created_at.desc()).all()
    return {
        "customer": {
            "id": customer.id,
            "name": customer.name,
            "phone": customer.phone,
            "email": customer.email,
            "address": customer.address
        } if customer else None,
        "sales": [{"id": s.id, "total": s.total, "payment_method": s.payment_method, "created_at": s.created_at.isoformat()} for s in sales],
        "repairs": [{"id": r.id, "ticket_no": r.ticket_no, "status": r.status, "device_model": r.device_model, "created_at": r.created_at.isoformat()} for r in repairs]
    }
