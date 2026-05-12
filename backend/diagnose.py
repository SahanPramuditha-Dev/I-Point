import requests
import os
import sqlite3
from pathlib import Path

BASE_URL = "http://127.0.0.1:8000"

print("--- i Store Diagnostic Tool ---")

# 1. Check Connectivity
try:
    resp = requests.get(f"{BASE_URL}/health", timeout=2)
    print(f"[OK] Backend is reachable (Status: {resp.status_code})")
except Exception as e:
    print(f"[ERROR] Backend is NOT reachable at {BASE_URL}. Is it running?")

# 2. Check for the Print Route
try:
    resp = requests.get(f"{BASE_URL}/debug-db", timeout=2)
    if resp.status_code == 200:
        data = resp.json()
        print(f"[OK] Backend is running NEW code.")
        print(f"     Database: {data.get('sqlite_url')}")
        print(f"     Total Repairs in DB: {data.get('count')}")
    else:
        print(f"[WARNING] Backend is running OLD code (404 on debug-db).")
        print(f"          This is why 'Print Job Card' returns Not Found.")
except Exception:
    print("[WARNING] Could not verify code version.")

# 3. Check Database Lock
appdata = os.environ.get("APPDATA")
if not appdata:
    appdata = str(Path.home() / "AppData" / "Roaming")

db_path = Path(appdata) / "iStore" / "istore.db"
if db_path.exists():
    print(f"[INFO] Database found at: {db_path}")
    try:
        conn = sqlite3.connect(f"file:{db_path.as_posix()}?mode=ro", uri=True)
        cursor = conn.cursor()
        cursor.execute("SELECT count(*) FROM repair_tickets")
        count = cursor.fetchone()[0]
        print(f"[OK] Database is readable. Count: {count}")
        conn.close()
    except sqlite3.OperationalError as e:
        print(f"[CRITICAL] Database is LOCKED: {e}")
        print("           Close all i Store windows and restart the backend.")
else:
    print(f"[ERROR] Database file not found at {db_path}")

print("\n--- Diagnostic Complete ---")
