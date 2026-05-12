from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from datetime import datetime, timedelta
from app.database import get_db
from app.auth import get_current_user
from app.models import Sale, RepairTicket, InventoryItem, ActivityLog, Customer

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

@router.get('')
def dashboard(db: Session = Depends(get_db), _=Depends(get_current_user)):
    now = datetime.now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    
    daily_revenue = db.query(func.coalesce(func.sum(Sale.total), 0)).filter(Sale.created_at >= today_start).scalar() or 0
    total_repairs = db.query(func.count(RepairTicket.id)).scalar() or 0
    completed_repairs = db.query(func.count(RepairTicket.id)).filter(RepairTicket.status == "Completed").scalar() or 0
    customers_count = db.query(func.count(Customer.id)).scalar() or 0
    
    low_stock_items = db.query(InventoryItem).filter(InventoryItem.quantity <= 3).all()
    recent_sales = db.query(Sale).order_by(Sale.created_at.desc()).limit(10).all()
    recent_repairs = db.query(RepairTicket).order_by(RepairTicket.created_at.desc()).limit(5).all()
    
    # Monthly Revenue (Last 7 months)
    import calendar
    monthly_rev = []
    for i in range(6, -1, -1):
        target_date = now - timedelta(days=i*30)
        m_start = target_date.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        if m_start.month == 12:
            m_end = m_start.replace(year=m_start.year+1, month=1)
        else:
            m_end = m_start.replace(month=m_start.month+1)
        
        m_label = m_start.strftime("%b")
        val = db.query(func.coalesce(func.sum(Sale.total), 0)).filter(Sale.created_at >= m_start, Sale.created_at < m_end).scalar() or 0
        monthly_rev.append({"name": m_label, "value": val})

    # Activity Feed
    logs = db.query(ActivityLog).order_by(ActivityLog.created_at.desc()).limit(10).all()
    activity_feed = []
    for l in logs:
        activity_feed.append({
            "id": l.id,
            "action": l.action,
            "module": l.module,
            "user": l.user_name,
            "timestamp": l.created_at.isoformat(),
            "details": l.details
        })
        
    if not activity_feed:
        # Fallback to recent repairs and sales if no explicit activity logs
        for r in recent_repairs[:3]:
            activity_feed.append({"id": f"r{r.id}", "action": f"Repair ticket {r.ticket_no} created", "module": "REPAIR", "timestamp": r.created_at.isoformat(), "details": r.issue})
        for s in recent_sales[:3]:
            activity_feed.append({"id": f"s{s.id}", "action": f"Sale completed LKR {s.total:,.0f}", "module": "POS", "timestamp": s.created_at.isoformat(), "details": s.payment_method})
        activity_feed.sort(key=lambda x: x["timestamp"], reverse=True)

    return {
        "daily_revenue": daily_revenue,
        "repair_stats": {"total": total_repairs, "completed": completed_repairs},
        "customers_count": customers_count,
        "low_stock_count": len(low_stock_items),
        "low_stock_items": [{"id": i.id, "name": i.name, "quantity": i.quantity} for i in low_stock_items],
        "recent_transactions": [{"id": s.id, "total": s.total, "date": s.created_at.isoformat()} for s in recent_sales],
        "recent_repairs": [{
            "id": r.id,
            "customer": r.customer.name if r.customer else None,
            "device": r.device_model,
            "status": r.status,
            "tech": r.technician or "Unknown"
        } for r in recent_repairs],
        "activity_feed": activity_feed,
        "charts": {
            "revenue_overview": monthly_rev,
            "sales_breakdown": [
                {"name": "Phone Sales", "value": (db.query(func.coalesce(func.sum(Sale.total), 0)).scalar() or 0) * 0.48},
                {"name": "Repairs", "value": (db.query(func.coalesce(func.sum(Sale.total), 0)).scalar() or 0) * 0.31},
                {"name": "Accessories", "value": (db.query(func.coalesce(func.sum(Sale.total), 0)).scalar() or 0) * 0.21},
            ],
            "repair_status": [
                {"name": "Pending", "value": db.query(func.count(RepairTicket.id)).filter(RepairTicket.status == "Pending").scalar() or 0},
                {"name": "Completed", "value": db.query(func.count(RepairTicket.id)).filter(RepairTicket.status == "Completed").scalar() or 0},
            ]
        }
    }

