import sys
sys.stdout.reconfigure(encoding='utf-8')

import uvicorn
from backend.config import config

if __name__ == "__main__":
    print(f"🚀 Starting Follow Through AI Server on http://localhost:{config.PORT}")
    print("🌿 Built for ADP 'AI for the Modern Enterprise' Challenge | GirlHacks 2026")
    uvicorn.run("backend.app:app", host=config.HOST, port=config.PORT, reload=True)
