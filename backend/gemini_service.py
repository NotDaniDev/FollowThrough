import json
import re
import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional
from backend.config import config
from backend.models import Commitment

EXTRACTION_SYSTEM_INSTRUCTION = """
You are an enterprise AI assistant for Follow Through (AI for the Modern Enterprise).
Your job is to analyze business conversations (texts, calls, meeting transcripts) and extract all:
1. Commitments & Promises made by speakers (who promised what to whom, and by when).
2. ORPHAN TASKS: Critical action items, risks, or next steps mentioned during the conversation where NO SPECIFIC PERSON was assigned ownership (e.g. "someone needs to...", "we really should...", "this needs to be updated before...").

For each extracted item, output JSON with the following structure:
[
  {
    "title": "Short actionable task title",
    "raw_statement": "The exact quote/sentence from the text or transcript",
    "committer": "Name of person who made the promise, OR null if it's an unassigned orphan task",
    "recipient": "Person, customer, or group the promise was made to, or null",
    "channel": "imessage" or "meeting" or "call",
    "deadline_text": "Original conversational phrasing e.g. 'by 3 PM today', 'by Friday EOD', 'before next standup'",
    "deadline_iso": "Computed ISO-8601 UTC timestamp assuming current time is REFERENCE_DATETIME. If no specific time mentioned, estimate logically (e.g., end of week or 48 hours).",
    "is_orphan": true if no individual person took direct personal ownership, otherwise false,
    "urgency": "low", "medium", "high", or "critical"
  }
]

Be extremely vigilant for ORPHAN TASKS: in modern enterprise meetings, critical deliverables slip through the cracks when everyone assumes 'someone else will do it'.
Return ONLY valid JSON array.
"""

def extract_commitments_with_gemini(
    text: str, 
    channel: str = "meeting", 
    meeting_title: Optional[str] = None,
    speaker: Optional[str] = None
) -> List[Commitment]:
    """
    Extracts commitments and orphan tasks from text or transcript using Gemini API,
    with an intelligent fallback if GEMINI_API_KEY is not configured yet.
    """
    now = datetime.now(timezone.utc)
    reference_time = now.isoformat()

    if config.GEMINI_API_KEY:
        try:
            from google import genai
            from google.genai import types

            client = genai.Client(api_key=config.GEMINI_API_KEY)
            
            prompt = f"""
REFERENCE_DATETIME: {reference_time}
DEFAULT_SPEAKER_HINT: {speaker or 'Unknown'}
CHANNEL: {channel}
MEETING_TITLE: {meeting_title or 'General Conversation'}

CONVERSATION CONTENT:
{text}
"""
            # Use gemini-3.5-flash-lite or gemini-3.8-flash
            try:
                response = client.models.generate_content(
                    model="gemini-3.5-flash-lite",
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        system_instruction=EXTRACTION_SYSTEM_INSTRUCTION,
                        temperature=0.2,
                        response_mime_type="application/json"
                    )
                )
            except Exception:
                response = client.models.generate_content(
                    model="gemini-3.8-flash",
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        system_instruction=EXTRACTION_SYSTEM_INSTRUCTION,
                        temperature=0.2,
                        response_mime_type="application/json"
                    )
                )

            raw_response = response.text
            data = json.loads(raw_response)
            
            commitments = []
            for item in data:
                cid = str(uuid.uuid4())
                commitments.append(Commitment(
                    id=cid,
                    title=item.get("title", "Action item"),
                    raw_statement=item.get("raw_statement", text[:120]),
                    committer=item.get("committer"),
                    recipient=item.get("recipient"),
                    channel=channel,
                    meeting_title=meeting_title,
                    deadline_text=item.get("deadline_text", "Soon"),
                    deadline_iso=item.get("deadline_iso") or (now + timedelta(days=1)).isoformat(),
                    is_orphan=bool(item.get("is_orphan", False)),
                    urgency=item.get("urgency", "medium"),
                    status="pending",
                    created_at=now.isoformat(),
                    nudge_count=0
                ))
            return commitments

        except Exception as e:
            print(f"[Gemini API Warning] Live extraction fallback activated: {e}")

    # Fallback intelligent heuristic extractor (ensures zero downtime during hackathon demo)
    return _heuristic_fallback_extraction(text, channel, meeting_title, speaker, now)


