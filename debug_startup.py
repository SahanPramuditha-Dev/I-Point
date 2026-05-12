import sys
import os
sys.path.insert(0, os.path.realpath(os.path.join(os.path.dirname(__file__), 'backend')))

try:
    from backend.app.migrations import migrate
    from backend.app.seed import seed_data
    print("Running migrations...")
    migrate()
    print("Running seed...")
    seed_data()
    print("Startup success!")
except Exception as e:
    import traceback
    traceback.print_exc()
