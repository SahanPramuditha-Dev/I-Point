import sys
import requests
from app.database import SessionLocal
from app.models import User
from app.auth import create_access_token
from datetime import timedelta

db = SessionLocal()
user = db.query(User).first()
if not user:
    print("No users found")
    sys.exit(1)

token = create_access_token(data={"sub": user.username}, expires_delta=timedelta(minutes=30))
print(f"Token for {user.username}: {token}")

try:
    headers = {"Authorization": f"Bearer {token}"}
    response = requests.get("http://127.0.0.1:8000/repairs/1/job-card-pdf", headers=headers)
    print(f"Status Code: {response.status_code}")
    print(f"Headers: {response.headers}")
    print(f"Text/Content: {response.text[:1000]}")
except Exception as e:
    print(f"Exception: {e}")
