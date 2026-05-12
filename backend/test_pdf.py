import sys
import io
from app.database import SessionLocal
from app.models import RepairTicket
from sqlalchemy.orm import joinedload
from fpdf import FPDF

db = SessionLocal()
repair_id = 1
repair = db.query(RepairTicket).options(joinedload(RepairTicket.customer)).filter(RepairTicket.id == repair_id).first()
if not repair:
    print(f"Repair {repair_id} not found")
    sys.exit(1)

print(f"Generating PDF for repair: {repair.ticket_no}")
est_cost = repair.estimated_cost or 0
customer_name = repair.customer.name if repair.customer else "Valued Customer"
customer_phone = repair.customer.phone if repair.customer else "N/A"

pdf = FPDF()
pdf.add_page()
pdf.set_auto_page_break(auto=True, margin=15)
pdf.set_margins(20, 20, 20)

pdf.set_font("Helvetica", "B", 22)
pdf.set_text_color(99, 102, 241)   # indigo
pdf.cell(0, 10, "i Store", ln=True, align="C")

pdf.set_font("Helvetica", "", 9)
pdf.set_text_color(120, 120, 120)
pdf.cell(0, 6, "Expert Mobile & Apple Device Repair Center", ln=True, align="C")
pdf.ln(4)

pdf.set_draw_color(220, 220, 220)
pdf.set_line_width(0.5)
pdf.line(20, pdf.get_y(), 190, pdf.get_y())
pdf.ln(8)

pdf.set_font("Helvetica", "B", 28)
pdf.set_text_color(99, 102, 241)
pdf.cell(95, 12, f"#{repair.ticket_no}", ln=False, align="L")

pdf.set_font("Helvetica", "", 10)
pdf.set_text_color(80, 80, 80)
from datetime import date
pdf.cell(95, 12, f"Date: {date.today().strftime('%d %B %Y')}", ln=True, align="R")
pdf.ln(6)

def field(label, value, w=170):
    pdf.set_font("Helvetica", "B", 7)
    pdf.set_text_color(140, 140, 140)
    pdf.cell(w, 5, label.upper(), ln=True)
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(30, 30, 30)
    pdf.cell(w, 7, str(value), ln=True)
    pdf.ln(3)

def two_fields(l1, v1, l2, v2):
    x = pdf.get_x()
    y = pdf.get_y()
    pdf.set_font("Helvetica", "B", 7)
    pdf.set_text_color(140, 140, 140)
    pdf.cell(85, 5, l1.upper())
    pdf.set_x(x + 85)
    pdf.cell(85, 5, l2.upper(), ln=True)
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(30, 30, 30)
    pdf.set_x(x)
    pdf.cell(85, 7, str(v1))
    pdf.set_x(x + 85)
    pdf.cell(85, 7, str(v2), ln=True)
    pdf.ln(4)

field("Customer Details", customer_name)
pdf.set_font("Helvetica", "", 10)
pdf.set_text_color(100, 100, 100)
pdf.cell(0, 5, customer_phone, ln=True)
pdf.ln(4)

two_fields("Device Model", repair.device_model, "IMEI / Serial", repair.imei or "N/A")

pdf.set_font("Helvetica", "B", 7)
pdf.set_text_color(140, 140, 140)
pdf.cell(0, 5, "REPORTED ISSUE", ln=True)
pdf.set_fill_color(249, 250, 251)
pdf.set_draw_color(220, 220, 220)
pdf.set_font("Helvetica", "", 10)
pdf.set_text_color(40, 40, 40)
pdf.multi_cell(170, 6, repair.issue or "N/A", border=1, fill=True)
pdf.ln(5)

# ── Cost + technician ────────────────────────────────────
two_fields(
    "Estimated Labor Cost", f"LKR {float(est_cost):,.0f}",
    "Technician", repair.technician or "N/A"
)

# ── Divider ──────────────────────────────────────────────
pdf.ln(4)
pdf.set_draw_color(220, 220, 220)
pdf.line(20, pdf.get_y(), 190, pdf.get_y())
pdf.ln(6)

pdf.set_font("Helvetica", "B", 8)
pdf.set_text_color(80, 80, 80)
pdf.cell(0, 5, "Store Policy & Terms:", ln=True)
pdf.set_font("Helvetica", "", 8)
pdf.set_text_color(120, 120, 120)
terms = [
    "Please present this job card during collection.",
    "Devices not claimed within 60 days will be disposed of.",
    "We are not responsible for any data loss. Please backup.",
    "90-day warranty on parts replaced (excludes physical/liquid damage).",
]
for i, t in enumerate(terms, 1):
    pdf.cell(0, 5, f"{i}. {t}", ln=True)

pdf.ln(6)
pdf.set_font("Helvetica", "I", 9)
pdf.set_text_color(160, 160, 160)
pdf.cell(0, 5, "Thank you for your trust!", ln=True, align="C")

# ── Stream response ──────────────────────────────────────
print("Calling pdf.output()")
pdf_bytes = pdf.output()
print("Success! type:", type(pdf_bytes))
