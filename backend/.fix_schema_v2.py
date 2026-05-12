import sqlite3
from app.config import settings

db_path = settings.sqlite_file
conn = sqlite3.connect(db_path)
c = conn.cursor()

print(f"Connecting to: {db_path}")

# Add missing sales columns
sales_cols = [
    'ALTER TABLE sales ADD COLUMN cash_amount FLOAT DEFAULT 0',
    'ALTER TABLE sales ADD COLUMN card_amount FLOAT DEFAULT 0',
    'ALTER TABLE sales ADD COLUMN is_voided BOOLEAN DEFAULT 0',
    'ALTER TABLE sales ADD COLUMN void_reason VARCHAR DEFAULT NULL',
]

for stmt in sales_cols:
    try:
        c.execute(stmt)
        print(f"✓ {stmt}")
    except sqlite3.OperationalError as e:
        print(f"⊘ {stmt}: {e}")

# Create missing tables
tables = [
    '''CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY,
        type VARCHAR,
        title VARCHAR,
        message TEXT,
        is_read BOOLEAN,
        entity_type VARCHAR,
        entity_id INTEGER,
        created_at DATETIME
    )''',
    '''CREATE TABLE IF NOT EXISTS activity_logs (
        id INTEGER PRIMARY KEY,
        user_id INTEGER,
        action VARCHAR,
        entity_type VARCHAR,
        entity_id INTEGER,
        description TEXT,
        old_value TEXT,
        new_value TEXT,
        is_reversible BOOLEAN,
        is_reversed BOOLEAN,
        created_at DATETIME,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )''',
    '''CREATE TABLE IF NOT EXISTS daily_closings (
        id INTEGER PRIMARY KEY,
        closing_date DATETIME,
        opening_cash FLOAT,
        actual_cash FLOAT,
        system_cash FLOAT,
        system_card FLOAT,
        difference FLOAT,
        notes TEXT,
        closed_by_id INTEGER,
        FOREIGN KEY(closed_by_id) REFERENCES users(id)
    )''',
]

for sql in tables:
    try:
        c.execute(sql)
        print(f"✓ Table created")
    except sqlite3.OperationalError as e:
        print(f"⊘ Table: {e}")

# Create index
c.execute('CREATE INDEX IF NOT EXISTS ix_daily_closings_closing_date ON daily_closings (closing_date)')

conn.commit()

# Verify schema
print("\n--- Sales schema ---")
c.execute('PRAGMA table_info(sales)')
for col in c.fetchall():
    print(f"  {col}")

print("\n--- Inventory items schema ---")
c.execute('PRAGMA table_info(inventory_items)')
for col in c.fetchall():
    print(f"  {col}")

print("\n--- Tables ---")
c.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
for table in c.fetchall():
    print(f"  {table[0]}")

conn.close()
print("\n✅ Schema fix complete!")
