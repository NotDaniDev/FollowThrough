import os
import re
from typing import Optional, List
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from backend.config import config
from backend.models import (
    Commitment, CommitmentCreate, ClaimRequest, NudgeRequest, 
    VoiceBriefingRequest, PhoneSettingsRequest, CustomReminderRequest
)
import backend.database as db
from backend.gemini_service import extract_commitments_with_gemini
from backend.elevenlabs_service import generate_voice_briefing
from backend.photon_service import (
    process_inbound_imessage, send_nudge, get_recent_feed,
    get_user_phone, set_user_phone, send_live_imessage_rpc,
    get_phone_connection_details, start_imessage_listener
)

app = FastAPI(
    title="Follow Through AI",
    description="The Autonomous Enterprise Commitment & Orphan Task Intelligence Engine for ADP & GirlHacks 2026",
    version="1.0.0"
)

@app.on_event("startup")
def on_startup():
    start_imessage_listener()

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize database
db.init_db()

# Mount static files
STATIC_DIR = os.path.join(os.path.dirname(__file__), "..", "static")
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.get("/")
def read_root():
    return FileResponse(os.path.join(STATIC_DIR, "index.html"))

@app.get("/api/commitments", response_model=List[Commitment])
def list_commitments(channel: Optional[str] = None, status: Optional[str] = None, orphans_only: bool = False):
    return db.get_all_commitments(channel=channel, status=status, orphans_only=orphans_only)

@app.post("/api/commitments", response_model=Commitment)
def create_commitment(payload: CommitmentCreate):
    import uuid
    from datetime import datetime, timezone
    c = Commitment(
        id=str(uuid.uuid4()),
        created_at=datetime.now(timezone.utc).isoformat(),
        **payload.model_dump()
    )
    return db.insert_commitment(c)

@app.post("/api/commitments/{cid}/status")
def change_status(cid: str, status: str):
    success = db.update_status(cid, status)
    if not success:
        raise HTTPException(status_code=404, detail="Commitment not found")
    return {"success": True, "id": cid, "new_status": status}

@app.get("/api/settings/phone")
def get_phone_setting():
    return get_phone_connection_details()

@app.post("/api/demo/reset")
def reset_demo():
    db.reset_demo_data()
    return {"success": True, "count": len(db.get_all_commitments()), "message": "Demo data restored!"}

@app.post("/api/settings/phone")
def set_phone_setting(payload: PhoneSettingsRequest):
    details = set_user_phone(payload.phone)
    # Send an immediate live welcome iMessage via Photon!
    welcome_text = "🌿 Welcome to Follow Through! Your phone is now linked to your iMessage agent. You will receive real-time deadline nudges and commitment updates here!"
    rpc_res = send_live_imessage_rpc(details["phone"], welcome_text)
    return {
        "success": True, 
        **details,
        "welcome_dispatched": rpc_res
    }

@app.post("/api/settings/test-nudge")
def test_phone_nudge():
    details = get_phone_connection_details()
    phone = details.get("phone")
    if not phone:
        raise HTTPException(status_code=400, detail="No phone number linked yet. Please enter your phone number first.")
    
    test_text = "⏰ [Follow Through Test Nudge] Your iMessage integration with Photon Spectrum is active and receiving live notifications!"
    rpc_res = send_live_imessage_rpc(phone, test_text)
    return {
        "success": rpc_res.get("success", False),
        "phone": phone,
        "rpc_result": rpc_res
    }

@app.post("/api/commitments/custom-reminder", response_model=Commitment)
def create_custom_reminder(payload: CustomReminderRequest):
    import uuid
    from datetime import datetime, timezone, timedelta
    now = datetime.now(timezone.utc)
    
    # Calculate target deadline from natural language
    tf_lower = payload.timeframe.lower()
    deadline_iso = (now + timedelta(hours=2)).isoformat()
    if "min" in tf_lower:
        match = re.search(r"(\d+)\s*min", tf_lower)
        mins = int(match.group(1)) if match else 30
        deadline_iso = (now + timedelta(minutes=mins)).isoformat()
    elif "hour" in tf_lower or "hr" in tf_lower:
        match = re.search(r"(\d+)\s*h", tf_lower)
        hrs = int(match.group(1)) if match else 1
        deadline_iso = (now + timedelta(hours=hrs)).isoformat()
    elif "tomorrow" in tf_lower:
        deadline_iso = (now + timedelta(hours=20)).isoformat()
    elif "day" in tf_lower:
        match = re.search(r"(\d+)\s*day", tf_lower)
        days = int(match.group(1)) if match else 1
        deadline_iso = (now + timedelta(days=days)).isoformat()
    elif "friday" in tf_lower:
        deadline_iso = (now + timedelta(days=3)).isoformat()

    c = Commitment(
        id=str(uuid.uuid4()),
        title=payload.title,
        raw_statement=f"Reminder: {payload.title} due {payload.timeframe}",
        committer=payload.committer or "Alex",
        recipient=payload.recipient or "Self / Team",
        channel="imessage",
        meeting_title="Custom Personal Reminder",
        deadline_text=payload.timeframe,
        deadline_iso=deadline_iso,
        is_orphan=False,
        urgency="high",
        status="pending",
        created_at=now.isoformat(),
        nudge_count=0
    )
    saved = db.insert_commitment(c)

    # If requested and phone is set, send immediate confirmation to iMessage
    user_ph = get_user_phone()
    if payload.notify_phone and user_ph:
        msg = f"⏰ Follow Through: Reminder created!\n\"{saved.title}\"\nDue: {saved.deadline_text}\nI'll ping you before the deadline."
        send_live_imessage_rpc(user_ph, msg)

    return saved

