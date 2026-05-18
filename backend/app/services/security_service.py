import json
import importlib
import re
import uuid
from datetime import datetime, timedelta
from typing import Any

from fastapi import HTTPException, Request
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import Base, engine
from app.models import (
    AuthSession,
    LoginAttempt,
    Permission,
    Role,
    RolePermission,
    SecurityAuditLog,
    SecuritySetting,
    User,
    UserPermissionOverride,
)


def utcnow() -> datetime:
    return datetime.utcnow()


DEFAULT_SECURITY_SETTINGS: dict[str, Any] = {
    "session_timeout_minutes": 30,
    "max_failed_login_attempts": 5,
    "account_lockout_duration_minutes": 15,
    "require_password_change_days": 90,
    "minimum_password_length": 8,
    "require_complex_password": True,
    "allow_concurrent_logins": False,
    "after_hours_login_mode": "Alert only",
    "pos_pin_login_enabled": True,
    "pin_length": 4,
}


DEFAULT_ROLE_DEFS = [
    {"name": "owner", "display_name": "Owner", "level": 5, "description": "Full access", "is_protected": True},
    {"name": "admin", "display_name": "Admin", "level": 4, "description": "Administrative access", "is_protected": False},
    {"name": "manager", "display_name": "Manager", "level": 3, "description": "Operations and reports", "is_protected": False},
    {"name": "cashier", "display_name": "Cashier", "level": 1, "description": "POS and customer operations", "is_protected": False},
    {"name": "technician", "display_name": "Technician", "level": 2, "description": "Repair workflow", "is_protected": False},
    {"name": "view_only", "display_name": "View Only", "level": 0, "description": "Read-only access", "is_protected": False},
]


MODULE_ACTIONS: dict[str, list[str]] = {
    "dashboard": ["view"],
    "pos": ["view", "create", "edit", "void", "refund", "print"],
    "repairs": ["view", "create", "edit", "delete", "approve", "print"],
    "inventory": ["view", "create", "edit", "delete", "approve", "print", "export"],
    "customers": ["view", "create", "edit", "delete", "export"],
    "reports": ["view", "export", "print"],
    "suppliers": ["view", "create", "edit", "delete"],
    "expenses": ["view", "create", "edit", "delete", "approve", "export"],
    "warranty": ["view", "create", "edit", "delete", "approve"],
    "returns": ["view", "create", "edit", "delete", "refund", "approve", "print"],
    "settings": ["view", "edit", "manage_settings"],
    "backup": ["view", "create", "restore", "export", "manage_settings"],
    "audit_logs": ["view", "create", "export"],
    "financial_audit": ["view", "export", "approve"],
    "labels": ["view", "create", "edit", "delete", "print", "export"],
}


METHOD_DEFAULT_ACTION = {
    "GET": "view",
    "POST": "create",
    "PUT": "edit",
    "PATCH": "edit",
    "DELETE": "delete",
}


def canonical_role_name(raw_role: str | None) -> str:
    key = str(raw_role or "").strip().lower()
    if not key:
        return "cashier"
    if "owner" in key:
        return "owner"
    if "admin" in key:
        return "admin"
    if "manager" in key:
        return "manager"
    if "tech" in key:
        return "technician"
    if "view" in key:
        return "view_only"
    if "cashier" in key or "staff" in key or "employee" in key:
        return "cashier"
    return key.replace(" ", "_")


def role_display_from_name(role_name: str) -> str:
    mapping = {
        "owner": "Owner",
        "admin": "Admin",
        "manager": "Manager",
        "cashier": "Cashier / Staff",
        "technician": "Technician",
        "view_only": "View Only",
    }
    return mapping.get(role_name, role_name.replace("_", " ").title())


def normalize_role_for_legacy(role_name: str) -> str:
    mapping = {
        "owner": "Owner",
        "admin": "Admin",
        "manager": "Manager",
        "cashier": "Cashier / Staff",
        "technician": "Technician",
        "view_only": "View Only",
    }
    return mapping.get(role_name, role_display_from_name(role_name))


