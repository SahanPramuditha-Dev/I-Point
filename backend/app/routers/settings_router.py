import json
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.auth import get_current_user
from app.models import User, AppSetting
from app.schemas import PrintProfileIn, EmployeeIn, EmployeeUpdateIn, UiPreferencesIn
from app.auth import hash_password

router = APIRouter(prefix="/settings", tags=["settings"])

PRINT_PROFILE_KEY = "print_profile"
UI_PREFERENCES_KEY = "ui_preferences"
BUSINESS_PREFS_KEY = "business_preferences"
INTEGRATIONS_PREFS_KEY = "integrations_preferences"

DEFAULT_PRINT_PROFILE = {
    "format": "A4",
    "store_name": "i Store",
    "store_address": "No 123, Main Street, Colombo",
    "store_phone": "+94 77 123 4567",
    "store_email": "info@istore.com",
    "store_website": "www.istore.com",
    "tax_number": "T-908827-X",
    "business_reg_no": "BR-5562",
    "footer_note": "Thank you. Visit again.",
    "show_logo": True,
    "logo_data": "",
    "logo_size": 80,
    "accent_color": "#0ea5e9",
    "font_family": "Inter",
    "show_shop_email": True,
    "show_shop_phone": True,
    "show_shop_website": True,
    "show_tax_no": False,
    "show_reg_no": False,
    "show_customer_address": True,
    "show_customer_phone": True,
    "show_customer_email": False,
    "show_invoice_date": True,
    "show_invoice_time": True,
    "show_cashier_name": True,
    "show_technician_name": True,
    "show_device_imei": True,
    "show_device_serial": False,
    "show_device_color": True,
    "show_device_condition": True,
    "show_device_accessories": True,
    "show_password_field": False,
    "show_sku_column": False,
    "show_warranty_column": True,
    "show_discount_column": True,
    "show_tax_column": True,
    "show_advance_payment": True,
    "show_remaining_balance": True,
    "show_bank_details": True,
    "show_return_policy": True,
    "show_warranty_terms": True,
    "show_signatures": True,
    "show_qr_code": True,
    "slogan": "Your No.01 Mobile Partner",
    "bank_details": "1000526309 - Commercial bank",
    "repair_terms": "1. Minimum diagnostic fee applies.\n2. Not responsible for data loss.",
    "return_policy": "1. Items can be returned within 7 days with original receipt.\n2. No cash refunds.",
    "warranty_terms": "Warranty covers hardware defects only.",
    "margin_mm": 10,
    "label_width": 50,
    "label_height": 25,
    "show_curves": True,
    "show_table_borders": True,
    "show_slogan": True
}

