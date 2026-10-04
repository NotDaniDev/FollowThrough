import os
import sqlite3
import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any
from backend.config import config
from backend.models import Commitment

# Connect to SQLite locally by default, or PostgreSQL if DATABASE_URL is provided
DB_PATH = os.path.join(os.path.dirname(__file__), "commitflow.db")

def get_connection():
    # If DATABASE_URL is configured (e.g. Tiger Data / Timescale / Postgres)
    if config.DATABASE_URL and config.DATABASE_URL.startswith("postgres"):
        import psycopg2
        import psycopg2.extras
        conn = psycopg2.connect(config.DATABASE_URL)
        return conn, True
    else:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        return conn, False

def init_db():
    conn, is_pg = get_connection()
    cursor = conn.cursor()

    if is_pg:
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS commitments (
                id VARCHAR(64) PRIMARY KEY,
                title TEXT NOT NULL,
                raw_statement TEXT NOT NULL,
                committer VARCHAR(128),
                recipient VARCHAR(128),
                channel VARCHAR(64) NOT NULL,
                meeting_title VARCHAR(256),
                deadline_text VARCHAR(128),
                deadline_iso TIMESTAMPTZ,
                is_orphan BOOLEAN DEFAULT FALSE,
                urgency VARCHAR(32) DEFAULT 'medium',
                status VARCHAR(32) DEFAULT 'pending',
                claimed_by VARCHAR(128),
                created_at TIMESTAMPTZ NOT NULL,
                completed_at TIMESTAMPTZ,
                nudge_count INT DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS app_settings (
                key VARCHAR(128) PRIMARY KEY,
                value TEXT NOT NULL
            );
        """)
    else:
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS commitments (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                raw_statement TEXT NOT NULL,
                committer TEXT,
                recipient TEXT,
                channel TEXT NOT NULL,
                meeting_title TEXT,
                deadline_text TEXT,
                deadline_iso TEXT,
                is_orphan INTEGER DEFAULT 0,
                urgency TEXT DEFAULT 'medium',
                status TEXT DEFAULT 'pending',
                claimed_by TEXT,
                created_at TEXT NOT NULL,
                completed_at TEXT,
                nudge_count INTEGER DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
        """)

    conn.commit()
    cursor.close()
    conn.close()
    seed_if_empty()

def get_setting(key: str, default: str = "") -> str:
    conn, is_pg = get_connection()
    cursor = conn.cursor()
    q = "SELECT value FROM app_settings WHERE key = ?" if not is_pg else "SELECT value FROM app_settings WHERE key = %s"
    cursor.execute(q, (key,))
    row = cursor.fetchone()
    cursor.close()
    conn.close()
    if row:
        return row["value"] if not is_pg else row[0]
    return default

def set_setting(key: str, value: str) -> str:
    conn, is_pg = get_connection()
    cursor = conn.cursor()
    if not is_pg:
        cursor.execute("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)", (key, value))
    else:
        cursor.execute("""
            INSERT INTO app_settings (key, value) VALUES (%s, %s)
            ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
        """, (key, value))
    conn.commit()
    cursor.close()
    conn.close()
    return value

def reset_demo_data():
    conn, is_pg = get_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM commitments;")
    conn.commit()
    cursor.close()
    conn.close()
    seed_if_empty(force=True)

