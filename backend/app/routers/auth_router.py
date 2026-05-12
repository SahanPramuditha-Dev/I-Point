from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User
from app.auth import verify_password, create_access_token, get_current_user
from app.schemas import TokenResponse, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post('/login', response_model=TokenResponse)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username.ilike(form_data.username)).first()
    if not user or not verify_password(form_data.password, user.password_hash):
        raise HTTPException(status_code=401, detail='Invalid credentials')
    token = create_access_token({"sub": user.username, "role": user.role})
    return {"access_token": token}

@router.get('/me', response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user

@router.get('/staff')
def list_staff(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return db.query(User).filter(User.is_active == True).all()
