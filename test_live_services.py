import sys
sys.stdout.reconfigure(encoding='utf-8')
import os
from backend.config import config
import psycopg2

print("=== 1. TESTING TIGER DATA / TIMESCALE POSTGRESQL ===")
print("URL:", config.DATABASE_URL[:40] + "...")

try:
    conn = psycopg2.connect(config.DATABASE_URL)
    cursor = conn.cursor()
    cursor.execute("SELECT version();")
    ver = cursor.fetchone()
    print("✅ Connected to Tiger Data / Timescale PostgreSQL successfully!")
    print("Database Version:", ver[0][:60])
    
    # Check Timescale extension if present
    try:
        cursor.execute("SELECT extname, extversion FROM pg_extension WHERE extname = 'timescaledb';")
        ext = cursor.fetchone()
        if ext:
            print(f"Timescale Extension: {ext[0]} v{ext[1]}")
    except Exception:
        pass

    cursor.close()
    conn.close()
except Exception as e:
    print("❌ Postgres connection error:", e)
