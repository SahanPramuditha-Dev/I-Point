# Backup Scheduler Configuration Examples

## Quick Start

### Default Configuration (Backup daily at 23:59 UTC)
```bash
BACKUP_SCHEDULE_ENABLED=true
BACKUP_SCHEDULE_HOUR=23
BACKUP_SCHEDULE_MINUTE=59
BACKUP_SCHEDULE_TIMEZONE=UTC
BACKUP_KEEP_AUTO=10
```

### Backup at 10 PM Eastern Time
```bash
BACKUP_SCHEDULE_ENABLED=true
BACKUP_SCHEDULE_HOUR=22
BACKUP_SCHEDULE_MINUTE=0
BACKUP_SCHEDULE_TIMEZONE=US/Eastern
BACKUP_KEEP_AUTO=10
```

### Backup at Midnight (00:00) UTC
```bash
BACKUP_SCHEDULE_ENABLED=true
BACKUP_SCHEDULE_HOUR=0
BACKUP_SCHEDULE_MINUTE=0
BACKUP_SCHEDULE_TIMEZONE=UTC
BACKUP_KEEP_AUTO=10
```

### Backup at 6 PM Sydney Time
```bash
BACKUP_SCHEDULE_ENABLED=true
BACKUP_SCHEDULE_HOUR=18
BACKUP_SCHEDULE_MINUTE=0
BACKUP_SCHEDULE_TIMEZONE=Australia/Sydney
BACKUP_KEEP_AUTO=14
```

### Disable Automatic Backup (Manual only)
```bash
BACKUP_SCHEDULE_ENABLED=false
```

## API Usage Examples

### Check Scheduler Status
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8000/backup/scheduler/status
```

Response:
```json
{
  "enabled": true,
  "scheduler_running": true,
  "job_name": "Daily Backup at End of Day",
  "job_id": "daily_backup",
  "next_run_time": "2026-05-14T23:59:00+00:00",
  "schedule": "23:59 daily (UTC)",
  "keep_count": 10
}
```

### Manually Trigger Backup Now
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8000/backup/scheduler/trigger-now
```

Response:
```json
{
  "status": "success",
  "backup_file": "auto_20260513_215433.db",
  "backup_path": "/path/to/iStore/backups/auto_20260513_215433.db",
  "checksum": "a1b2c3d4e5f6...",
  "timestamp": "2026-05-13T21:54:33",
  "firebase": {
    "uploaded": true,
    "blob": "istore-backups/20260513/auto_20260513_215433.db"
  },
  "cloud": {
    "synced": true,
    "path": "/mnt/cloud/istore-backups/auto_20260513_215433.db"
  }
}
```

### List All Backups
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8000/backup
```

### Get Last Backup Time
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8000/backup/last
```

### Restore from Backup
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8000/backup/restore/auto_20260513_215433.db
```

## Timezone Reference

Common timezones for `BACKUP_SCHEDULE_TIMEZONE`:

### North America
- `America/New_York` - Eastern Time
- `US/Eastern` - Eastern Time
- `US/Central` - Central Time
- `US/Mountain` - Mountain Time
- `US/Pacific` - Pacific Time
- `America/Toronto` - Toronto (EST/EDT)
- `America/Mexico_City` - Mexico City
- `America/Vancouver` - Vancouver

### Europe
- `Europe/London` - London (GMT/BST)
- `Europe/Paris` - Paris (CET/CEST)
- `Europe/Berlin` - Berlin (CET/CEST)
- `Europe/Amsterdam` - Amsterdam (CET/CEST)
- `Europe/Rome` - Rome (CET/CEST)
- `Europe/Madrid` - Madrid (CET/CEST)
- `Europe/Istanbul` - Istanbul (EET/EEST)
- `Europe/Moscow` - Moscow (MSK)

### Asia
- `Asia/Tokyo` - Tokyo (JST)
- `Asia/Shanghai` - Shanghai (CST)
- `Asia/Hong_Kong` - Hong Kong (HKT)
- `Asia/Singapore` - Singapore (SGT)
- `Asia/Bangkok` - Bangkok (ICT)
- `Asia/Dubai` - Dubai (GST)
- `Asia/Kolkata` - India (IST)
- `Asia/Seoul` - Seoul (KST)

### Australia & Pacific
- `Australia/Sydney` - Sydney (AEDT/AEST)
- `Australia/Melbourne` - Melbourne (AEDT/AEST)
- `Australia/Brisbane` - Brisbane (AEST)
- `Australia/Perth` - Perth (AWST)
- `Pacific/Auckland` - Auckland (NZDT/NZST)
- `Pacific/Fiji` - Fiji (FJT)

### UTC
- `UTC` - Coordinated Universal Time
- `GMT` - Greenwich Mean Time

## Setup Instructions

### 1. Add to your `.env` file
```
BACKUP_SCHEDULE_ENABLED=true
BACKUP_SCHEDULE_HOUR=23
BACKUP_SCHEDULE_MINUTE=59
BACKUP_SCHEDULE_TIMEZONE=UTC
BACKUP_KEEP_AUTO=10
```

### 2. Start the backend server
The scheduler will automatically initialize on startup and begin scheduling daily backups.

### 3. Verify scheduler is running
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8000/backup/scheduler/status
```

Should return `"scheduler_running": true`

### 4. Check logs
```bash
tail -f backend.log | grep "SCHEDULED BACKUP"
```

Look for entries like:
```
2026-05-13 23:59:01 - istore.api - INFO - === SCHEDULED BACKUP JOB STARTED ===
2026-05-13 23:59:05 - istore.api - INFO - === SCHEDULED BACKUP JOB COMPLETED: success ===
```

## Troubleshooting

### Scheduler not running
1. Check `BACKUP_SCHEDULE_ENABLED=true` in `.env`
2. Restart backend server
3. Check logs: `grep "Backup scheduler started" backend.log`

### Backups not at expected time
1. Verify timezone: `grep "BACKUP_SCHEDULE_TIMEZONE" backend.log`
2. Check `BACKUP_SCHEDULE_HOUR` and `BACKUP_SCHEDULE_MINUTE` values
3. Restart backend to apply changes

### Old backups not being deleted
- Increase `BACKUP_KEEP_AUTO` value or verify folder permissions

### Firebase upload failures (expected if not configured)
- This is normal - only configure if you want Firebase backups
- Set `FIREBASE_SERVICE_ACCOUNT` and `FIREBASE_BUCKET` to enable

## Performance Notes

- Backups run in background without blocking API requests
- Backup time depends on database size (typically < 1 second for small DBs)
- Old backup pruning is automatic
- All operations are logged for auditing

## Security Notes

- Backup files are created with database file permissions
- Checksums (SHA256) verify backup integrity
- Pre-restore snapshots are created automatically
- All backup operations are logged with timestamps
