import json
import importlib
import logging
import time
import uuid
from pathlib import Path
from fastapi import FastAPI, Request, Depends
from app.database import SessionLocal, get_db
from fastapi.responses import Response, JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy import inspect as sa_inspect
from app.database import Base, engine
import app.models  # noqa: F401  # ensure model metadata is registered
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
from app.routers.expenses_router import router as expenses_router
from app.routers.search_router import router as search_router
from app.routers.ledger_router import router as ledger_router
from app.routers.notification_router import router as notification_router
from app.routers.returns_router import router as returns_router
from app.routers.warranty_router import router as warranty_router
from app.routers.financial_audit_router import router as financial_audit_router
from app.routers.labels_router import router as labels_router
from app.routers.audit_trail_router import router as audit_trail_router
from app.config import settings
from app.auth import require_module_access
from app.migrations import migrate
from app.seed import seed_data
from app.services.security_service import get_request_device_info, get_request_ip, record_security_audit
BACKUP_SCHEDULER_AVAILABLE = True
try:
    from app.services.backup_scheduler import init_backup_scheduler, shutdown_backup_scheduler
except Exception:
    BACKUP_SCHEDULER_AVAILABLE = False
    # Scheduler is optional in local/dev when apscheduler is not installed.
    def init_backup_scheduler():
        return None

    def shutdown_backup_scheduler():
        return None

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
UPLOADS_DIR = Path(__file__).resolve().parents[1] / "uploads"
FAVICON_PATH = Path(__file__).resolve().parents[2] / "frontend" / "public" / "favicon.ico"


def _safe_user_id(user) -> int | None:
    if user is None:
        return None
    # Read from instance dict first to avoid detached-instance attribute loads.
    user_id = getattr(user, "__dict__", {}).get("id")
    if user_id is not None:
        return int(user_id)
    try:
        identity = sa_inspect(user).identity
        if identity and identity[0] is not None:
            return int(identity[0])
    except Exception:
        return None
    return None


def _safe_request_log(message: str) -> None:
    """
    Avoid crashing request flow when stdout pipe is detached (WinError 233),
    which can happen if the backend launcher console is closed.
    """
    try:
        print(message)
    except OSError:
        logger.info(message)


def _sqlite_table_exists(db, table_name: str) -> bool:
    row = db.execute(
        text("SELECT name FROM sqlite_master WHERE type='table' AND name=:name"),
        {"name": table_name},
    ).first()
    return bool(row)


def ensure_inventory_schema_columns() -> None:
    """
    Lightweight runtime migration for SQLite installs where Alembic is disabled.
    Adds newly introduced inventory columns if missing.
    """
    required_columns = {
        "brand": "TEXT",
        "model": "TEXT",
        "storage": "TEXT",
        "color": "TEXT",
        "condition": "TEXT",
        "product_type": "TEXT",
        "location": "TEXT",
        "image_url": "TEXT",
        "warranty_days": "INTEGER DEFAULT 0",
        "damaged_quantity": "INTEGER DEFAULT 0",
    }
    stock_movement_required_columns = {
        "user_id": "INTEGER",
    }
    grn_required_columns = {
        "po_id": "INTEGER",
    }
    with SessionLocal() as db:
        supplier_required_columns = {
            "email": "TEXT",
            "address": "TEXT",
            "notes": "TEXT",
            "payment_terms_days": "INTEGER DEFAULT 0",
            "opening_balance": "REAL DEFAULT 0",
        }
        customer_required_columns = {
            "birthday": "DATE",
            "notes": "TEXT",
        }
        if _sqlite_table_exists(db, "suppliers"):
            supplier_rows = db.execute(text("PRAGMA table_info(suppliers)")).fetchall()
            supplier_existing = {r[1] for r in supplier_rows}
            for column, col_type in supplier_required_columns.items():
                if column not in supplier_existing:
                    db.execute(text(f"ALTER TABLE suppliers ADD COLUMN {column} {col_type}"))

        if _sqlite_table_exists(db, "customers"):
            customer_rows = db.execute(text("PRAGMA table_info(customers)")).fetchall()
            customer_existing = {r[1] for r in customer_rows}
            for column, col_type in customer_required_columns.items():
                if column not in customer_existing:
                    db.execute(text(f"ALTER TABLE customers ADD COLUMN {column} {col_type}"))

        if _sqlite_table_exists(db, "inventory_items"):
            rows = db.execute(text("PRAGMA table_info(inventory_items)")).fetchall()
            existing = {r[1] for r in rows}
            for column, col_type in required_columns.items():
                if column not in existing:
                    db.execute(text(f"ALTER TABLE inventory_items ADD COLUMN {column} {col_type}"))

        if _sqlite_table_exists(db, "stock_movements"):
            move_rows = db.execute(text("PRAGMA table_info(stock_movements)")).fetchall()
            move_existing = {r[1] for r in move_rows}
            for column, col_type in stock_movement_required_columns.items():
                if column not in move_existing:
                    db.execute(text(f"ALTER TABLE stock_movements ADD COLUMN {column} {col_type}"))

        if _sqlite_table_exists(db, "goods_received_notes"):
            grn_rows = db.execute(text("PRAGMA table_info(goods_received_notes)")).fetchall()
            grn_existing = {r[1] for r in grn_rows}
            for column, col_type in grn_required_columns.items():
                if column not in grn_existing:
                    db.execute(text(f"ALTER TABLE goods_received_notes ADD COLUMN {column} {col_type}"))
        db.commit()


