from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.auth import get_current_user
from app.models import PurchaseOrder, PurchaseOrderItem, InventoryItem, StockMovement
from app.schemas import PurchaseOrderIn

router = APIRouter(prefix="/purchase", tags=["purchase"])

@router.get('')
def list_pos(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(PurchaseOrder).order_by(PurchaseOrder.created_at.desc()).all()

@router.post('')
def create_po(payload: PurchaseOrderIn, db: Session = Depends(get_db), _=Depends(get_current_user)):
    total = sum(i.quantity * i.unit_cost for i in payload.items)
    po = PurchaseOrder(
        po_number=f"PO-{int(db.query(PurchaseOrder).count()) + 10001}",
        supplier_id=payload.supplier_id,
        note=payload.note,
        total_cost=total,
        status="Draft"
    )
    db.add(po)
    db.flush()
    for item in payload.items:
        db.add(PurchaseOrderItem(
            po_id=po.id,
            item_id=item.item_id,
            quantity=item.quantity,
            unit_cost=item.unit_cost
        ))
    db.commit()
    db.refresh(po)
    return po

@router.get('/{po_id}')
def get_po(po_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    po = db.query(PurchaseOrder).filter(PurchaseOrder.id == po_id).first()
    if not po:
        raise HTTPException(status_code=404, detail="PO not found")
    # Join with item names for UI
    items = []
    for i in po.items:
        items.append({
            "id": i.id,
            "item_id": i.item_id,
            "item_name": i.item.name,
            "quantity": i.quantity,
            "unit_cost": i.unit_cost
        })
    return {
        "id": po.id,
        "po_number": po.po_number,
        "status": po.status,
        "total_cost": po.total_cost,
        "note": po.note,
        "created_at": po.created_at,
        "received_at": po.received_at,
        "supplier_name": po.supplier.name if po.supplier else "Unknown",
        "items": items
    }

@router.post('/{po_id}/receive')
def receive_po(po_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    po = db.query(PurchaseOrder).filter(PurchaseOrder.id == po_id).first()
    if not po:
        raise HTTPException(status_code=404, detail="PO not found")
    if po.status == "Received":
        raise HTTPException(status_code=400, detail="PO already received")
    
    for pi in po.items:
        item = db.query(InventoryItem).filter(InventoryItem.id == pi.item_id).first()
        if item:
            # Update stock
            item.quantity += pi.quantity
            # Update cost price (Weighted average or just latest)
            # item.cost_price = pi.unit_cost 
            
            db.add(StockMovement(
                item_id=item.id,
                movement_type="IN",
                quantity=pi.quantity,
                reference_type="purchase_order",
                reference_id=po.id,
                note=f"Received via {po.po_number}"
            ))
            
    po.status = "Received"
    po.received_at = datetime.utcnow()
    db.commit()
    return {"ok": True}