def seed_if_empty(force: bool = False):
    commitments = get_all_commitments()
    if commitments and not force:
        return

    now = datetime.now(timezone.utc)
    
    sample_items = [
        Commitment(
            id=str(uuid.uuid4()),
            title="Send updated Q4 pricing tiers to Sarah",
            raw_statement="I'll get back to you with the updated Q4 pricing tiers by 3 PM today.",
            committer="Alex",
            recipient="Sarah Jenkins (Acme Corp)",
            channel="imessage",
            meeting_title="Direct iMessage Thread",
            deadline_text="Today at 3:00 PM",
            deadline_iso=(now + timedelta(hours=1, minutes=30)).isoformat(),
            is_orphan=False,
            urgency="high",
            status="pending",
            created_at=(now - timedelta(hours=3)).isoformat(),
            nudge_count=1
        ),
        Commitment(
            id=str(uuid.uuid4()),
            title="Deploy hotfix for client SSO integration",
            raw_statement="Dave, don't worry, I promise to push the SSO patch before standup tomorrow morning.",
            committer="Maya",
            recipient="Dave (Lead Engineer)",
            channel="meeting",
            meeting_title="Sprint 14 Blocker Review",
            deadline_text="Tomorrow at 9:00 AM",
            deadline_iso=(now + timedelta(hours=18)).isoformat(),
            is_orphan=False,
            urgency="critical",
            status="pending",
            created_at=(now - timedelta(hours=2)).isoformat(),
            nudge_count=0
        ),
        Commitment(
            id=str(uuid.uuid4()),
            title="Update customer onboarding migration documentation",
            raw_statement="We really need someone to update the migration docs before Friday's enterprise rollout, otherwise customers will get stuck.",
            committer=None,
            recipient="Entire Engineering Team",
            channel="meeting",
            meeting_title="Product Architecture Sync",
            deadline_text="Friday at 5:00 PM",
            deadline_iso=(now + timedelta(days=2)).isoformat(),
            is_orphan=True,
            urgency="critical",
            status="pending",
            created_at=(now - timedelta(hours=4)).isoformat(),
            nudge_count=0
        ),
        Commitment(
            id=str(uuid.uuid4()),
            title="Audit ADP payroll webhook retry failure logs",
            raw_statement="Someone should probably look into why the ADP webhook had 3 timeout retries yesterday.",
            committer=None,
            recipient="DevOps Team",
            channel="meeting",
            meeting_title="Weekly Infrastructure Retro",
            deadline_text="End of day tomorrow",
            deadline_iso=(now + timedelta(days=1, hours=4)).isoformat(),
            is_orphan=True,
            urgency="high",
            status="pending",
            created_at=(now - timedelta(hours=5)).isoformat(),
            nudge_count=0
        ),
        Commitment(
            id=str(uuid.uuid4()),
            title="Share demo recording with procurement officer",
            raw_statement="I'll email the demo recording and compliance sheet right after this call.",
            committer="Alex",
            recipient="Marcus Reed (Procurement)",
            channel="call",
            meeting_title="Enterprise Discovery Call",
            deadline_text="Within 1 hour of call end",
            deadline_iso=(now - timedelta(hours=1)).isoformat(),
            is_orphan=False,
            urgency="medium",
            status="overdue",
            created_at=(now - timedelta(hours=3)).isoformat(),
            nudge_count=2
        )
    ]

    for item in sample_items:
        insert_commitment(item)

def insert_commitment(c: Commitment) -> Commitment:
    conn, is_pg = get_connection()
    cursor = conn.cursor()
    
    is_orphan_val = True if c.is_orphan else False
    if not is_pg:
        is_orphan_val = 1 if c.is_orphan else 0

    cursor.execute("""
        INSERT INTO commitments (
            id, title, raw_statement, committer, recipient, channel,
            meeting_title, deadline_text, deadline_iso, is_orphan,
            urgency, status, claimed_by, created_at, completed_at, nudge_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """ if not is_pg else """
        INSERT INTO commitments (
            id, title, raw_statement, committer, recipient, channel,
            meeting_title, deadline_text, deadline_iso, is_orphan,
            urgency, status, claimed_by, created_at, completed_at, nudge_count
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """, (
        c.id, c.title, c.raw_statement, c.committer, c.recipient, c.channel,
        c.meeting_title, c.deadline_text, c.deadline_iso, is_orphan_val,
        c.urgency, c.status, c.claimed_by, c.created_at, c.completed_at, c.nudge_count
    ))

    conn.commit()
    cursor.close()
    conn.close()
    return c

def get_all_commitments(channel: Optional[str] = None, status: Optional[str] = None, orphans_only: bool = False) -> List[Commitment]:
    conn, is_pg = get_connection()
    cursor = conn.cursor()

    query = "SELECT * FROM commitments WHERE 1=1"
    params = []

    if channel:
        query += " AND channel = ?" if not is_pg else " AND channel = %s"
        params.append(channel)
    if status:
        query += " AND status = ?" if not is_pg else " AND status = %s"
        params.append(status)
    if orphans_only:
        query += " AND is_orphan = 1" if not is_pg else " AND is_orphan = true"

    query += " ORDER BY created_at DESC"

    cursor.execute(query, tuple(params))
    rows = cursor.fetchall()
    
    results = []
    for r in rows:
        results.append(Commitment(
            id=r["id"] if not is_pg else r[0],
            title=r["title"] if not is_pg else r[1],
            raw_statement=r["raw_statement"] if not is_pg else r[2],
            committer=r["committer"] if not is_pg else r[3],
            recipient=r["recipient"] if not is_pg else r[4],
            channel=r["channel"] if not is_pg else r[5],
            meeting_title=r["meeting_title"] if not is_pg else r[6],
            deadline_text=r["deadline_text"] if not is_pg else r[7],
            deadline_iso=str(r["deadline_iso"]) if (not is_pg and r["deadline_iso"]) else (str(r[8]) if (is_pg and r[8]) else None),
            is_orphan=bool(r["is_orphan"] if not is_pg else r[9]),
            urgency=r["urgency"] if not is_pg else r[10],
            status=r["status"] if not is_pg else r[11],
            claimed_by=r["claimed_by"] if not is_pg else r[12],
            created_at=str(r["created_at"] if not is_pg else r[13]),
            completed_at=str(r["completed_at"]) if (not is_pg and r["completed_at"]) else (str(r[14]) if (is_pg and r[14]) else None),
            nudge_count=int(r["nudge_count"] if not is_pg else r[15])
        ))

    cursor.close()
    conn.close()
    return results