def permission_code(module: str, action: str) -> str:
    return f"{module}.{action}"


def get_request_ip(request: Request | None) -> str | None:
    if not request:
        return None
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    if request.client:
        return request.client.host
    return None


def get_request_device_info(request: Request | None) -> str | None:
    if not request:
        return None
    return request.headers.get("user-agent") or request.headers.get("sec-ch-ua") or "Unknown Device"


def is_suspicious_ip(ip_address: str | None) -> bool:
    ip = str(ip_address or "")
    if not ip:
        return False
    if ip == "127.0.0.1" or ip == "::1":
        return False
    if ip.startswith("192.168.") or ip.startswith("10."):
        return False
    if ip.startswith("172."):
        try:
            second = int(ip.split(".")[1])
            if 16 <= second <= 31:
                return False
        except Exception:
            pass
    return True


def _json_load(raw: str | None, fallback: Any) -> Any:
    if not raw:
        return fallback
    try:
        return json.loads(raw)
    except Exception:
        return fallback


def _json_dump(value: Any) -> str:
    return json.dumps(value)


def get_security_settings(db: Session) -> dict[str, Any]:
    rows = db.query(SecuritySetting).all()
    current: dict[str, Any] = {}
    for row in rows:
        current[row.key] = _json_load(row.value, row.value)
    merged = dict(DEFAULT_SECURITY_SETTINGS)
    for k, v in current.items():
        merged[k] = v
    return merged


def set_security_settings(db: Session, payload: dict[str, Any], updated_by_user_id: int | None = None) -> dict[str, Any]:
    existing = get_security_settings(db)
    merged = dict(existing)
    merged.update(payload or {})
    for key, value in merged.items():
        row = db.query(SecuritySetting).filter(SecuritySetting.key == key).first()
        if not row:
            row = SecuritySetting(key=key, value=_json_dump(value), updated_by_user_id=updated_by_user_id)
            db.add(row)
        else:
            row.value = _json_dump(value)
            row.updated_by_user_id = updated_by_user_id
            row.updated_at = utcnow()
    db.commit()
    return merged


def _ensure_roles(db: Session) -> dict[str, Role]:
    role_map: dict[str, Role] = {}
    for rd in DEFAULT_ROLE_DEFS:
        role = db.query(Role).filter(Role.name == rd["name"]).first()
        if not role:
            role = Role(
                name=rd["name"],
                display_name=rd["display_name"],
                level=rd["level"],
                description=rd["description"],
                is_protected=rd["is_protected"],
                is_system=True,
                is_active=True,
            )
            db.add(role)
            db.flush()
        else:
            role.display_name = rd["display_name"]
            role.level = rd["level"]
            role.description = rd["description"]
            role.is_system = True
            role.is_protected = rd["is_protected"]
            if role.is_active is None:
                role.is_active = True
            role.updated_at = utcnow()
        role_map[rd["name"]] = role
    return role_map


def _ensure_permissions(db: Session) -> dict[str, Permission]:
    perms: dict[str, Permission] = {}
    for module, actions in MODULE_ACTIONS.items():
        for action in actions:
            code = permission_code(module, action)
            p = db.query(Permission).filter(Permission.code == code).first()
            if not p:
                p = Permission(
                    code=code,
                    module=module,
                    action=action,
                    label=f"{module.replace('_', ' ').title()} - {action.title()}",
                    description=f"Allow {action} in {module.replace('_', ' ').title()}",
                    is_active=True,
                )
                db.add(p)
                db.flush()
            else:
                p.module = module
                p.action = action
                if not p.label:
                    p.label = f"{module.replace('_', ' ').title()} - {action.title()}"
                if p.is_active is None:
                    p.is_active = True
            perms[code] = p
    return perms