def ensure_tables_exist() -> None:
    """
    Ensure newly introduced ORM tables exist for local/dev SQLite databases.
    Safe to call repeatedly.
    """
    # Tests can reload app.database and app.main without reloading app.models first.
    # If metadata is empty, reload models so classes bind to the current Base.
    if "users" not in Base.metadata.tables:
        import app.models as models_module
        importlib.reload(models_module)
    Base.metadata.create_all(bind=engine)


def ensure_security_schema_columns() -> None:
    """
    Runtime migration for auth/rbac columns on existing SQLite deployments.
    """
    required_user_columns = {
        "role_id": "INTEGER",
        "pin_hash": "TEXT",
        "phone_number": "TEXT",
        "email": "TEXT",
        "profile_photo": "TEXT",
        "notes": "TEXT",
        "failed_login_count": "INTEGER DEFAULT 0",
        "account_locked_until": "DATETIME",
        "last_login_at": "DATETIME",
        "last_password_change_at": "DATETIME",
        "is_deleted": "BOOLEAN DEFAULT 0",
        "deleted_at": "DATETIME",
        "created_at": "DATETIME",
        "updated_at": "DATETIME",
    }
    with SessionLocal() as db:
        if not _sqlite_table_exists(db, "users"):
            return
        rows = db.execute(text("PRAGMA table_info(users)")).fetchall()
        existing = {r[1] for r in rows}
        for column, col_type in required_user_columns.items():
            if column not in existing:
                db.execute(text(f"ALTER TABLE users ADD COLUMN {column} {col_type}"))
        db.commit()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "Content-Type", "X-Total-Count"]
)

app.include_router(auth_router)
app.include_router(dashboard_router, dependencies=[Depends(require_module_access("dashboard"))])
app.include_router(repair_router, dependencies=[Depends(require_module_access("repairs"))])
app.include_router(inventory_router, dependencies=[Depends(require_module_access("inventory"))])
app.include_router(pos_router, dependencies=[Depends(require_module_access("pos"))])
app.include_router(customer_router, dependencies=[Depends(require_module_access("customers"))])
app.include_router(report_router, dependencies=[Depends(require_module_access("reports"))])
app.include_router(backup_router, dependencies=[Depends(require_module_access("backup"))])
app.include_router(settings_router, dependencies=[Depends(require_module_access("settings"))])
app.include_router(purchase_router, dependencies=[Depends(require_module_access("suppliers"))])
app.include_router(expenses_router, dependencies=[Depends(require_module_access("expenses"))])
app.include_router(search_router, dependencies=[Depends(require_module_access("dashboard"))])
app.include_router(ledger_router, dependencies=[Depends(require_module_access("financial_audit"))])
app.include_router(notification_router, dependencies=[Depends(require_module_access("dashboard"))])
app.include_router(returns_router, dependencies=[Depends(require_module_access("returns"))])
app.include_router(warranty_router, dependencies=[Depends(require_module_access("warranty"))])
app.include_router(financial_audit_router, dependencies=[Depends(require_module_access("financial_audit"))])
app.include_router(labels_router, dependencies=[Depends(require_module_access("labels"))])
app.include_router(audit_trail_router, dependencies=[Depends(require_module_access("audit_logs"))])
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")


