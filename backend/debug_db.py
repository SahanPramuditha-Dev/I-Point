import sqlite3
from app.config import settings
print(f"URL: {settings.sqlite_url}")
conn = sqlite3.connect(settings.sqlite_file)
cursor = conn.cursor()

tables = ["users", "customers", "suppliers", "inventory_items", "repair_tickets", "sales", "sale_items", "stock_movements", "repair_part_usage", "app_settings", "activity_logs", "daily_closings", "notifications"]

for table in tables:
    cursor.execute(f"PRAGMA table_info({table})")
    cols = [row[1] for row in cursor.fetchall()]
    if cols:
        print(f"Table {table}: {cols}")
    else:
        print(f"Table {table}: MISSING")
conn.close()
