import sys
from pathlib import Path

# Ensure project root is in sys.path regardless of execution working directory
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import uvicorn
from backend.app.config import HOST, PORT

if __name__ == "__main__":
    print(f"Starting Offline Voice AI Assistant Backend on http://{HOST}:{PORT} ...")
    uvicorn.run("backend.app.main:app", host=HOST, port=PORT, reload=True)
