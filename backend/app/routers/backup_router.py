import os
import shutil
import hashlib
import json
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.config import settings
from app.database import get_db
from app.auth import get_current_user
from app.services.firebase_backup import init_firebase, upload_backup

router = APIRouter(prefix="/backup", tags=["backup"])
DB_PATH = settings.sqlite_file
logger = logging.getLogger("istore.api")


def _sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _write_checksum(path: str) -> str:
    checksum = _sha256(path)
    with open(f"{path}.sha256", "w", encoding="utf-8") as f:
        f.write(checksum)
    return checksum


def _prune_old_auto_backups() -> None:
    keep = max(0, settings.backup_keep_auto)
    files = sorted([f for f in os.listdir(settings.backup_folder) if f.startswith("auto_") and f.endswith(".db")], reverse=True)
    for old in files[keep:]:
        old_path = os.path.join(settings.backup_folder, old)
        if os.path.exists(old_path):
            os.remove(old_path)
        old_sum = f"{old_path}.sha256"
        if os.path.exists(old_sum):
            os.remove(old_sum)

@router.post('/create')
def create_backup(is_auto: bool = False, db: Session = Depends(get_db), _=Depends(get_current_user)):
    from app.models import AppSetting
    os.makedirs(settings.backup_folder, exist_ok=True)
    name = f"{'auto_' if is_auto else 'manual_'}{datetime.now().strftime('%Y%m%d_%H%M%S')}.db"
    dst = os.path.join(settings.backup_folder, name)
    shutil.copy2(DB_PATH, dst)
    checksum = _write_checksum(dst)
    if is_auto:
        _prune_old_auto_backups()

    # Update last backup time
    last_backup_setting = db.query(AppSetting).filter(AppSetting.key == "last_backup_at").first()
    if not last_backup_setting:
        last_backup_setting = AppSetting(key="last_backup_at", value=datetime.now().isoformat())
        db.add(last_backup_setting)
    else:
        last_backup_setting.value = datetime.now().isoformat()
    db.commit()

    # Cloud Sync (Local Folder Copy)
    cloud_result = {"synced": False, "path": None}
    profile_row = db.query(AppSetting).filter(AppSetting.key == "print_profile").first()
    if profile_row:
        try:
            profile = json.loads(profile_row.value)
            cloud_path = profile.get("cloud_backup_path")
            if cloud_path and os.path.exists(cloud_path):
                cloud_dst = os.path.join(cloud_path, name)
                shutil.copy2(dst, cloud_dst)
                cloud_result = {"synced": True, "path": cloud_dst}
        except Exception as e:
            cloud_result = {"synced": False, "error": str(e)}

    firebase_result = {"uploaded": False, "reason": "not-configured"}
    sa = settings.firebase_service_account
    bucket = settings.firebase_bucket
    if sa and bucket and os.path.exists(sa):
        try:
            init_firebase(sa, bucket)
            firebase_result = upload_backup(dst)
        except Exception as e:
            firebase_result = {"uploaded": False, "reason": str(e)}

    logger.info(json.dumps({
        "event": "backup_created",
        "backup_path": dst,
        "is_auto": is_auto,
        "checksum": checksum,
    }))
    return {"backup": dst, "checksum": checksum, "firebase": firebase_result, "cloud": cloud_result, "at": last_backup_setting.value}

@router.get('/last')
def get_last_backup(db: Session = Depends(get_db), _=Depends(get_current_user)):
    from app.models import AppSetting
    setting = db.query(AppSetting).filter(AppSetting.key == "last_backup_at").first()
    return {"last_backup_at": setting.value if setting else None}

@router.get('')
def list_backups(_=Depends(get_current_user)):
    os.makedirs(settings.backup_folder, exist_ok=True)
    files = [f for f in os.listdir(settings.backup_folder) if f.endswith(".db")]
    return sorted(files, reverse=True)

@router.post('/restore/{filename}')
def restore(filename: str, _=Depends(get_current_user)):
    if "/" in filename or "\\" in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    src = os.path.join(settings.backup_folder, filename)
    if not os.path.exists(src):
        raise HTTPException(status_code=404, detail="Backup not found")
    expected_checksum_file = f"{src}.sha256"
    actual_checksum = _sha256(src)
    if os.path.exists(expected_checksum_file):
        with open(expected_checksum_file, "r", encoding="utf-8") as f:
            expected_checksum = f.read().strip()
        if expected_checksum != actual_checksum:
            raise HTTPException(status_code=400, detail="Backup checksum mismatch")
    # Safety snapshot before replacing active DB file.
    pre_name = f"pre_restore_{datetime.now().strftime('%Y%m%d_%H%M%S')}.db"
    pre_dst = os.path.join(settings.backup_folder, pre_name)
    shutil.copy2(DB_PATH, pre_dst)
    _write_checksum(pre_dst)
    shutil.copy2(src, DB_PATH)
    logger.info(json.dumps({
        "event": "backup_restored",
        "backup_path": src,
        "pre_restore_snapshot": pre_dst,
        "checksum": actual_checksum,
    }))
    return {"restored": filename, "checksum": actual_checksum, "pre_restore_snapshot": pre_name}
