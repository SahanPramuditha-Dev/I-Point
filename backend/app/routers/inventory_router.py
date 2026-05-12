from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.auth import get_current_user
from app.models import InventoryItem, Supplier, StockMovement
from app.schemas import InventoryIn, SupplierIn, StockAdjustIn

router = APIRouter(prefix="/inventory", tags=["inventory"])

@router.get('')
def list_inventory(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(InventoryItem).all()

@router.post('')
def create_inventory(payload: InventoryIn, db: Session = Depends(get_db), _=Depends(get_current_user)):
    item = InventoryItem(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item

@router.put('/{item_id}')
def update_inventory(item_id: int, payload: InventoryIn, db: Session = Depends(get_db), _=Depends(get_current_user)):
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    for k, v in payload.model_dump().items():
        setattr(item, k, v)
    db.commit()
    db.refresh(item)
    return item

@router.delete('/{item_id}')
def delete_inventory(item_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    db.delete(item)
    db.commit()
    return {"ok": True}

@router.get('/suppliers')
def suppliers(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(Supplier).all()

@router.post('/suppliers')
def create_supplier(payload: SupplierIn, db: Session = Depends(get_db), _=Depends(get_current_user)):
    s = Supplier(**payload.model_dump())
    db.add(s)
    db.commit()
    db.refresh(s)
    return s

@router.put('/suppliers/{supplier_id}')
def update_supplier(supplier_id: int, payload: SupplierIn, db: Session = Depends(get_db), _=Depends(get_current_user)):
    s = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Supplier not found")
    s.name = payload.name
    s.contact = payload.contact
    db.commit()
    db.refresh(s)
    return s

@router.delete('/suppliers/{supplier_id}')
def delete_supplier(supplier_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    s = db.query(Supplier).filter(Supplier.id == supplier_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Supplier not found")
    db.delete(s)
    db.commit()
    return {"ok": True}

@router.post('/adjust')
def adjust_stock(payload: StockAdjustIn, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    from app.services.activity_service import log_activity
    item = db.query(InventoryItem).filter(InventoryItem.id == payload.item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    if not payload.note or len(payload.note.strip()) < 5:
        raise HTTPException(status_code=400, detail="A descriptive reason (min 5 chars) is mandatory for stock adjustments")

    old_qty = item.quantity
    new_qty = old_qty + payload.quantity_change
    
    if new_qty < 0:
        raise HTTPException(status_code=400, detail="Stock level cannot be negative")

    item.quantity = new_qty
    db.add(StockMovement(
        item_id=item.id,
        movement_type="ADJUSTMENT",
        quantity=payload.quantity_change,
        note=payload.note
    ))
    
    log_activity(
        db, current_user.id, "Adjustment", "InventoryItem", item.id,
        f"Stock adjusted by {payload.quantity_change}. Reason: {payload.note}",
        {"quantity": old_qty}, {"quantity": new_qty},
        is_reversible=True
    )
    
    db.commit()
    return {"ok": True, "new_quantity": item.quantity}

@router.get('/movements')
def movements(db: Session = Depends(get_db), _=Depends(get_current_user)):
    rows = db.query(StockMovement).order_by(StockMovement.created_at.desc()).limit(200).all()
    return [{
        "id": m.id,
        "item_id": m.item_id,
        "item_name": m.item.name if m.item else "",
        "movement_type": m.movement_type,
        "quantity": m.quantity,
        "reference_type": m.reference_type,
        "reference_id": m.reference_id,
        "note": m.note,
        "created_at": m.created_at.isoformat()
    } for m in rows]
@router.get('/{item_id}/serials')
def list_serials(item_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    from app.models import InventorySerial
    return db.query(InventorySerial).filter(InventorySerial.item_id == item_id).all()

@router.post('/{item_id}/serials')
def add_serial(item_id: int, serial_number: str, db: Session = Depends(get_db), _=Depends(get_current_user)):
    from app.models import InventorySerial, InventoryItem
    item = db.query(InventoryItem).filter(InventoryItem.id == item_id).first()
    if not item: raise HTTPException(404, "Item not found")
    
    existing = db.query(InventorySerial).filter(InventorySerial.serial_number == serial_number).first()
    if existing: raise HTTPException(400, "Serial number already exists")
    
    s = InventorySerial(item_id=item_id, serial_number=serial_number)
    db.add(s)
    # Increment quantity if it was added manually? 
    # Usually serial addition should be part of a stock IN, but for simplicity here we just add it.
    item.quantity += 1
    db.commit()
    db.refresh(s)
    return s

@router.delete('/serials/{serial_id}')
def delete_serial(serial_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    from app.models import InventorySerial, InventoryItem
    s = db.query(InventorySerial).filter(InventorySerial.id == serial_id).first()
    if not s: raise HTTPException(404, "Serial not found")
    item = db.query(InventoryItem).filter(InventoryItem.id == s.item_id).first()
    if item: item.quantity = max(0, item.quantity - 1)
    db.delete(s)
    db.commit()
    return {"ok": True}
