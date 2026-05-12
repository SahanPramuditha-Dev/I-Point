from datetime import datetime
import json
import logging
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
import io
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app.auth import get_current_user
from app.models import RepairTicket, InventoryItem, StockMovement, RepairPartUsage
from app.schemas import RepairIn, RepairPartConsumeIn

router = APIRouter(prefix="/repairs", tags=["repairs"])
logger = logging.getLogger("istore.api")

@router.get('')
def list_repairs(db: Session = Depends(get_db), _=Depends(get_current_user)):
    repairs = db.query(RepairTicket).order_by(RepairTicket.created_at.desc()).all()
    return [{
        "id": r.id,
        "ticket_no": r.ticket_no,
        "device_model": r.device_model,
        "imei": r.imei,
        "issue": r.issue,
        "status": r.status,
        "priority": r.priority,
        "technician": r.technician,
        "estimated_cost": r.estimated_cost,
        "created_at": r.created_at.isoformat(),
        "customer_name": r.customer.name if r.customer else "Unknown",
        "customer_phone": r.customer.phone if r.customer else "N/A"
    } for r in repairs]

@router.get('/dashboard-stats')
def get_repair_stats(db: Session = Depends(get_db), _=Depends(get_current_user)):
    total = db.query(RepairTicket).count()
    pending = db.query(RepairTicket).filter(RepairTicket.status == "Pending").count()
    in_progress = db.query(RepairTicket).filter(RepairTicket.status.in_(["Diagnosing", "Repairing", "Waiting for Parts"])).count()
    completed = db.query(RepairTicket).filter(RepairTicket.status == "Completed").count()
    revenue_today = db.query(func.sum(RepairTicket.estimated_cost))\
                      .filter(RepairTicket.status == "Delivered")\
                      .filter(RepairTicket.delivered_at >= datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0))\
                      .scalar() or 0
    return {
        "total": total,
        "pending": pending,
        "in_progress": in_progress,
        "completed": completed,
        "revenue_today": revenue_today
    }

@router.post('')
def create_repair(payload: RepairIn, db: Session = Depends(get_db), _=Depends(get_current_user)):
    from app.models import RepairHistory
    ticket = RepairTicket(
        ticket_no=f"R-{int(db.query(RepairTicket).count()) + 1001}",
        **payload.model_dump()
    )
    db.add(ticket)
    db.flush()
    db.add(RepairHistory(repair_id=ticket.id, status="Intake", note="Device received for repair."))
    db.commit()
    db.refresh(ticket)
    return {
        "id": ticket.id,
        "ticket_no": ticket.ticket_no,
        "device_model": ticket.device_model,
        "imei": ticket.imei,
        "issue": ticket.issue,
        "status": ticket.status,
        "priority": ticket.priority,
        "technician": ticket.technician,
        "estimated_cost": ticket.estimated_cost,
        "created_at": ticket.created_at.isoformat(),
        "customer_name": ticket.customer.name if ticket.customer else "Unknown",
        "customer_phone": ticket.customer.phone if ticket.customer else "N/A"
    }

@router.put('/{repair_id}')
def update_repair(repair_id: int, payload: RepairIn, db: Session = Depends(get_db), _=Depends(get_current_user)):
    repair = db.query(RepairTicket).filter(RepairTicket.id == repair_id).first()
    if not repair:
        raise HTTPException(status_code=404, detail="Repair not found")
    for k, v in payload.model_dump().items():
        setattr(repair, k, v)
    db.commit()
    db.refresh(repair)
    return {
        "id": repair.id,
        "ticket_no": repair.ticket_no,
        "device_model": repair.device_model,
        "imei": repair.imei,
        "issue": repair.issue,
        "status": repair.status,
        "priority": repair.priority,
        "technician": repair.technician,
        "estimated_cost": repair.estimated_cost,
        "created_at": repair.created_at.isoformat(),
        "customer_name": repair.customer.name if repair.customer else "Unknown",
        "customer_phone": repair.customer.phone if repair.customer else "N/A"
    }

