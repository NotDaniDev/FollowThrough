import os
import sys
import re
import requests
import grpc
import threading
import time
from typing import Dict, Any, Optional
from datetime import datetime, timezone
from backend.config import config
from backend.models import Commitment
from backend.gemini_service import extract_commitments_with_gemini
import backend.database as db

# Ensure proto packages are importable
PROTO_DIR = os.path.join(os.path.dirname(__file__), "proto")
if PROTO_DIR not in sys.path:
    sys.path.insert(0, PROTO_DIR)

try:
    from photon.imessage.v1 import message_service_pb2_grpc, message_service_pb2
    GRPC_AVAILABLE = True
except Exception as e:
    print(f"[Photon Warning] gRPC stubs could not be loaded: {e}")
    GRPC_AVAILABLE = False

# In-memory storage for active user phone number & recent feed
USER_PHONE_NUMBER = os.getenv("USER_PHONE_NUMBER", "")
IMESSAGE_FEED_LOG = []
LISTENER_THREAD = None
LISTENER_RUNNING = False

def clean_e164(phone: str) -> str:
    cleaned = re.sub(r"[^\d+]", "", phone.strip())
    if cleaned and not cleaned.startswith("+"):
        cleaned = "+1" + cleaned if len(cleaned) == 10 else "+" + cleaned
    return cleaned

def register_or_get_user_in_spectrum(phone: str) -> Dict[str, Any]:
    """
    Registers the user's phone number with Photon Spectrum project users API.
    Returns user id, assigned phone number (the bot's iMessage line), etc.
    """
    cleaned = clean_e164(phone)
    if not cleaned:
        return {"success": False, "error": "Invalid phone number"}

    pid = config.SPECTRUM_PROJECT_ID
    sec = config.SPECTRUM_PROJECT_SECRET
    if not pid or not sec:
        return {"success": False, "error": "Credentials missing"}

    # 1. Check existing users
    try:
        r = requests.get(f"https://spectrum.photon.codes/projects/{pid}/users/", auth=(pid, sec), timeout=5)
        if r.status_code == 200:
            users = r.json().get("data", {}).get("users", [])
            for u in users:
                if u.get("phoneNumber") == cleaned:
                    assigned = u.get("assignedPhoneNumber")
                    uid = u.get("id")
                    db.set_setting("spectrum_assigned_phone", assigned)
                    db.set_setting("spectrum_user_id", uid)
                    return {
                        "success": True,
                        "user_id": uid,
                        "phone": cleaned,
                        "assigned_phone": assigned,
                        "redirect_url": f"https://spectrum.photon.codes/users/{uid}/redirect?msg=START",
                        "imessage_url": f"sms:{assigned}&body=START" if assigned else ""
                    }
    except Exception as e:
        print(f"[Photon] Error listing users: {e}")

    # 2. Register user if not found
    try:
        payload = {
            "type": "shared",
            "phoneNumber": cleaned,
            "firstName": "Follow Through User"
        }
        r = requests.post(f"https://spectrum.photon.codes/projects/{pid}/users/", json=payload, auth=(pid, sec), timeout=5)
        if r.status_code in [200, 201]:
            data = r.json().get("data", {})
            assigned = data.get("assignedPhoneNumber")
            uid = data.get("id")
            db.set_setting("spectrum_assigned_phone", assigned)
            db.set_setting("spectrum_user_id", uid)
            return {
                "success": True,
                "user_id": uid,
                "phone": cleaned,
                "assigned_phone": assigned,
                "redirect_url": f"https://spectrum.photon.codes/users/{uid}/redirect?msg=START",
                "imessage_url": f"sms:{assigned}&body=START" if assigned else ""
            }
        else:
            print(f"[Photon] Register user response: {r.status_code} {r.text}")
    except Exception as e:
        print(f"[Photon] Error creating user: {e}")

    return {
        "success": False,
        "phone": cleaned,
        "assigned_phone": db.get_setting("spectrum_assigned_phone") or "+16282894567"
    }

