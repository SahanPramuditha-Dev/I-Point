import json
import logging
import time
import uuid
from fastapi import FastAPI, Request, Depends
from app.database import SessionLocal, get_db
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from app.routers.auth_router import router as auth_router
from app.routers.dashboard_router import router as dashboard_router
from app.routers.repair_router import router as repair_router
from app.routers.inventory_router import router as inventory_router
from app.routers.pos_router import router as pos_router
from app.routers.customer_router import router as customer_router
from app.routers.report_router import router as report_router
from app.routers.backup_router import router as backup_router
from app.routers.settings_router import router as settings_router
from app.routers.purchase_router import router as purchase_router
from app.routers.search_router import router as search_router
from app.routers.ledger_router import router as ledger_router
from app.routers.notification_router import router as notification_router
from app.config import settings
from app.migrations import migrate
from app.seed import seed_data

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("backend.log"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger("istore.api")

app = FastAPI(title="i Store API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3000", "*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "Content-Type", "X-Total-Count", "*"]
)

app.include_router(auth_router)
app.include_router(dashboard_router)
app.include_router(repair_router)
app.include_router(inventory_router)
app.include_router(pos_router)
app.include_router(customer_router)
app.include_router(report_router)
app.include_router(backup_router)
app.include_router(settings_router)
app.include_router(purchase_router)
app.include_router(search_router)
app.include_router(ledger_router)
app.include_router(notification_router)

@app.middleware("http")
async def request_monitor_middleware(request: Request, call_next):
    print(f"--> [REQ] {request.method} {request.url.path}")
    start = time.perf_counter()
    try:
        response = await call_next(request)
        elapsed_ms = round((time.perf_counter() - start) * 1000, 2)
        print(f"<-- [RES] {request.method} {request.url.path} - {response.status_code} ({elapsed_ms}ms)")
        return response
    except Exception as e:
        print(f"!!! [ERR] {request.method} {request.url.path} - {str(e)}")
        return Response(content=str(e), status_code=500)

@app.on_event("startup")
def startup_event():
    try:
        # migrate() - Disabled to prevent startup hang
        # seed_data() - Disabled to prevent schema conflict crashes
        
        # Ensure at least one admin exists so user isn't locked out
        from app.models import User
        from app.auth import hash_password
        from app.database import SessionLocal
        with SessionLocal() as db:
            if not db.query(User).filter(User.username == "admin").first():
                admin = User(
                    username="admin", 
                    full_name="Administrator", 
                    password_hash=hash_password("admin123"), 
                    role="admin",
                    is_active=True
                )
                db.add(admin)
                db.commit()
                logger.info("Emergency Admin Created: admin / admin123")
                
        logger.info("Application startup complete.")
    except Exception as e:
        logger.error(f"Startup failed: {e}")
        import traceback
        logger.error(traceback.format_exc())
        # In production, we might want to exit, but let's see the error first
        raise e

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"GLOBAL ERROR: {exc}")
    import traceback
    logger.error(traceback.format_exc())
    return Response(
        content=json.dumps({"detail": str(exc), "traceback": traceback.format_exc()}),
        status_code=500,
        media_type="application/json"
    )

@app.get('/debug-db')
def debug_db(db: SessionLocal = Depends(get_db)):
    from app.models import RepairTicket
    count = db.query(RepairTicket).count()
    return {
        "sqlite_url": settings.sqlite_url,
        "count": count,
        "env": settings.env
    }

@app.get('/health')
def health():
    return {"status": "ok"}
