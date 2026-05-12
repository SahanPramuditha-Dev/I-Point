from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.auth import get_current_user
from app.models import Notification

router = APIRouter(prefix="/notifications", tags=["notifications"])

@router.get('')
def list_notifications(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(Notification).order_by(Notification.created_at.desc()).limit(50).all()

@router.put('/{nid}/read')
def mark_read(nid: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    n = db.query(Notification).filter(Notification.id == nid).first()
    if n:
        n.is_read = True
        db.commit()
    return {"ok": True}

@router.delete('/clear-all')
def clear_all(db: Session = Depends(get_db), _=Depends(get_current_user)):
    db.query(Notification).delete()
    db.commit()
    return {"ok": True}