def _default_role_permission_allowed(role_name: str, module: str, action: str) -> bool:
    if role_name == "owner":
        return True
    if role_name == "admin":
        return True
    if role_name == "manager":
        manager_block = {
            permission_code("settings", "manage_settings"),
            permission_code("backup", "manage_settings"),
            permission_code("backup", "restore"),
            permission_code("audit_logs", "export"),
        }
        return permission_code(module, action) not in manager_block
    if role_name == "cashier":
        allowed = {
            permission_code("dashboard", "view"),
            permission_code("pos", "view"),
            permission_code("pos", "create"),
            permission_code("pos", "print"),
            permission_code("customers", "view"),
            permission_code("customers", "create"),
            permission_code("customers", "edit"),
            permission_code("returns", "view"),
            permission_code("returns", "create"),
            permission_code("returns", "print"),
            permission_code("labels", "view"),
            permission_code("labels", "print"),
            permission_code("repairs", "view"),
            permission_code("warranty", "view"),
        }
        return permission_code(module, action) in allowed
    if role_name == "technician":
        allowed = {
            permission_code("dashboard", "view"),
            permission_code("repairs", "view"),
            permission_code("repairs", "edit"),
            permission_code("repairs", "create"),
            permission_code("warranty", "view"),
            permission_code("warranty", "create"),
            permission_code("warranty", "edit"),
            permission_code("labels", "view"),
            permission_code("labels", "print"),
            permission_code("inventory", "view"),
        }
        return permission_code(module, action) in allowed
    if role_name == "view_only":
        return action == "view"
    return False


def _ensure_default_role_permissions(db: Session, role_map: dict[str, Role], perm_map: dict[str, Permission]) -> None:
    for role_name, role in role_map.items():
        for code, perm in perm_map.items():
            allowed = _default_role_permission_allowed(role_name, perm.module, perm.action)
            row = db.query(RolePermission).filter(RolePermission.role_id == role.id, RolePermission.permission_id == perm.id).first()
            if not row:
                row = RolePermission(role_id=role.id, permission_id=perm.id, allowed=allowed)
                db.add(row)
            elif role_name in {"owner", "admin"}:
                row.allowed = allowed


def ensure_security_defaults(db: Session) -> None:
    Base.metadata.create_all(bind=engine)
    users_table_exists = db.execute(
        text("SELECT name FROM sqlite_master WHERE type='table' AND name='users'")
    ).first()
    if not users_table_exists:
        # In some reload scenarios (notably tests), model metadata can be stale.
        # Reload models so tables bind to the current Base, then create again.
        import app.models as models_module
        importlib.reload(models_module)
        Base.metadata.create_all(bind=engine)

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
    columns = db.execute(text("PRAGMA table_info(users)")).fetchall()
    if not columns:
        return
    existing = {row[1] for row in columns}
    for column, col_type in required_user_columns.items():
        if column not in existing:
            db.execute(text(f"ALTER TABLE users ADD COLUMN {column} {col_type}"))
    db.commit()

    role_map = _ensure_roles(db)
    perm_map = _ensure_permissions(db)
    _ensure_default_role_permissions(db, role_map, perm_map)
    set_security_settings(db, get_security_settings(db))

    users = db.query(User).all()
    for user in users:
        canonical = canonical_role_name(user.role)
        role = role_map.get(canonical) or role_map.get("cashier")
        if role:
            user.role_id = role.id
            user.role = normalize_role_for_legacy(role.name)
            if role.name == "owner":
                user.is_active = True
            if user.last_password_change_at is None:
                user.last_password_change_at = utcnow()
    db.commit()


def _role_for_user(db: Session, user: User) -> Role | None:
    if user.role_id:
        role = db.query(Role).filter(Role.id == user.role_id).first()
        if role:
            return role
    canonical = canonical_role_name(user.role)
    role = db.query(Role).filter(Role.name == canonical).first()
    if role:
        user.role_id = role.id
        db.commit()
    return role