def get_user_phone() -> str:
    global USER_PHONE_NUMBER
    db_val = db.get_setting("user_phone_number")
    if db_val:
        USER_PHONE_NUMBER = db_val
    return USER_PHONE_NUMBER

def get_phone_connection_details() -> Dict[str, Any]:
    phone = get_user_phone()
    assigned = db.get_setting("spectrum_assigned_phone")
    uid = db.get_setting("spectrum_user_id")

    if phone and not assigned:
        reg = register_or_get_user_in_spectrum(phone)
        assigned = reg.get("assigned_phone")
        uid = reg.get("user_id")

    if not assigned:
        assigned = "+16282894567"  # Default shared Cosmos line for project

    return {
        "phone": phone,
        "assigned_phone": assigned,
        "user_id": uid,
        "imessage_url": f"sms:{assigned}&body=START" if assigned else "",
        "redirect_url": f"https://spectrum.photon.codes/users/{uid}/redirect?msg=START" if uid else "",
        "is_linked": bool(phone)
    }

def set_user_phone(phone: str) -> Dict[str, Any]:
    global USER_PHONE_NUMBER
    cleaned = clean_e164(phone)
    USER_PHONE_NUMBER = cleaned
    db.set_setting("user_phone_number", cleaned)

    # Register in Photon Spectrum
    reg = register_or_get_user_in_spectrum(cleaned)
    assigned = reg.get("assigned_phone") or "+16282894567"
    uid = reg.get("user_id")

    return {
        "phone": cleaned,
        "assigned_phone": assigned,
        "user_id": uid,
        "imessage_url": f"sms:{assigned}&body=START",
        "redirect_url": f"https://spectrum.photon.codes/users/{uid}/redirect?msg=START" if uid else ""
    }

def log_imessage_event(direction: str, sender: str, text: str, meta: Optional[Dict[str, Any]] = None):
    event = {
        "timestamp": datetime.now(timezone.utc).strftime("%H:%M:%S"),
        "direction": direction, # 'inbound' or 'outbound'
        "sender": sender,
        "text": text,
        "meta": meta or {}
    }
    IMESSAGE_FEED_LOG.insert(0, event)
    if len(IMESSAGE_FEED_LOG) > 35:
        IMESSAGE_FEED_LOG.pop()
    return event

