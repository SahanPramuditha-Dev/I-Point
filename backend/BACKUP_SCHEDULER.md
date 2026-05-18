# Automated Backup Scheduler

## Overview

The i Store application now includes an automated backup system that creates daily backups at the end of each day. The system is built using APScheduler and runs as a background task within the FastAPI application.

## Features

- **Automatic Daily Backups**: Scheduled backups at configurable time (default: 23:59 UTC)
- **Multi-destination Support**:
  - Local backup folder
  - Firebase Storage (if configured)
  - Cloud sync folder (if configured in settings)
- **Automatic Pruning**: Keeps only the specified number of recent auto backups
- **Checksum Verification**: All backups include SHA256 checksums for integrity
- **Timezone Support**: Configurable timezone for backup scheduling
- **Manual Override**: Trigger backups manually via API

## Configuration

The backup scheduler is configured via environment variables:

### Environment Variables

```
# Enable/disable automatic backup scheduling (default: true)
BACKUP_SCHEDULE_ENABLED=true

# Hour when backup should run (0-23, default: 23 = 11 PM)
BACKUP_SCHEDULE_HOUR=23

# Minute when backup should run (0-59, default: 59)
BACKUP_SCHEDULE_MINUTE=59

# Timezone for scheduling (default: UTC)
# Examples: "US/Eastern", "Europe/London", "Asia/Tokyo", "Australia/Sydney"
BACKUP_SCHEDULE_TIMEZONE=UTC

# Maximum number of auto backups to keep (default: 10)
BACKUP_KEEP_AUTO=10

# Backup storage folder (default: OS-specific app data folder)
BACKUP_FOLDER=/path/to/backups

# Firebase configuration for cloud backups (optional)
FIREBASE_SERVICE_ACCOUNT=/path/to/service-account.json
FIREBASE_BUCKET=your-firebase-bucket.appspot.com
```

### Example .env Configuration

```
# Daily backup at 11:59 PM UTC
BACKUP_SCHEDULE_ENABLED=true
BACKUP_SCHEDULE_HOUR=23
BACKUP_SCHEDULE_MINUTE=59
BACKUP_SCHEDULE_TIMEZONE=UTC
BACKUP_KEEP_AUTO=10

# Or for Eastern Time (11:59 PM ET)
BACKUP_SCHEDULE_TIMEZONE=US/Eastern
```

### Supported Timezones

Common timezone values:
- `UTC` - UTC
- `US/Eastern` - Eastern Time
- `US/Central` - Central Time
- `US/Mountain` - Mountain Time
- `US/Pacific` - Pacific Time
- `Europe/London` - London
- `Europe/Paris` - Paris
- `Europe/Berlin` - Berlin
- `Asia/Tokyo` - Tokyo
- `Asia/Shanghai` - Shanghai
- `Asia/Hong_Kong` - Hong Kong
- `Australia/Sydney` - Sydney
- `Australia/Melbourne` - Melbourne

See [pytz documentation](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones) for complete list.

## API Endpoints

### Get Scheduler Status
```
GET /backup/scheduler/status
Authorization: Bearer <token>
```

Returns the current state of the backup scheduler:
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

### Manually Trigger Backup
```
POST /backup/scheduler/trigger-now
Authorization: Bearer <token>
```

Immediately creates an automatic backup:
```json
{
  "status": "success",
  "backup_file": "auto_20260513_153045.db",
  "backup_path": "/path/to/backup/auto_20260513_153045.db",
  "checksum": "abc123def456...",
  "timestamp": "2026-05-13T15:30:45",
  "firebase": {
    "uploaded": true,
    "blob": "istore-backups/20260513/auto_20260513_153045.db"
  },
  "cloud": {
    "synced": true,
    "path": "/cloud/drive/istore-backups/auto_20260513_153045.db"
  }
}
```

### List Existing Backups
```
GET /backup
Authorization: Bearer <token>
```

### Get Last Backup Time
```
GET /backup/last
Authorization: Bearer <token>
```

### Restore from Backup
```
POST /backup/restore/{filename}
Authorization: Bearer <token>
```

## How It Works

1. **Initialization**: On application startup, the scheduler is initialized with the configured settings.

2. **Scheduling**: APScheduler sets up a daily cron job at the specified time.

3. **Backup Execution**: When the scheduled time arrives:
   - Creates a copy of the SQLite database
   - Calculates and stores SHA256 checksum
   - Updates `last_backup_at` in the database
   - Uploads to Firebase Storage (if configured)
   - Syncs to cloud folder (if configured)
   - Prunes old backups (keeps only specified count)

4. **Error Handling**: All errors are logged but don't crash the scheduler. Logs are written to `backend.log`.

5. **Graceful Shutdown**: When the application shuts down, the scheduler is properly terminated.

## Logs

Backup scheduler logs are written to `backend.log`. Look for entries starting with:
- `=== SCHEDULED BACKUP JOB STARTED ===`
- `=== SCHEDULED BACKUP JOB COMPLETED ===`

Example log entries:
```
2026-05-13 23:59:01 - istore.api - INFO - === SCHEDULED BACKUP JOB STARTED ===
2026-05-13 23:59:05 - istore.api - INFO - Scheduled backup created: {...}
2026-05-13 23:59:05 - istore.api - INFO - === SCHEDULED BACKUP JOB COMPLETED: success ===
2026-05-13 23:59:05 - istore.api - INFO - Pruned old backup: auto_20260502_235900.db
```

## Troubleshooting

### Backups not running at scheduled time

1. Check environment variables are set correctly:
   ```bash
   echo $BACKUP_SCHEDULE_ENABLED
   echo $BACKUP_SCHEDULE_HOUR
   ```

2. Check `backend.log` for scheduler initialization:
   ```bash
   grep "Backup scheduler started" backend.log
   ```

3. Verify next run time via API:
   ```bash
   curl http://localhost:8000/backup/scheduler/status
   ```

### All backups showing as "firebase-not-configured"

This is normal if Firebase is not configured. Set these environment variables to enable:
```
FIREBASE_SERVICE_ACCOUNT=/path/to/service-account.json
FIREBASE_BUCKET=your-bucket.appspot.com
```

### Backups running but old ones not being pruned

Check `BACKUP_KEEP_AUTO` setting. It controls how many auto backups to keep. Default is 10.

### Wrong time zone for backups

Update `BACKUP_SCHEDULE_TIMEZONE` to your desired timezone. After changing, restart the application.

## Implementation Details

### Files Modified
- `backend/requirements.txt` - Added apscheduler, pytz
- `backend/app/config.py` - Added backup schedule configuration
- `backend/app/main.py` - Initialize scheduler on startup, shutdown on app close
- `backend/app/routers/backup_router.py` - Added scheduler status and trigger endpoints
- `backend/app/services/backup_scheduler.py` - New file with scheduler implementation

### Dependencies
- `apscheduler==3.10.4` - Background job scheduling
- `pytz==2024.1` - Timezone support

## Future Enhancements

Potential improvements:
- Web UI dashboard showing backup status and schedule
- Configurable backup retention policies
- Differential/incremental backups
- Backup restoration via UI
- Email notifications on backup completion/failure
- S3, Azure, or other cloud storage backends