def list_roles(db: Session) -> list[Role]:
    return db.query(Role).order_by(Role.level.desc(), Role.id.asc()).all()


def list_permissions(db: Session) -> list[Permission]:
    return db.query(Permission).filter(Permission.is_active == True).order_by(Permission.module.asc(), Permission.action.asc()).all()


def get_effective_permission_codes(db: Session, user: User) -> set[str]:
    role = _role_for_user(db, user)
    if role and role.name == "owner":
        return {p.code for p in list_permissions(db)}

    allowed_codes: set[str] = set()
    if role:
        role_rows = (
            db.query(RolePermission, Permission)
            .join(Permission, Permission.id == RolePermission.permission_id)
            .filter(RolePermission.role_id == role.id)
            .all()
        )
        for rp, perm in role_rows:
            if rp.allowed:
                allowed_codes.add(perm.code)
            elif perm.code in allowed_codes:
                allowed_codes.remove(perm.code)

    overrides = (
        db.query(UserPermissionOverride, Permission)
        .join(Permission, Permission.id == UserPermissionOverride.permission_id)
        .filter(UserPermissionOverride.user_id == user.id)
        .all()
    )
    for ov, perm in overrides:
        if ov.effect == "allow":
            allowed_codes.add(perm.code)
        elif ov.effect == "deny" and perm.code in allowed_codes:
            allowed_codes.remove(perm.code)
    return allowed_codes


def has_permission(db: Session, user: User, permission: str) -> bool:
    role = _role_for_user(db, user)
    if role and role.name == "owner":
        return True
    return permission in get_effective_permission_codes(db, user)


def infer_action_from_request(request: Request) -> str:
    method = request.method.upper()
    path = request.url.path.lower()
    if path.startswith("/settings"):
        if method in {"PUT", "PATCH", "POST", "DELETE"}:
            return "manage_settings"
        return "view"
    if "/export" in path:
        return "export"
    if "/print" in path:
        return "print"
    if "/approve" in path or "/verify" in path:
        return "approve"
    if "/void" in path:
        return "void"
    if "/refund" in path:
        return "refund"
    if "/restore" in path:
        return "restore"
    return METHOD_DEFAULT_ACTION.get(method, "view")


def permission_from_module_action(module: str, action: str) -> str:
    return permission_code(module, action)


def validate_password_against_policy(password: str, settings: dict[str, Any]) -> list[str]:
    issues: list[str] = []
    min_len = int(settings.get("minimum_password_length", 8) or 8)
    if len(password or "") < min_len:
        issues.append(f"Password must be at least {min_len} characters.")
    if bool(settings.get("require_complex_password", True)):
        if not re.search(r"[A-Z]", password or ""):
            issues.append("Password must include an uppercase letter.")
        if not re.search(r"[a-z]", password or ""):
            issues.append("Password must include a lowercase letter.")
        if not re.search(r"\d", password or ""):
            issues.append("Password must include a number.")
        if not re.search(r"[^A-Za-z0-9]", password or ""):
            issues.append("Password must include a symbol.")
    return issues


def validate_pin(pin: str | None, pin_length: int = 4) -> bool:
    if not pin:
        return False
    return bool(re.fullmatch(rf"\d{{{int(pin_length)}}}", str(pin)))


def is_user_locked(user: User) -> bool:
    return bool(user.account_locked_until and user.account_locked_until > utcnow())


def remaining_lockout_seconds(user: User) -> int:
    if not user.account_locked_until:
        return 0
    delta = user.account_locked_until - utcnow()
    return max(0, int(delta.total_seconds()))