def _heuristic_fallback_extraction(
    text: str, 
    channel: str, 
    meeting_title: Optional[str], 
    speaker: Optional[str],
    now: datetime
) -> List[Commitment]:
    results = []
    lines = [l.strip() for l in text.split("\n") if l.strip()]

    # Patterns for promises and orphan tasks
    promise_triggers = [
        r"i('ll| will| promise to| can have that to you)\s+(.+)",
        r"(we will|i will send|i will email|i'll get back to you|i will finalize|i will deliver)\s+(.+)"
    ]
    orphan_triggers = [
        r"someone\s+(really\s+)?(needs to|should|must|ought to|has to)\s+(.+)",
        r"we\s+(really\s+)?(need someone to|should probably have someone|have to make sure someone)\s+(.+)",
        r"who is\s+(taking care of|handling)\s+(.+)",
        r"(this|that)\s+needs to be (done|updated|verified|fixed|audited)\s+(.+)"
    ]

    for line in lines:
        # Check speaker prefix (e.g. "Alex: I will send the deck by 4pm")
        committer = speaker
        content = line
        if ":" in line:
            parts = line.split(":", 1)
            committer = parts[0].strip()
            content = parts[1].strip()

        # Check for orphan triggers
        is_orphan = False
        for op in orphan_triggers:
            if re.search(op, content, re.IGNORECASE):
                is_orphan = True
                committer = None
                break

        # Check if line contains a commitment or orphan
        is_commitment = is_orphan
        if not is_commitment:
            for pp in promise_triggers:
                if re.search(pp, content, re.IGNORECASE):
                    is_commitment = True
                    break

        # Timeframe detection
        deadline_text = "Before EOD"
        deadline_dt = now + timedelta(hours=4)
        if "today" in content.lower():
            deadline_text = "Today EOD"
            deadline_dt = now + timedelta(hours=3)
        elif "tomorrow" in content.lower():
            deadline_text = "Tomorrow at 9:00 AM"
            deadline_dt = now + timedelta(hours=20)
        elif "friday" in content.lower():
            deadline_text = "This Friday"
            deadline_dt = now + timedelta(days=2)
        elif "next week" in content.lower():
            deadline_text = "Early Next Week"
            deadline_dt = now + timedelta(days=4)

        if is_commitment:
            title = content[:80] + ("..." if len(content) > 80 else "")
            # Clean title
            title = re.sub(r"^(i'll|i will|someone needs to|we really need someone to)\s+", "", title, flags=re.IGNORECASE)
            title = title.capitalize()

            results.append(Commitment(
                id=str(uuid.uuid4()),
                title=title,
                raw_statement=line,
                committer=committer,
                recipient="Team / Client",
                channel=channel,
                meeting_title=meeting_title or ("iMessage Text" if channel == "imessage" else "Team Meeting"),
                deadline_text=deadline_text,
                deadline_iso=deadline_dt.isoformat(),
                is_orphan=is_orphan,
                urgency="critical" if is_orphan else "high",
                status="pending",
                created_at=now.isoformat(),
                nudge_count=0
            ))

    # If no specific regex matched but text was provided, create a smart generic extraction
    if not results and len(text.strip()) > 10:
        results.append(Commitment(
            id=str(uuid.uuid4()),
            title=f"Review and follow up on: {text[:50]}...",
            raw_statement=text[:140],
            committer=speaker or "Alex",
            recipient="Colleague",
            channel=channel,
            meeting_title=meeting_title,
            deadline_text="Within 24 hours",
            deadline_iso=(now + timedelta(hours=24)).isoformat(),
            is_orphan=False,
            urgency="medium",
            status="pending",
            created_at=now.isoformat(),
            nudge_count=0
        ))

    return results