def _write_module_audit_log(request: Request, status_code: int, elapsed_ms: float) -> None:
    module = getattr(request.state, "audit_module", None)
    action = getattr(request.state, "audit_action", None)
    if not module or not action:
        return
    user_id = (
        getattr(request.state, "audit_user_id", None)
        or getattr(request.state, "current_user_id", None)
        or _safe_user_id(getattr(request.state, "current_user", None))
    )
    target_ref = request.url.path
    if request.url.query:
        target_ref = f"{target_ref}?{request.url.query[:250]}"
    result = "success" if 200 <= int(status_code) < 400 else "failed"
    detail = f"{request.method} {request.url.path} -> {status_code}"
    metadata = {
        "method": request.method,
        "path": request.url.path,
        "query": request.url.query or None,
        "status_code": int(status_code),
        "elapsed_ms": float(elapsed_ms),
    }
    try:
        with SessionLocal() as db:
            record_security_audit(
                db=db,
                action=str(action),
                user_id=user_id,
                target_type=str(module),
                target_ref=target_ref,
                detail=detail,
                ip_address=get_request_ip(request),
                device_info=get_request_device_info(request),
                result=result,
                metadata=metadata,
            )
    except Exception as log_error:
        logger.warning(f"Failed to write module audit log: {log_error}")

@app.middleware("http")
async def request_monitor_middleware(request: Request, call_next):
    _safe_request_log(f"--> [REQ] {request.method} {request.url.path}")
    start = time.perf_counter()
    try:
        response = await call_next(request)
        elapsed_ms = round((time.perf_counter() - start) * 1000, 2)
        _safe_request_log(f"<-- [RES] {request.method} {request.url.path} - {response.status_code} ({elapsed_ms}ms)")
        _write_module_audit_log(request, response.status_code, elapsed_ms)
        return response
    except Exception as e:
        elapsed_ms = round((time.perf_counter() - start) * 1000, 2)
        _write_module_audit_log(request, 500, elapsed_ms)
        _safe_request_log(f"!!! [ERR] {request.method} {request.url.path} - {str(e)}")
        raise

@app.on_event("startup")
def startup_event():
    try:
        # Optional Alembic migrations with safety backup.
        if settings.auto_migrate_enabled:
            migrate_allowed = True
            if settings.backup_before_migrate:
                from app.services.backup_service import create_backup

                try:
                    with SessionLocal() as db:
                        create_backup(db, is_auto=False, trigger="pre-migration")
                    logger.info("Pre-migration backup completed successfully.")
                except Exception as backup_error:
                    migrate_allowed = False
                    logger.error(f"Pre-migration backup failed; migration skipped for safety: {backup_error}")
            if migrate_allowed:
                try:
                    migrate()
                    logger.info("Alembic migration completed.")
                except Exception as migration_error:
                    logger.error(f"Alembic migration failed: {migration_error}")

        ensure_tables_exist()
        ensure_security_schema_columns()
        ensure_inventory_schema_columns()
        if settings.env.lower() != "production":
            # Development/test baseline data (idempotent inserts).
            seed_data()
        from app.services.warranty_service import ensure_warranty_defaults
        from app.services.labels_service import ensure_label_defaults
        from app.services.security_service import ensure_security_defaults
        with SessionLocal() as _db:
            ensure_warranty_defaults(_db)
            ensure_label_defaults(_db)

        # Ensure at least one admin exists so user isn't locked out
        from app.models import User
        from app.auth import hash_password
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
        with SessionLocal() as _db:
            ensure_security_defaults(_db)

        # Initialize backup scheduler
        init_backup_scheduler()
        if not BACKUP_SCHEDULER_AVAILABLE:
            logger.warning("Backup scheduler disabled (missing optional dependency: apscheduler).")
                
        logger.info("Application startup complete.")
    except Exception as e:
        logger.error(f"Startup failed: {e}")
        import traceback
        logger.error(traceback.format_exc())
        # Keep API alive even if a non-critical startup step fails.
        # This prevents full process crash loops in local/dev.
        logger.warning("Continuing startup in degraded mode.")

@app.on_event("shutdown")
def shutdown_event():
    """Shut down background services."""
    try:
        shutdown_backup_scheduler()
        logger.info("Application shutdown complete.")
    except Exception as e:
        import traceback
        logger.error(f"Shutdown error: {e}")
        logger.error(traceback.format_exc())
        logger.warning("Shutdown completed with errors.")

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"GLOBAL ERROR: {exc}")
    import traceback
    logger.error(traceback.format_exc())
    headers = {}
    origin = request.headers.get("origin")
    allowed = set(settings.cors_origins)
    if origin in allowed:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
    return JSONResponse(
        content={"detail": str(exc), "traceback": traceback.format_exc()},
        status_code=500,
        headers=headers,
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


@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    if FAVICON_PATH.exists():
        return FileResponse(FAVICON_PATH)
    return Response(status_code=204)