def record_security_audit(
    db: Session,
    action: str,
    user_id: int | None = None,
    target_type: str | None = None,
    target_id: int | None = None,
    target_ref: str | None = None,
    detail: str | None = None,
    ip_address: str | None = None,
    device_info: str | None = None,
    result: str = "success",
    metadata: dict[str, Any] | None = None,
) -> SecurityAuditLog:
    row = SecurityAuditLog(
        user_id=user_id,
        action=action,
        target_type=target_type,
        target_id=target_id,
        target_ref=target_ref,
        detail=detail,
        ip_address=ip_address,
        device_info=device_info,
        result=result,
        metadata_json=_json_dump(metadata or {}),
    )
    db.add(row)
    db.commit()
    return row


def build_session_payload(session: AuthSession) -> dict[str, Any]:
    now = utcnow()
    duration_seconds = max(0, int((now - (session.login_time or now)).total_seconds()))
    return {
        "session_id": session.session_code,
        "user_id": session.user_id,
        "user_name": session.user.full_name if session.user else None,
        "role": session.user.role if session.user else None,
        "device_name": session.device_name,
        "device_info": session.device_info,
        "ip_address": session.ip_address,
        "location": session.location or ("External Network" if is_suspicious_ip(session.ip_address) else "Store LAN"),
        "login_time": session.login_time.isoformat() if session.login_time else None,
        "last_seen_at": session.last_seen_at.isoformat() if session.last_seen_at else None,
        "session_duration_seconds": duration_seconds,
        "status": "Active" if session.is_active and (not session.expires_at or session.expires_at > now) else "Expired",
        "is_current": bool(session.is_current),
        "is_suspicious": bool(session.is_suspicious),
        "login_method": session.login_method,
    }