@router.get('/employees')
def employees(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(User).all()

@router.post('/employees')
def create_employee(payload: EmployeeIn, db: Session = Depends(get_db), _=Depends(get_current_user)):
    existing = db.query(User).filter(User.username == payload.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")
    user = User(
        username=payload.username.strip(),
        full_name=payload.full_name.strip(),
        password_hash=hash_password(payload.password),
        role=payload.role,
        is_active=payload.is_active,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

@router.put('/employees/{user_id}')
def update_employee(user_id: int, payload: EmployeeUpdateIn, db: Session = Depends(get_db), _=Depends(get_current_user)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Employee not found")
    data = payload.model_dump(exclude_none=True)
    if "full_name" in data:
        user.full_name = data["full_name"].strip()
    if "password" in data and data["password"]:
        user.password_hash = hash_password(data["password"])
    if "role" in data:
        user.role = data["role"]
    if "is_active" in data:
        user.is_active = data["is_active"]
    db.commit()
    db.refresh(user)
    return user

@router.delete('/employees/{user_id}')
def delete_employee(user_id: int, db: Session = Depends(get_db), _=Depends(get_current_user)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Employee not found")
    db.delete(user)
    db.commit()
    return {"ok": True}

@router.get('/print-profile')
def get_print_profile(db: Session = Depends(get_db), _=Depends(get_current_user)):
    row = db.query(AppSetting).filter(AppSetting.key == PRINT_PROFILE_KEY).first()
    if not row:
        row = AppSetting(key=PRINT_PROFILE_KEY, value=json.dumps(DEFAULT_PRINT_PROFILE))
        db.add(row)
        db.commit()
        return DEFAULT_PRINT_PROFILE
    try:
        return json.loads(row.value)
    except json.JSONDecodeError:
        return DEFAULT_PRINT_PROFILE

@router.put('/print-profile')
def update_print_profile(payload: PrintProfileIn, db: Session = Depends(get_db), _=Depends(get_current_user)):
    row = db.query(AppSetting).filter(AppSetting.key == PRINT_PROFILE_KEY).first()
    if not row:
        row = AppSetting(key=PRINT_PROFILE_KEY, value=json.dumps(payload.model_dump()))
        db.add(row)
    else:
        row.value = json.dumps(payload.model_dump())
    db.commit()
    return payload.model_dump()

@router.get('/ui-preferences')
def get_ui_preferences(db: Session = Depends(get_db), _=Depends(get_current_user)):
    row = db.query(AppSetting).filter(AppSetting.key == UI_PREFERENCES_KEY).first()
    if not row:
        defaults = {"theme": "dark", "compact_mode": False}
        row = AppSetting(key=UI_PREFERENCES_KEY, value=json.dumps(defaults))
        db.add(row)
        db.commit()
        return defaults
    try:
        return json.loads(row.value)
    except json.JSONDecodeError:
        return {"theme": "dark", "compact_mode": False}

@router.put('/ui-preferences')
def update_ui_preferences(payload: UiPreferencesIn, db: Session = Depends(get_db), _=Depends(get_current_user)):
    row = db.query(AppSetting).filter(AppSetting.key == UI_PREFERENCES_KEY).first()
    if not row:
        row = AppSetting(key=UI_PREFERENCES_KEY, value=json.dumps(payload.model_dump()))
        db.add(row)
    else:
        row.value = json.dumps(payload.model_dump())
    db.commit()
    return payload.model_dump()

@router.get('/business-preferences')
def get_business_preferences(db: Session = Depends(get_db), _=Depends(get_current_user)):
    row = db.query(AppSetting).filter(AppSetting.key == BUSINESS_PREFS_KEY).first()
    if not row:
        defaults = {"currency": "LKR", "tax_rate": 0, "date_format": "DD/MM/YYYY"}
        row = AppSetting(key=BUSINESS_PREFS_KEY, value=json.dumps(defaults))
        db.add(row)
        db.commit()
        return defaults
    try:
        return json.loads(row.value)
    except json.JSONDecodeError:
        return {"currency": "LKR", "tax_rate": 0, "date_format": "DD/MM/YYYY"}

@router.put('/business-preferences')
def update_business_preferences(payload: dict, db: Session = Depends(get_db), _=Depends(get_current_user)):
    row = db.query(AppSetting).filter(AppSetting.key == BUSINESS_PREFS_KEY).first()
    if not row:
        row = AppSetting(key=BUSINESS_PREFS_KEY, value=json.dumps(payload))
        db.add(row)
    else:
        row.value = json.dumps(payload)
    db.commit()
    return payload

@router.get('/integrations')
def get_integrations_preferences(db: Session = Depends(get_db), _=Depends(get_current_user)):
    row = db.query(AppSetting).filter(AppSetting.key == INTEGRATIONS_PREFS_KEY).first()
    if not row:
        defaults = {"whatsapp_api_key": "", "whatsapp_phone_number_id": "", "enable_sms_alerts": False}
        row = AppSetting(key=INTEGRATIONS_PREFS_KEY, value=json.dumps(defaults))
        db.add(row)
        db.commit()
        return defaults
    try:
        return json.loads(row.value)
    except json.JSONDecodeError:
        return {"whatsapp_api_key": "", "whatsapp_phone_number_id": "", "enable_sms_alerts": False}

@router.put('/integrations')
def update_integrations_preferences(payload: dict, db: Session = Depends(get_db), _=Depends(get_current_user)):
    row = db.query(AppSetting).filter(AppSetting.key == INTEGRATIONS_PREFS_KEY).first()
    if not row:
        row = AppSetting(key=INTEGRATIONS_PREFS_KEY, value=json.dumps(payload))
        db.add(row)
    else:
        row.value = json.dumps(payload)
    db.commit()
    return payload
