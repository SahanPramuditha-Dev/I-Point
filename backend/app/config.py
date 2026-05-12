import os
import sys
from pydantic import BaseModel
from pathlib import Path

def get_user_data_dir():
    if sys.platform == "win32":
        root = Path(os.environ.get("APPDATA", "~")).expanduser()
    elif sys.platform == "darwin":
        root = Path("~/Library/Application Support").expanduser()
    else:
        root = Path("~/.config").expanduser()
    
    path = root / "iStore"
    path.mkdir(parents=True, exist_ok=True)
    return path

DATA_DIR = get_user_data_dir()
DB_FILE = DATA_DIR / "istore.db"
BACKUP_DIR = DATA_DIR / "backups"
LOG_DIR = DATA_DIR / "logs"

# Ensure folders exist
BACKUP_DIR.mkdir(parents=True, exist_ok=True)
LOG_DIR.mkdir(parents=True, exist_ok=True)

class Settings(BaseModel):
    app_name: str = os.getenv("APP_NAME", "i Store API")
    env: str = os.getenv("APP_ENV", "development")
    secret_key: str = os.getenv("SECRET_KEY", "change-this-secret")
    algorithm: str = os.getenv("ALGORITHM", "HS256")
    access_token_expire_minutes: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", str(60 * 8)))
    sqlite_file: str = os.getenv("SQLITE_FILE", str(DB_FILE))
    sqlite_url: str = os.getenv("SQLITE_URL", f"sqlite:///{DB_FILE.as_posix()}")
    backup_folder: str = os.getenv("BACKUP_FOLDER", str(BACKUP_DIR))
    cors_origins: list[str] = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,null").split(",") if o.strip()]
    backup_keep_auto: int = int(os.getenv("BACKUP_KEEP_AUTO", "10"))
    firebase_service_account: str = os.getenv("FIREBASE_SERVICE_ACCOUNT", "")
    firebase_bucket: str = os.getenv("FIREBASE_BUCKET", "")

    @property
    def is_production(self) -> bool:
        return self.env.lower() == "production"

settings = Settings()