def create_auth_session(
    db: Session,
    user: User,
    token_jti: str,
    expires_at: datetime,
    request: Request | None = None,
    login_method: str = "password",
    force_single_session: bool = False,
    session_code: str | None = None,
) -> AuthSession:
    ip = get_request_ip(request)
    device_info = get_request_device_info(request)
    if force_single_session:
        active = db.query(AuthSession).filter(AuthSession.user_id == user.id, AuthSession.is_active == True).all()
        for row in active:
            row.is_active = False
            row.revoked_at = utcnow()
            row.revoke_reason = "Concurrent login blocked"
            row.is_current = False
    session = AuthSession(
        session_code=session_code or f"sess_{uuid.uuid4().hex[:16]}",
        user_id=user.id,
        token_jti=token_jti,
        device_name="Desktop",
        device_info=device_info,
        ip_address=ip,
        location="External Network" if is_suspicious_ip(ip) else "Store LAN",
        login_method=login_method,
        login_time=utcnow(),
        last_seen_at=utcnow(),
        expires_at=expires_at,
        is_active=True,
        is_current=True,
        is_suspicious=is_suspicious_ip(ip),
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def touch_session_by_jti(db: Session, token_jti: str) -> AuthSession | None:
    row = (
        db.query(AuthSession)
        .filter(AuthSession.token_jti == token_jti)
        .first()
    )
    if not row:
        return None
    row.last_seen_at = utcnow()
    db.commit()
    return row


def revoke_session(
    db: Session,
    session_code: str,
    revoked_by_user_id: int | None = None,
    reason: str = "Force logout",
) -> bool:
    row = db.query(AuthSession).filter(AuthSession.session_code == session_code).first()
    if not row:
        return False
    row.is_active = False
    row.is_current = False
    row.revoked_at = utcnow()
    row.revoked_by_user_id = revoked_by_user_id
    row.revoke_reason = reason
    db.commit()
    return True


def revoke_all_user_sessions(
    db: Session,
    user_id: int,
    except_session_code: str | None = None,
    revoked_by_user_id: int | None = None,
    reason: str = "Force logout all",
) -> int:
    rows = db.query(AuthSession).filter(AuthSession.user_id == user_id, AuthSession.is_active == True).all()
    count = 0
    for row in rows:
        if except_session_code and row.session_code == except_session_code:
            continue
        row.is_active = False
        row.is_current = False
        row.revoked_at = utcnow()
        row.revoked_by_user_id = revoked_by_user_id
        row.revoke_reason = reason
        count += 1
    db.commit()
    return count


def get_active_sessions(db: Session) -> list[AuthSession]:
    now = utcnow()
    rows = (
        db.query(AuthSession)
        .filter(AuthSession.is_active == True)
        .all()
    )
    out: list[AuthSession] = []
    for row in rows:
        if row.expires_at and row.expires_at <= now:
            row.is_active = False
            row.is_current = False
            row.revoke_reason = row.revoke_reason or "Session expired"
            row.revoked_at = row.revoked_at or now
        else:
            out.append(row)
    db.commit()
    return out


def record_login_failed(
    db: Session,
    user: User | None,
    username: str,
    request: Request | None,
    reason: str,
    login_method: str = "password",
) -> None:
    settings = get_security_settings(db)
    max_attempts = int(settings.get("max_failed_login_attempts", 5) or 5)
    lockout_minutes = int(settings.get("account_lockout_duration_minutes", 15) or 15)

    if user:
        user.failed_login_count = int(user.failed_login_count or 0) + 1
        if user.failed_login_count >= max_attempts:
            user.account_locked_until = utcnow() + timedelta(minutes=lockout_minutes)
    db.add(
        LoginAttempt(
            username=username,
            user_id=user.id if user else None,
            login_method=login_method,
            ip_address=get_request_ip(request),
            device_info=get_request_device_info(request),
            attempted_at=utcnow(),
            success=False,
            failure_reason=reason,
        )
    )
    db.commit()

    record_security_audit(
        db,
        action="failed_login",
        user_id=user.id if user else None,
        target_type="user",
        target_id=user.id if user else None,
        target_ref=username,
        detail=reason,
        ip_address=get_request_ip(request),
        device_info=get_request_device_info(request),
        result="failed",
        metadata={"failed_attempts": int(user.failed_login_count or 0) if user else None},
    )


def record_login_success(
    db: Session,
    user: User,
    request: Request | None,
    login_method: str = "password",
) -> None:
    user.failed_login_count = 0
    user.account_locked_until = None
    user.last_login_at = utcnow()
    user.updated_at = utcnow()
    db.add(
        LoginAttempt(
            username=user.username,
            user_id=user.id,
            login_method=login_method,
            ip_address=get_request_ip(request),
            device_info=get_request_device_info(request),
            attempted_at=utcnow(),
            success=True,
            failure_reason=None,
        )
    )
    db.commit()
    record_security_audit(
        db,
        action="login",
        user_id=user.id,
        target_type="user",
        target_id=user.id,
        target_ref=user.username,
        detail="User login successful",
        ip_address=get_request_ip(request),
        device_info=get_request_device_info(request),
        result="success",
    )


def role_matrix_payload(db: Session) -> dict[str, Any]:
    roles = list_roles(db)
    permissions = list_permissions(db)
    rows = db.query(RolePermission).all()
    role_perm = {(row.role_id, row.permission_id): bool(row.allowed) for row in rows}

    grouped_modules: dict[str, list[dict[str, Any]]] = {}
    for perm in permissions:
        grouped_modules.setdefault(perm.module, []).append(
            {
                "permission_id": perm.id,
                "code": perm.code,
                "action": perm.action,
                "label": perm.label or perm.code,
            }
        )
    for module in grouped_modules:
        grouped_modules[module] = sorted(grouped_modules[module], key=lambda x: x["action"])

    role_rows = []
    for role in roles:
        allowed_ids = {
            perm_id
            for (r_id, perm_id), allowed in role_perm.items()
            if r_id == role.id and allowed
        }
        role_rows.append(
            {
                "id": role.id,
                "name": role.name,
                "display_name": role.display_name,
                "level": role.level,
                "description": role.description,
                "is_protected": bool(role.is_protected),
                "is_system": bool(role.is_system),
                "enabled_permissions": len(allowed_ids),
                "total_permissions": len(permissions),
            }
        )

    return {
        "roles": role_rows,
        "permissions": [{"id": p.id, "code": p.code, "module": p.module, "action": p.action, "label": p.label} for p in permissions],
        "grouped_modules": grouped_modules,
        "role_permissions": [
            {"role_id": row.role_id, "permission_id": row.permission_id, "allowed": bool(row.allowed)}
            for row in rows
        ],
    }


def set_role_permissions(db: Session, role_id: int, permission_ids: list[int], allowed: bool) -> None:
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    if role.is_protected and role.name == "owner":
        raise HTTPException(status_code=400, detail="Owner role permissions are locked")

    for permission_id in permission_ids:
        rp = (
            db.query(RolePermission)
            .filter(RolePermission.role_id == role_id, RolePermission.permission_id == permission_id)
            .first()
        )
        if not rp:
            rp = RolePermission(role_id=role_id, permission_id=permission_id, allowed=allowed)
            db.add(rp)
        else:
            rp.allowed = allowed
    db.commit()


def set_role_permissions_bulk(db: Session, role_id: int, allowed: bool) -> None:
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    if role.is_protected and role.name == "owner":
        raise HTTPException(status_code=400, detail="Owner role permissions are locked")
    perms = list_permissions(db)
    for perm in perms:
        row = db.query(RolePermission).filter(RolePermission.role_id == role_id, RolePermission.permission_id == perm.id).first()
        if not row:
            row = RolePermission(role_id=role_id, permission_id=perm.id, allowed=allowed)
            db.add(row)
        else:
            row.allowed = allowed
    db.commit()


def get_user_permission_override_payload(db: Session, user_id: int) -> dict[str, Any]:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    overrides = (
        db.query(UserPermissionOverride, Permission)
        .join(Permission, Permission.id == UserPermissionOverride.permission_id)
        .filter(UserPermissionOverride.user_id == user_id)
        .all()
    )
    out = []
    for row, perm in overrides:
        out.append(
            {
                "id": row.id,
                "permission_id": perm.id,
                "permission_code": perm.code,
                "effect": row.effect,
                "reason": row.reason,
                "created_by_user_id": row.created_by_user_id,
                "created_at": row.created_at.isoformat() if row.created_at else None,
            }
        )
    return {"user_id": user_id, "overrides": out}


def set_user_permission_override(
    db: Session,
    user_id: int,
    permission_id: int,
    effect: str,
    actor_user_id: int | None = None,
    reason: str | None = None,
) -> UserPermissionOverride:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    role = _role_for_user(db, user)
    if role and role.name == "owner":
        raise HTTPException(status_code=400, detail="Owner permissions cannot be overridden")
    perm = db.query(Permission).filter(Permission.id == permission_id).first()
    if not perm:
        raise HTTPException(status_code=404, detail="Permission not found")
    effect_normalized = str(effect or "").lower()
    if effect_normalized not in {"allow", "deny"}:
        raise HTTPException(status_code=400, detail="effect must be allow or deny")
    row = (
        db.query(UserPermissionOverride)
        .filter(UserPermissionOverride.user_id == user_id, UserPermissionOverride.permission_id == permission_id)
        .first()
    )
    if not row:
        row = UserPermissionOverride(
            user_id=user_id,
            permission_id=permission_id,
            effect=effect_normalized,
            reason=reason or "",
            created_by_user_id=actor_user_id,
        )
        db.add(row)
    else:
        row.effect = effect_normalized
        row.reason = reason or row.reason
        row.created_by_user_id = actor_user_id
    db.commit()
    db.refresh(row)
    return row


def clear_user_permission_override(db: Session, user_id: int, permission_id: int) -> bool:
    row = (
        db.query(UserPermissionOverride)
        .filter(UserPermissionOverride.user_id == user_id, UserPermissionOverride.permission_id == permission_id)
        .first()
    )
    if not row:
        return False
    db.delete(row)
    db.commit()
    return True
