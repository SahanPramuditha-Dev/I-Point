import os
from datetime import datetime
from firebase_admin import credentials, initialize_app, storage

_app = None

def init_firebase(service_account_path: str, bucket_name: str):
    global _app
    if _app is None:
        cred = credentials.Certificate(service_account_path)
        _app = initialize_app(cred, {"storageBucket": bucket_name})

def upload_backup(file_path: str):
    if _app is None:
        return {"uploaded": False, "reason": "firebase-not-configured"}
    bucket = storage.bucket()
    blob = bucket.blob(f"istore-backups/{datetime.now().strftime('%Y%m%d')}/{os.path.basename(file_path)}")
    blob.upload_from_filename(file_path)
    return {"uploaded": True, "blob": blob.name}
