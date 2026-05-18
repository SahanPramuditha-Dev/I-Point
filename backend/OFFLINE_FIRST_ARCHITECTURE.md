# i Store Offline-First Architecture

## Core Runtime Model

React UI  
-> FastAPI backend  
-> Local SQLite (primary operational database)  
-> Firebase (backup storage + optional backup metadata only)

## Principles Enforced

1. SQLite is the **only live transactional database**.
2. App remains fully usable when internet/Firebase is unavailable.
3. Firebase is used only during backup flows.
4. No live POS/repair/inventory/customer data is written to Firebase.
5. Cloud failures are non-fatal and never block local operations.

## Backup Pipeline

1. Local SQLite snapshot is copied.
2. Snapshot is compressed to `*.sqlite.gz`.
3. Optional encryption produces `*.sqlite.gz.enc`.
4. SHA256 checksum is generated and stored beside the backup.
5. Backup metadata is stored locally in `AppSetting` history.
6. Optional Firebase upload to Storage.
7. Optional Firestore write for lightweight backup metadata only.
8. Retention policy prunes old local (and optionally remote) backups.

## Firebase Scope

- Allowed:
  - Storage upload/download of backup artifacts.
  - Firestore metadata entries for backups.
- Disallowed:
  - POS transactions
  - inventory state
  - repair workflows
  - customer records
  - invoices/reports as operational data

## Configuration Flags (Environment)

- `FIREBASE_BACKUP_ENABLED` (default `false`)
- `FIREBASE_STORE_METADATA` (default `true`)
- `FIREBASE_METADATA_COLLECTION` (default `backup_metadata`)
- `FIREBASE_PRUNE_REMOTE_KEEP` (default `30`)
- `FIREBASE_SERVICE_ACCOUNT`
- `FIREBASE_BUCKET`

- `BACKUP_KEEP_LOCAL` (default inherits `BACKUP_KEEP_AUTO`)
- `BACKUP_ENCRYPT` (default `false`)
- `BACKUP_ENCRYPTION_PASSPHRASE`
- `BACKUP_META_HISTORY_KEEP` (default `200`)

- `AUTO_MIGRATE_ENABLED` (default `false`)
- `BACKUP_BEFORE_MIGRATE` (default `true`)

## Safe Update Strategy

- Alembic migrations are optional and controlled by `AUTO_MIGRATE_ENABLED`.
- When enabled, a pre-migration backup is created first if `BACKUP_BEFORE_MIGRATE=true`.
- If pre-migration backup fails, migration is skipped for safety.

## Operational Notes

- Backup API and scheduled backups now use the same shared backup service.
- Backup artifacts are verifiable via checksum before restore.
- Restore operation creates a pre-restore local snapshot.
