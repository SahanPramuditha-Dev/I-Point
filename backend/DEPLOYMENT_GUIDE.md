# Automated Backup Scheduler - Deployment & Operations Guide

## Quick Summary

Your backup system is now fully configured to run **daily at 23:59 UTC** (or your configured time) automatically. No manual intervention needed.

### Files Created/Modified:
- ✅ `backend/app/services/backup_scheduler.py` - Scheduler logic
- ✅ `backend/app/config.py` - Configuration added
- ✅ `backend/app/main.py` - Scheduler initialization
- ✅ `backend/app/routers/backup_router.py` - New API endpoints
- ✅ `backend/requirements.txt` - Dependencies added (apscheduler, pytz)

### New Environment Variables:
```
BACKUP_SCHEDULE_ENABLED=true
BACKUP_SCHEDULE_HOUR=23
BACKUP_SCHEDULE_MINUTE=59
BACKUP_SCHEDULE_TIMEZONE=UTC
BACKUP_KEEP_AUTO=10
```

## Starting the Backend with Scheduler

### Method 1: Using PowerShell Script (Windows)
```powershell
# run.ps1
cd "c:\D\Projects\Python\I Store\V1\backend"
.\.venv\Scripts\Activate.ps1
$env:BACKUP_SCHEDULE_ENABLED = "true"
$env:BACKUP_SCHEDULE_HOUR = "23"
$env:BACKUP_SCHEDULE_MINUTE = "59"
$env:BACKUP_SCHEDULE_TIMEZONE = "UTC"
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### Method 2: Using Batch File (Windows)
```batch
@echo off
cd /d "c:\D\Projects\Python\I Store\V1\backend"
call .\.venv\Scripts\activate.bat
set BACKUP_SCHEDULE_ENABLED=true
set BACKUP_SCHEDULE_HOUR=23
set BACKUP_SCHEDULE_MINUTE=59
set BACKUP_SCHEDULE_TIMEZONE=UTC
uvicorn app.main:app --host 0.0.0.0 --port 8000
pause
```

### Method 3: Using .env File
Create/update `.env` in backend directory:
```
BACKUP_SCHEDULE_ENABLED=true
BACKUP_SCHEDULE_HOUR=23
BACKUP_SCHEDULE_MINUTE=59
BACKUP_SCHEDULE_TIMEZONE=UTC
BACKUP_KEEP_AUTO=10
```

Then run:
```bash
cd backend
uvicorn app.main:app --reload
```

## Verifying Scheduler is Running

### Via API
```bash
# Get scheduler status (requires authentication)
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8000/backup/scheduler/status
```

Expected response:
```json
{
  "enabled": true,
  "scheduler_running": true,
  "next_run_time": "2026-05-14T23:59:00+00:00",
  "schedule": "23:59 daily (UTC)"
}
```

### Via Logs
```bash
tail -f backend.log | grep "Backup scheduler started"
```

Expected output:
```
2026-05-13 10:30:15 - istore.api - INFO - Backup scheduler started - Daily backup at 23:59 (UTC)
```

## Monitoring Backups

### Scheduled Backup Execution
Backups run automatically at configured time. Check logs:
```bash
tail -f backend.log | grep "SCHEDULED BACKUP"
```

Example logs:
```
2026-05-13 23:59:01 - istore.api - INFO - === SCHEDULED BACKUP JOB STARTED ===
2026-05-13 23:59:03 - istore.api - INFO - Scheduled backup created: {...}
2026-05-13 23:59:03 - istore.api - INFO - === SCHEDULED BACKUP JOB COMPLETED: success ===
```

### Manual Backup
Trigger immediately:
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8000/backup/scheduler/trigger-now
```

### List All Backups
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8000/backup
```

## Changing Backup Time

### To run at 10 PM EST instead of 11:59 UTC:

Update `.env`:
```
BACKUP_SCHEDULE_HOUR=22
BACKUP_SCHEDULE_MINUTE=0
BACKUP_SCHEDULE_TIMEZONE=US/Eastern
```

Restart backend service.

### Common Times:
- **23:59 UTC** → HOUR=23, MINUTE=59, TZ=UTC
- **22:00 EST** → HOUR=22, MINUTE=0, TZ=US/Eastern
- **18:00 PST** → HOUR=18, MINUTE=0, TZ=US/Pacific
- **09:00 JST** → HOUR=9, MINUTE=0, TZ=Asia/Tokyo

## Troubleshooting

### Backups not running?

1. **Check if scheduler is enabled:**
   ```bash
   grep "BACKUP_SCHEDULE_ENABLED" backend.log
   ```
   Should see: `Backup scheduler started`

2. **Verify configuration:**
   ```bash
   curl -H "Authorization: Bearer TOKEN" http://localhost:8000/backup/scheduler/status
   ```

3. **Check next run time:**
   Look at `next_run_time` in status response

4. **Restart backend:**
   ```bash
   # Stop the server (Ctrl+C)
   # Then restart it
   ```

### Wrong timezone?

Check in logs:
```bash
grep "scheduler started" backend.log
```

Should show your timezone. If wrong, update `.env` and restart.

### Storage Issues?

Check backup folder has write permissions:
```bash
ls -la "C:\Users\[USERNAME]\AppData\Roaming\iStore\backups"
```

## Best Practices

1. **Set backup time during off-peak hours** - Avoid business hours
2. **Keep at least 10 backups** - BACKUP_KEEP_AUTO=10 (default)
3. **Monitor logs regularly** - Check `backend.log` for errors
4. **Test restore process** - Make sure backups work
5. **Use timezone matching your business** - Not always UTC
6. **Enable Firebase if possible** - Cloud redundancy

## Performance Impact

- **Backup duration:** < 1 second (typical small database)
- **CPU usage:** Minimal during backup
- **Memory usage:** Negligible
- **API impact:** None - runs in background
- **Storage:** ~50MB per backup (depends on data size)

## Disaster Recovery

If you need to restore:
```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8000/backup/restore/auto_20260513_235900.db
```

A pre-restore snapshot is automatically created before restoration.

## Uninstalling/Disabling

To disable automatic backups without removing code:
```
BACKUP_SCHEDULE_ENABLED=false
```

To completely remove (not recommended):
1. Remove scheduler code
2. Remove from requirements.txt
3. pip uninstall apscheduler pytz
4. Remove config variables from app/config.py

## Support

For issues, check:
1. `backend.log` - All operations logged here
2. Scheduler status API - Verify it's running
3. Firestore/Cloud logs - If using Firebase sync
4. Disk space - Ensure enough storage for backups

Typical log locations:
- Logs: `c:\D\Projects\Python\I Store\V1\backend\backend.log`
- Backups: `c:\Users\[USERNAME]\AppData\Roaming\iStore\backups\`