def get_commitment_by_id(cid: str) -> Optional[Commitment]:
    conn, is_pg = get_connection()
    cursor = conn.cursor()
    query = "SELECT * FROM commitments WHERE id = ?" if not is_pg else "SELECT * FROM commitments WHERE id = %s"
    cursor.execute(query, (cid,))
    r = cursor.fetchone()
    cursor.close()
    conn.close()
    if not r:
        return None
    return Commitment(
        id=r["id"] if not is_pg else r[0],
        title=r["title"] if not is_pg else r[1],
        raw_statement=r["raw_statement"] if not is_pg else r[2],
        committer=r["committer"] if not is_pg else r[3],
        recipient=r["recipient"] if not is_pg else r[4],
        channel=r["channel"] if not is_pg else r[5],
        meeting_title=r["meeting_title"] if not is_pg else r[6],
        deadline_text=r["deadline_text"] if not is_pg else r[7],
        deadline_iso=str(r["deadline_iso"]) if (not is_pg and r["deadline_iso"]) else (str(r[8]) if (is_pg and r[8]) else None),
        is_orphan=bool(r["is_orphan"] if not is_pg else r[9]),
        urgency=r["urgency"] if not is_pg else r[10],
        status=r["status"] if not is_pg else r[11],
        claimed_by=r["claimed_by"] if not is_pg else r[12],
        created_at=str(r["created_at"] if not is_pg else r[13]),
        completed_at=str(r["completed_at"]) if (not is_pg and r["completed_at"]) else (str(r[14]) if (is_pg and r[14]) else None),
        nudge_count=int(r["nudge_count"] if not is_pg else r[15])
    )

def update_status(cid: str, new_status: str) -> bool:
    conn, is_pg = get_connection()
    cursor = conn.cursor()
    now_iso = datetime.now(timezone.utc).isoformat()
    if new_status == "completed":
        q = "UPDATE commitments SET status = ?, completed_at = ? WHERE id = ?" if not is_pg else "UPDATE commitments SET status = %s, completed_at = %s WHERE id = %s"
        cursor.execute(q, (new_status, now_iso, cid))
    else:
        q = "UPDATE commitments SET status = ? WHERE id = ?" if not is_pg else "UPDATE commitments SET status = %s WHERE id = %s"
        cursor.execute(q, (new_status, cid))
    conn.commit()
    cursor.close()
    conn.close()
    return True

def claim_orphan(cid: str, user_name: str) -> bool:
    conn, is_pg = get_connection()
    cursor = conn.cursor()
    # When claimed, it is assigned to user_name, is_orphan becomes false, and status becomes pending
    is_orphan_val = 0 if not is_pg else False
    q = """
        UPDATE commitments 
        SET committer = ?, claimed_by = ?, is_orphan = ?, status = 'pending'
        WHERE id = ?
    """ if not is_pg else """
        UPDATE commitments 
        SET committer = %s, claimed_by = %s, is_orphan = %s, status = 'pending'
        WHERE id = %s
    """
    cursor.execute(q, (user_name, user_name, is_orphan_val, cid))
    conn.commit()
    cursor.close()
    conn.close()
    return True

def increment_nudge(cid: str) -> int:
    conn, is_pg = get_connection()
    cursor = conn.cursor()
    q = "UPDATE commitments SET nudge_count = nudge_count + 1 WHERE id = ?" if not is_pg else "UPDATE commitments SET nudge_count = nudge_count + 1 WHERE id = %s"
    cursor.execute(q, (cid,))
    conn.commit()
    cursor.close()
    conn.close()
    return True

def get_analytics() -> Dict[str, Any]:
    all_items = get_all_commitments()
    total = len(all_items)
    pending = len([c for c in all_items if c.status == 'pending'])
    completed = len([c for c in all_items if c.status == 'completed'])
    overdue = len([c for c in all_items if c.status == 'overdue'])
    orphans = len([c for c in all_items if c.is_orphan and c.status != 'completed'])
    
    reliability_rate = round((completed / (total or 1)) * 100, 1)

    return {
        "total_commitments": total,
        "pending": pending,
        "completed": completed,
        "overdue": overdue,
        "active_orphans": orphans,
        "reliability_rate_percent": reliability_rate,
        "database_engine": "Tiger Data (PostgreSQL Timescale)" if config.DATABASE_URL else "SQLite (Local Dev Engine)",
    }
