# i Store Desktop Business Management System

Complete offline-first desktop software for a mobile repair and phone sales shop.

## Stack
- Frontend: React + Tailwind + Recharts
- Backend: FastAPI + SQLite
- Desktop: Electron + electron-builder
- Backup: Local SQLite backup + optional Firebase Storage upload

## Structure
- frontend/
- backend/
- electron/
- database/
- assets/

## Default Login
- Admin: `admin` / `admin123`
- Employee: `employee` / `emp123`

## Run (Development)
1. Backend (Python 3.13 + virtualenv)
```powershell
cd "C:\D\Projects\Python\I Store\V1\backend"
py -3.13 -m venv .venv
.\.venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```
Note: if `.venv` already exists, skip `py -3.13 -m venv .venv`.

Database migrations (Alembic):
```powershell
cd "C:\D\Projects\Python\I Store\V1\backend"
.\.venv\Scripts\activate
alembic upgrade head
```

Create a new migration:
```powershell
alembic revision -m "describe_change"
```

2. Frontend (Vite)
```powershell
cd "C:\D\Projects\Python\I Store\V1\frontend"
npm install
npm run dev
```

3. Electron desktop shell (optional, after backend + frontend are running)
```powershell
cd "C:\D\Projects\Python\I Store\V1\electron"
npm install
npm run dev
```

Frontend URL:
- `http://127.0.0.1:5173`

Backend URL:
- `http://127.0.0.1:8000`

Health check:
- `http://127.0.0.1:8000/health`

Default login:
- `admin / admin123`
- `employee / emp123`

Important:
- Do not run `cd backend` if your terminal is already inside `backend`.
- If you see `ModuleNotFoundError` (example: `sqlalchemy`), you are likely not using venv Python.
- Verify active interpreter:
```powershell
python -c "import sys; print(sys.executable)"
```
- It should point to: `...\V1\backend\.venv\Scripts\python.exe`

## Second-Time Run (Daily Start)
Use these when dependencies are already installed and `.venv` already exists.

1. Backend
```powershell
cd "C:\D\Projects\Python\I Store\V1\backend"
.\.venv\Scripts\activate
python -m uvicorn app.main:app --reload --port 8000
```

2. Frontend
```powershell
cd "C:\D\Projects\Python\I Store\V1\frontend"
npm run dev
```

3. Electron (optional)
```powershell
cd "C:\D\Projects\Python\I Store\V1\electron"
npm run dev
```

## Tests
Run backend smoke tests:
```powershell
cd "C:\D\Projects\Python\I Store\V1\backend"
.\.venv\Scripts\activate
pytest -q
```

## Build Windows Installer (.exe)
```powershell
cd electron
npm run build-win
```

## Firebase Backup Setup
- Put service account key at `assets/serviceAccountKey.json`
- Configure env values (see `.env.example`)

## Firebase Frontend Setup (Analytics + Web SDK)
1. Copy `.env.example` values into your runtime env (or create `.env` in project root).
2. Install frontend deps:
```powershell
cd frontend
npm install
```
3. Firebase initializes automatically from:
- `frontend/src/lib/firebase.js`
- imported in `frontend/src/main.jsx`

## Newly Added Business Features
- A4-first customizable print profiles (`Settings -> Print Format Settings`)
- Multi-format invoices (A4, 80mm, 58mm)
- Supplier management (`Inventory`)
- Barcode/SKU/name inventory search
- Customer purchase and repair history (`Customers -> History`)
- Repair queue search + delivered timestamp tracking
- POS payment method and customer assignment
- POS recent sales timeline
