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
DEFAULT_PRINT_PROFILE = {
    "format": "A4",
    "store_name": "i Store",
    "store_address": "",
    "store_phone": "",
    "footer_note": "Thank you. Visit again.",
    "show_logo": False,
    "margin_mm": 10,
    "accent_color": "#0ea5e9"
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