@router.delete('/{repair_id}')
def delete_repair(repair_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    repair = db.query(RepairTicket).filter(RepairTicket.id == repair_id).first()
    if not repair:
        raise HTTPException(status_code=404, detail="Repair not found")
    db.delete(repair)
    db.commit()
    return {"ok": True}

@router.put('/{repair_id}/status')
def update_repair_status(repair_id: int, status: str, request: Request, note: str = None, db: Session = Depends(get_db), _=Depends(get_current_user)):
    from app.models import Customer, RepairHistory
    repair = db.query(RepairTicket).filter(RepairTicket.id == repair_id).first()
    if not repair:
        raise HTTPException(status_code=404, detail="Repair not found")
    
    old_status = repair.status
    repair.status = status
    if status == "Delivered":
        repair.delivered_at = datetime.utcnow()
    
    db.add(RepairHistory(
        repair_id=repair_id, 
        status=status, 
        note=note if note else f"Status changed from {old_status} to {status}"
    ))
    db.commit()
    logger.info(json.dumps({
        "event": "repair_status_changed",
        "request_id": getattr(request.state, "request_id", None),
        "repair_id": repair.id,
        "status": status,
    }))

    # Generate notification link if possible
    whatsapp_url = None
    customer = db.query(Customer).filter(Customer.id == repair.customer_id).first()
    if customer and customer.phone:
        phone = customer.phone.replace(" ", "").replace("-", "")
        if not phone.startswith("+"): phone = "94" + phone.lstrip("0") # Default to Sri Lanka if no country code
        message = f"Hello {customer.name}, your device ({repair.device_model}) repair status is now: {status}. Total estimated: LKR {repair.estimated_cost}. - i Store"
        import urllib.parse
        whatsapp_url = f"https://wa.me/{phone}?text={urllib.parse.quote(message)}"

    return {"ok": True, "whatsapp_url": whatsapp_url}

@router.get('/{repair_id}/timeline')
def get_timeline(repair_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    from app.models import RepairHistory
    return db.query(RepairHistory).filter(RepairHistory.repair_id == repair_id).order_by(RepairHistory.created_at.asc()).all()

@router.get('/{repair_id}/parts')
def repair_parts(repair_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    rows = db.query(RepairPartUsage).filter(RepairPartUsage.repair_id == repair_id).order_by(RepairPartUsage.created_at.desc()).all()
    return [{
        "id": r.id,
        "item_id": r.item_id,
        "item_name": r.item.name if r.item else "",
        "quantity": r.quantity,
        "unit_cost": r.unit_cost,
        "created_at": r.created_at.isoformat()
    } for r in rows]

@router.post('/{repair_id}/consume-part')
def consume_part(repair_id: int, payload: RepairPartConsumeIn, db: Session = Depends(get_db), _=Depends(get_current_user)):
    repair = db.query(RepairTicket).filter(RepairTicket.id == repair_id).first()
    if not repair:
        raise HTTPException(status_code=404, detail="Repair not found")
    item = db.query(InventoryItem).filter(InventoryItem.id == payload.item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    if item.quantity < payload.quantity:
        raise HTTPException(status_code=400, detail="Insufficient stock")
    item.quantity -= payload.quantity
    usage = RepairPartUsage(repair_id=repair_id, item_id=item.id, quantity=payload.quantity, unit_cost=item.sale_price)
    db.add(usage)
    db.add(StockMovement(
        item_id=item.id,
        movement_type="REPAIR_CONSUME",
        quantity=-payload.quantity,
        reference_type="repair",
        reference_id=repair_id,
        note=f"Consumed for {repair.ticket_no}"
    ))
    db.commit()
    db.refresh(usage)
    return {"ok": True, "usage_id": usage.id, "remaining_stock": item.quantity}

@router.get('/{repair_id}/job-card-pdf')
def generate_job_card_pdf(repair_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    print(f"DEBUG: PDF request received for repair_id={repair_id}")
    from fpdf import FPDF
    from sqlalchemy.orm import joinedload
    from app.models import RepairPartUsage
    
    repair = db.query(RepairTicket).options(joinedload(RepairTicket.customer)).filter(RepairTicket.id == repair_id).first()
    if not repair:
        raise HTTPException(status_code=404, detail=f"Repair ID {repair_id} not found in database")

    parts = db.query(RepairPartUsage).options(joinedload(RepairPartUsage.item)).filter(RepairPartUsage.repair_id == repair.id).all()
    parts_total = sum(p.quantity * p.unit_cost for p in parts)

    est_cost = repair.estimated_cost or 0
    grand_total = est_cost + parts_total
    
    is_final = repair.status in ["Completed", "Delivered"]
    doc_title = "FINAL INVOICE" if is_final else "REPAIR JOB CARD"

    customer_name = repair.customer.name if repair.customer else "Valued Customer"
    customer_phone = repair.customer.phone if repair.customer else "N/A"

    pdf = FPDF()
    pdf.add_page()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.set_margins(15, 15, 15)

    # Outer Border
    pdf.set_line_width(0.5)
    pdf.set_draw_color(99, 102, 241) # Indigo border
    pdf.rect(10, 10, 190, 277)

    # ── Header ──────────────────────────────────────────────
    pdf.set_font("Helvetica", "B", 26)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(90, 12, "i Store", ln=False, align="L")
    
    pdf.set_font("Helvetica", "B", 20)
    pdf.set_text_color(99, 102, 241)
    pdf.cell(90, 12, doc_title, ln=True, align="R")
    
    pdf.set_font("Helvetica", "I", 10)
    pdf.set_text_color(100, 100, 100)
    pdf.cell(90, 6, "Expert Mobile & Apple Device Repair Center", ln=False, align="L")
    
    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(220, 38, 38) # Red for ticket number
    pdf.cell(90, 6, f"TICKET NO: {repair.ticket_no}", ln=True, align="R")

    pdf.set_draw_color(220, 220, 220)
    pdf.set_line_width(0.3)
    pdf.line(15, 35, 195, 35)
    pdf.ln(10)

    # ── Helper: labelled field ───────────────────────────────
    def two_fields(l1, v1, l2, v2):
        x = pdf.get_x()
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_text_color(140, 140, 140)
        pdf.cell(90, 5, l1.upper())
        pdf.set_x(x + 90)
        pdf.cell(90, 5, l2.upper(), ln=True)
        pdf.set_font("Helvetica", "B", 11)
        pdf.set_text_color(30, 30, 30)
        pdf.set_x(x)
        pdf.cell(90, 7, str(v1))
        pdf.set_x(x + 90)
        pdf.cell(90, 7, str(v2), ln=True)
        pdf.ln(5)

    # ── Information Section ──────────────────────────────────
    from datetime import date
    two_fields("Date", date.today().strftime('%d %B %Y'), "Technician", repair.technician or "N/A")
    two_fields("Customer Name", customer_name, "Contact Number", customer_phone)
    two_fields("Device Model", repair.device_model, "IMEI / Serial", repair.imei or "N/A")

    # ── Issue box ────────────────────────────────────────────
    pdf.ln(2)
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_text_color(140, 140, 140)
    pdf.cell(0, 5, "REPORTED ISSUE / FAULT DESCRIPTION", ln=True)
    pdf.set_fill_color(248, 250, 252) # Slate 50
    pdf.set_draw_color(203, 213, 225) # Slate 300
    pdf.set_font("Helvetica", "", 11)
    pdf.set_text_color(15, 23, 42)
    pdf.multi_cell(180, 8, repair.issue or "N/A", border=1, fill=True)
    pdf.ln(8)
    
    # ── Parts Consumed (If any) ──────────────────────────────
    if parts:
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_text_color(140, 140, 140)
        pdf.cell(0, 5, "PARTS CONSUMED", ln=True)
        pdf.set_fill_color(255, 255, 255)
        pdf.set_font("Helvetica", "", 10)
        pdf.set_text_color(30, 30, 30)
        for p in parts:
            item_name = p.item.name if p.item else "Unknown Part"
            cost_str = f"LKR {p.unit_cost * p.quantity:,.0f}"
            pdf.cell(140, 6, f"- {item_name} (x{p.quantity})", border=0)
            pdf.cell(40, 6, cost_str, border=0, align="R", ln=True)
        pdf.ln(5)

    # ── Cost box ─────────────────────────────────────────────
    pdf.set_fill_color(238, 242, 255) # Indigo 50
    pdf.set_draw_color(199, 210, 254) # Indigo 200
    
    box_height = 28 if parts else 20
    pdf.rect(15, pdf.get_y(), 180, box_height, style="DF")
    
    y_start = pdf.get_y() + 6
    pdf.set_xy(20, y_start)
    
    # Labor line
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(67, 56, 202) # Indigo 700
    pdf.cell(90, 6, "LABOR CHARGE:" if is_final else "ESTIMATED LABOR COST:")
    pdf.set_font("Helvetica", "B", 12)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(80, 6, f"LKR {est_cost:,.0f}", align="R", ln=True)
    
    if parts:
        pdf.set_xy(20, pdf.get_y() + 2)
        pdf.set_font("Helvetica", "B", 11)
        pdf.set_text_color(67, 56, 202)
        pdf.cell(90, 8, "ACTUAL GRAND TOTAL:")
        pdf.set_font("Helvetica", "B", 16)
        pdf.set_text_color(15, 23, 42)
        pdf.cell(80, 8, f"LKR {grand_total:,.0f}", align="R", ln=True)

    pdf.ln(15 if not parts else 10)

    # ── Terms ────────────────────────────────────────────────
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(15, 23, 42)
    pdf.cell(0, 6, "Store Policy & Terms of Service:", ln=True)
    
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(100, 100, 100)
    terms = [
        "Please present this original job card during device collection.",
        "Devices not claimed within 60 days of completion will be disposed of to recover costs.",
        "We are not responsible for any data loss during the repair process. Please ensure you have a backup.",
        "A 90-day warranty applies to replaced parts only (excludes physical damage, liquid damage, or software issues).",
        "The estimated cost is subject to change upon deep diagnosis. You will be notified before proceeding."
    ]
    for i, t in enumerate(terms, 1):
        pdf.cell(0, 5, f"{i}. {t}", ln=True)

    pdf.ln(25)
    
    # ── Signatures ───────────────────────────────────────────
    y = pdf.get_y()
    pdf.set_draw_color(150, 150, 150)
    pdf.set_line_width(0.3)
    
    pdf.line(20, y, 80, y)
    pdf.set_xy(20, y + 2)
    pdf.set_font("Helvetica", "I", 8)
    pdf.cell(60, 5, "Customer Signature", align="C")

    pdf.line(110, y, 180, y)
    pdf.set_xy(110, y + 2)
    pdf.cell(70, 5, "Authorized Signature (i Store)", align="C")

    # ── Footer ───────────────────────────────────────────────
    pdf.set_y(260)
    pdf.set_font("Helvetica", "I", 9)
    pdf.set_text_color(160, 160, 160)
    pdf.cell(0, 5, "Thank you for your trust in i Store! | Visit us again.", ln=True, align="C")

    # ── Stream response ──────────────────────────────────────
    pdf_bytes = pdf.output()
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"inline; filename=JobCard-{repair.ticket_no}.pdf",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Expose-Headers": "Content-Disposition"
        }
    )