def send_live_imessage_rpc(phone_number: str, message_text: str) -> Dict[str, Any]:
    """
    Sends a real iMessage to a recipient phone number using Photon Spectrum gRPC API.
    """
    if not phone_number:
        return {"success": False, "error": "No recipient phone number specified."}

    clean_number = clean_e164(phone_number)
    pid = config.SPECTRUM_PROJECT_ID
    sec = config.SPECTRUM_PROJECT_SECRET

    if not pid or not sec:
        return {"success": False, "error": "Spectrum project credentials not configured."}

    # Ensure user is registered in Spectrum
    assigned_phone = db.get_setting("spectrum_assigned_phone") or "+16282894567"
    uid = db.get_setting("spectrum_user_id")

    # 1. Fetch live iMessage token from Spectrum Cloud
    token = None
    try:
        tok_res = requests.post(
            f"https://spectrum.photon.codes/projects/{pid}/imessage/tokens",
            auth=(pid, sec),
            timeout=5
        )
        if tok_res.status_code == 200:
            token = tok_res.json().get("data", {}).get("token")
        else:
            return {"success": False, "error": f"Failed to get iMessage token: {tok_res.text}"}
    except Exception as e:
        return {"success": False, "error": f"Spectrum cloud connection error: {e}"}

    if not token or not GRPC_AVAILABLE:
        return {"success": False, "error": "Token missing or gRPC not available."}

    # 2. Dispatch message via secure TLS gRPC channel
    chat_guid = f"any;-;{clean_number}"
    try:
        creds = grpc.ssl_channel_credentials()
        channel = grpc.secure_channel("imessage.spectrum.photon.codes:443", creds)
        stub = message_service_pb2_grpc.MessageServiceStub(channel)

        req = message_service_pb2.SendTextMessageRequest(
            chat_guid=chat_guid,
            text=message_text
        )
        metadata = [("authorization", f"Bearer {token}")]
        response = stub.SendTextMessage(req, metadata=metadata, timeout=10)

        log_imessage_event("outbound", "Follow Through Bot (Photon)", message_text, {"target": clean_number, "status": "sent"})
        return {
            "success": True,
            "status": "delivered_to_phone",
            "target": clean_number,
            "chat_guid": chat_guid,
            "message": message_text
        }
    except grpc.RpcError as rpc_err:
        details = rpc_err.details() if hasattr(rpc_err, 'details') else str(rpc_err)
        log_imessage_event("outbound", "Follow Through Bot", message_text, {"target": clean_number, "rpc_error": details})

        is_target_not_allowed = "Target not allowed" in details
        return {
            "success": False,
            "status": "authorization_required" if is_target_not_allowed else "spectrum_error",
            "details": details,
            "target": clean_number,
            "assigned_phone": assigned_phone,
            "chat_guid": chat_guid,
            "imessage_url": f"sms:{assigned_phone}&body=START",
            "redirect_url": f"https://spectrum.photon.codes/users/{uid}/redirect?msg=START" if uid else "",
            "instructions": (
                f"On Photon shared tier, text 'START' to {assigned_phone} from your iPhone to open the session, "
                "or add your phone number to the Outbound Allowlist at app.photon.codes."
            )
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def process_inbound_imessage(sender: str, message_text: str) -> Dict[str, Any]:
    """
    Handles an incoming message from a user in iMessage/SMS via Photon.
    """
    log_imessage_event("inbound", sender, message_text)
    cleaned = message_text.strip().upper()

    # Handshake / Initial connection
    if cleaned in ["START", "HELLO", "HI", "CONNECT", "HELP"]:
        reply = (
            "🌿 Follow Through AI Connected!\n\n"
            "Your iMessage channel is now active. I will ping you with real-time deadline nudges.\n"
            "• Text promises to auto-track: 'Told Bob I will send the quote tomorrow by 2pm'\n"
            "• Text 'STATUS' to see your pending commitments\n"
            "• Text 'DONE' to mark tasks finished"
        )
        log_imessage_event("outbound", "Follow Through Bot", reply)
        send_live_imessage_rpc(sender, reply)
        return {"reply": reply, "action": "connected"}

    # Check for quick action commands like 'DONE'
    if cleaned.startswith("DONE"):
        commitments = db.get_all_commitments(status="pending")
        user_commitments = [c for c in commitments if (c.committer or "").lower() in sender.lower() or sender.lower() in (c.committer or "").lower()]
        target = user_commitments[0] if user_commitments else (commitments[0] if commitments else None)

        if target:
            db.update_status(target.id, "completed")
            reply = f"✅ Fantastic job! Marked '{target.title}' as completed."
        else:
            reply = "No active pending commitments found to complete."

        log_imessage_event("outbound", "Follow Through Bot", reply)
        send_live_imessage_rpc(sender, reply)
        return {"reply": reply, "action": "completed"}

    # Query command: "STATUS" or "WHAT ARE MY COMMITMENTS?"
    if "STATUS" in cleaned or ("WHAT" in cleaned and "COMMIT" in cleaned):
        commitments = db.get_all_commitments(status="pending")
        if not commitments:
            reply = "You're all clear! No pending commitments on your schedule."
        else:
            lines = ["Here are your active commitments:"]
            for c in commitments[:4]:
                lines.append(f"• {c.title} ({c.deadline_text or 'soon'})")
            reply = "\n".join(lines)
        log_imessage_event("outbound", "Follow Through Bot", reply)
        send_live_imessage_rpc(sender, reply)
        return {"reply": reply, "action": "query"}

    # Otherwise, extract commitment from the text using Gemini
    extracted = extract_commitments_with_gemini(
        text=message_text,
        channel="imessage",
        speaker=sender
    )

    if extracted:
        saved_item = db.insert_commitment(extracted[0])
        reply = (
            f"📝 Logged commitment: \"{saved_item.title}\"\n"
            f"⏰ Timeframe: {saved_item.deadline_text}\n"
            f"I'll proactively ping you before the deadline!"
        )
    else:
        reply = "Received! If this was a promise or task, let me know the timeframe (e.g. 'by 4 PM')."

    log_imessage_event("outbound", "Follow Through Bot", reply, {"commitment_id": extracted[0].id if extracted else None})
    send_live_imessage_rpc(sender, reply)

    return {
        "reply": reply,
        "extracted_commitment": extracted[0] if extracted else None
    }

def send_nudge(commitment: Commitment, custom_message: Optional[str] = None, target_phone: Optional[str] = None) -> Dict[str, Any]:
    """
    Sends a proactive reminder to the committer via iMessage using Photon.
    """
    timeframe = commitment.deadline_text or "shortly"
    committer = commitment.committer or "there"

    body = custom_message or (
        f"⏰ Follow Through Nudge for {committer}:\n"
        f"You committed to: \"{commitment.title}\" due {timeframe}.\n"
        f"Reply 'DONE' once finished!"
    )

    db.increment_nudge(commitment.id)

    # Determine target phone number
    recipient_phone = target_phone or get_user_phone() or commitment.committer
    rpc_result = send_live_imessage_rpc(recipient_phone, body)

    event = log_imessage_event("outbound", "Follow Through Bot", body, {
        "commitment_id": commitment.id,
        "recipient_phone": recipient_phone,
        "rpc_result": rpc_result
    })

    return {
        "success": rpc_result.get("success", False),
        "nudge_body": body,
        "recipient": committer,
        "recipient_phone": recipient_phone,
        "rpc_result": rpc_result,
        "event": event
    }

def get_recent_feed():
    return IMESSAGE_FEED_LOG

def start_imessage_listener():
    """
    Spawns background thread that continuously reads SubscribeMessageEvents
    from Photon Spectrum gRPC and handles inbound texts in real time.
    """
    global LISTENER_THREAD, LISTENER_RUNNING
    if not GRPC_AVAILABLE:
        print("[Photon Listener] gRPC not available, skipping listener.")
        return

    if LISTENER_RUNNING:
        return

    LISTENER_RUNNING = True

    def listener_worker():
        pid = config.SPECTRUM_PROJECT_ID
        sec = config.SPECTRUM_PROJECT_SECRET
        if not pid or not sec:
            print("[Photon Listener] Missing Spectrum credentials.")
            return

        print("[Photon Listener] Starting live iMessage event loop...")
        while True:
            try:
                # 1. Fetch fresh token
                tok_res = requests.post(
                    f"https://spectrum.photon.codes/projects/{pid}/imessage/tokens",
                    auth=(pid, sec),
                    timeout=5
                )
                if tok_res.status_code != 200:
                    time.sleep(5)
                    continue
                token = tok_res.json().get("data", {}).get("token")
                if not token:
                    time.sleep(5)
                    continue

                creds = grpc.ssl_channel_credentials()
                channel = grpc.secure_channel("imessage.spectrum.photon.codes:443", creds)
                stub = message_service_pb2_grpc.MessageServiceStub(channel)

                req = message_service_pb2.SubscribeMessageEventsRequest()
                metadata = [("authorization", f"Bearer {token}")]
                print("[Photon Listener] Connected to live iMessage event stream!")
                stream = stub.SubscribeMessageEvents(req, metadata=metadata)

                for event in stream:
                    if event.HasField("heartbeat"):
                        continue
                    if event.HasField("message_changed"):
                        mc = event.message_changed
                        if mc.is_from_me:
                            continue
                        if mc.HasField("message_received"):
                            msg = mc.message_received.message
                            text = msg.content.text if msg.HasField("content") else ""
                            sender = msg.sender or mc.actor or "Unknown"
                            if text:
                                print(f"[Photon Inbound Event] From {sender}: {text}")
                                process_inbound_imessage(sender, text)
            except Exception as e:
                print(f"[Photon Listener Reconnecting] error: {e}")
                time.sleep(3)

    LISTENER_THREAD = threading.Thread(target=listener_worker, daemon=True, name="PhotonIMessageListener")
    LISTENER_THREAD.start()