@app.post("/api/commitments/{cid}/nudge")
def trigger_nudge(cid: str, payload: Optional[NudgeRequest] = None):
    commitment = db.get_commitment_by_id(cid)
    if not commitment:
        raise HTTPException(status_code=404, detail="Commitment not found")
    custom_msg = payload.custom_message if payload else None
    target_ph = payload.target_phone if payload else None
    result = send_nudge(commitment, custom_msg, target_phone=target_ph)
    return result

@app.post("/api/orphan-tasks/{cid}/claim")
def claim_task(cid: str, payload: ClaimRequest):
    commitment = db.get_commitment_by_id(cid)
    if not commitment:
        raise HTTPException(status_code=404, detail="Commitment not found")
    
    db.claim_orphan(cid, payload.user_name)
    updated = db.get_commitment_by_id(cid)

    # Dispatch confirmation iMessage to the user's phone via Photon Spectrum
    imessage_res = None
    user_ph = payload.target_phone or get_user_phone()
    if payload.notify_phone and user_ph:
        msg = (
            f"🙋 Follow Through: Task Claimed!\n"
            f"{payload.user_name} has taken ownership of: \"{commitment.title}\"\n"
            f"Due: {commitment.deadline_text or 'Soon'}\n"
            f"I've added this to your active commitments and will proactively ping you before the deadline!"
        )
        imessage_res = send_live_imessage_rpc(user_ph, msg)

    return {
        "success": True, 
        "id": cid, 
        "claimed_by": payload.user_name,
        "commitment": updated,
        "imessage_dispatched": imessage_res
    }

@app.post("/api/meetings/upload")
async def upload_meeting(
    file: Optional[UploadFile] = File(None),
    raw_text: Optional[str] = Form(None),
    title: Optional[str] = Form("Enterprise Team Meeting")
):
    content = ""
    if file:
        file_bytes = await file.read()
        content = file_bytes.decode("utf-8", errors="ignore")
    elif raw_text:
        content = raw_text
    else:
        raise HTTPException(status_code=400, detail="Provide either a transcript file or raw text.")

    # Process with Gemini
    extracted = extract_commitments_with_gemini(
        text=content,
        channel="meeting",
        meeting_title=title
    )

    saved_items = []
    for item in extracted:
        saved = db.insert_commitment(item)
        saved_items.append(saved)

    assigned = [item for item in saved_items if not item.is_orphan]
    orphans = [item for item in saved_items if item.is_orphan]

    return {
        "meeting_title": title,
        "total_extracted": len(saved_items),
        "assigned_commitments": len(assigned),
        "orphan_tasks": len(orphans),
        "items": saved_items
    }

@app.post("/api/imessage/simulate")
def simulate_imessage(sender: str = Form("Alex"), text: str = Form(...)):
    result = process_inbound_imessage(sender, text)
    return result

@app.get("/api/imessage/feed")
def get_imessage_feed():
    try:
        return get_recent_feed()
    except Exception as e:
        return []

@app.post("/api/voice/briefing")
def get_voice_briefing(payload: Optional[VoiceBriefingRequest] = None):
    user_name = payload.user_name if payload else "Alex"
    commitments = db.get_all_commitments()
    return generate_voice_briefing(commitments, user_name=user_name)

@app.get("/api/analytics")
def get_analytics():
    return db.get_analytics()

@app.get("/api/sample-transcript")
def get_sample_transcript():
    sample_path = os.path.join(os.path.dirname(__file__), "test_data", "sprint_sync.txt")
    if os.path.exists(sample_path):
        with open(sample_path, "r", encoding="utf-8") as f:
            return {"content": f.read()}
    return {"content": ""}

@app.post("/api/webhook/photon")
async def photon_webhook(request: Request):
    """Native webhook handler for Photon Spectrum events"""
    payload = await request.json()
    sender = payload.get("from") or payload.get("sender") or "User"
    body = payload.get("body") or payload.get("text") or ""
    return process_inbound_imessage(sender, body)
