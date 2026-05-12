from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app.auth import get_current_user
from app.models import Sale, RepairTicket, InventoryItem, SaleItem, RepairPartUsage

router = APIRouter(prefix="/reports", tags=["reports"])

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
    
    if date_from:
        start_dt = datetime.fromisoformat(date_from)
        sales_q = sales_q.filter(Sale.created_at >= start_dt)
        repair_q = repair_q.filter(RepairTicket.delivered_at >= start_dt)
    if date_to:
        end_dt = datetime.fromisoformat(date_to) + timedelta(days=1)
        sales_q = sales_q.filter(Sale.created_at < end_dt)
        repair_q = repair_q.filter(RepairTicket.delivered_at < end_dt)

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
    
    # Inventory
    inventory_value = db.query(func.coalesce(func.sum(InventoryItem.quantity * InventoryItem.cost_price), 0)).scalar() or 0
    total_repairs_all_time = db.query(func.count(RepairTicket.id)).scalar() or 0
    
    total_revenue = total_sales + repair_revenue
    total_cost = cogs + repair_parts_cost
    recent_sales = sales_q.order_by(Sale.created_at.desc()).limit(10).all()

    return {
        "summary": {
            "total_revenue": total_revenue,
            "gross_profit": total_revenue - total_cost,
            "sales_revenue": total_sales,
            "repair_revenue": repair_revenue,
        },
        "audit": {
            "cash_in_hand_expected": cash_sales + repair_revenue,
            "card_payments": card_sales,
            "voided_invoices": voided_total,
            "sales_count": sales_count
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

@router.get('/export-sales')
def export_sales(
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _=Depends(get_current_user)
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
    _=Depends(get_current_user)
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
    
    output.seek(0)
    return StreamingResponse(
        output, 
        media_type="text/csv", 
        headers={"Content-Disposition": f"attachment; filename=repairs_report_{datetime.now().strftime('%Y%m%d')}.csv"}
    )

@router.get('/export-inventory')
def export_inventory(
    db: Session = Depends(get_db),
    _=Depends(get_current_user)
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
        
    sales = sales_q.order_by(Sale.created_at.desc()).all()
    return [{
        "id": s.id,
        "invoice_no": f"INV-{s.id:05d}",
        "total": s.total,
        "payment_method": s.payment_method,
        "is_voided": s.is_voided,
        "is_return": s.is_return,
        "created_at": s.created_at.isoformat(),
        "customer_id": s.customer_id
    } for s in sales]

@router.get('/repairs')
def detailed_repairs_report(
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    db: Session = Depends(get_db),
    _=Depends(get_current_user)
):
    rep_q = db.query(RepairTicket)
    if date_from:
        start_dt = datetime.fromisoformat(date_from)
        rep_q = rep_q.filter(RepairTicket.created_at >= start_dt)
    if date_to:
        end_dt = datetime.fromisoformat(date_to) + timedelta(days=1)
        rep_q = rep_q.filter(RepairTicket.created_at < end_dt)
        
    tickets = rep_q.order_by(RepairTicket.created_at.desc()).all()
    return [{
        "id": t.id,
        "ticket_no": t.ticket_no,
        "device": t.device_model,
        "issue": t.issue,
        "status": t.status,
        "estimated_cost": t.estimated_cost,
        "advance_payment": t.advance_payment,
        "created_at": t.created_at.isoformat(),
        "delivered_at": t.delivered_at.isoformat() if t.delivered_at else None
    } for t in tickets]

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
        "quantity": i.quantity,
        "cost_price": i.cost_price,
        "sale_price": i.sale_price,
        "total_value": i.quantity * i.cost_price,
        "potential_revenue": i.quantity * i.sale_price
    } for i in items]
