import os
import uuid
from typing import Optional, Dict, Any, List
from backend.config import config
from backend.models import Commitment

STATIC_AUDIO_DIR = os.path.join(os.path.dirname(__file__), "..", "static", "audio")
os.makedirs(STATIC_AUDIO_DIR, exist_ok=True)

def generate_voice_briefing(commitments: List[Commitment], user_name: str = "Alex") -> Dict[str, Any]:
    """
    Generates a natural-sounding voice briefing of pending commitments and orphan tasks
    using ElevenLabs API.
    """
    pending = [c for c in commitments if c.status == 'pending' and not c.is_orphan]
    orphans = [c for c in commitments if c.is_orphan and c.status != 'completed']

    # Compose natural spoken script
    script_parts = [f"Good morning, {user_name}. Here is your enterprise accountability debrief."]
    
    if pending:
        script_parts.append(f"You have {len(pending)} active commitment{'s' if len(pending) > 1 else ''} on your radar.")
        for i, c in enumerate(pending[:2]):
            timeframe = c.deadline_text or "soon"
            script_parts.append(f"First, {c.title}, which you promised to deliver {timeframe}.")
    else:
        script_parts.append("You have no pending individual commitments at this moment.")

    if orphans:
        script_parts.append(f"Attention: There {'is' if len(orphans) == 1 else 'are'} {len(orphans)} unassigned orphan task{'s' if len(orphans) > 1 else ''} from recent meetings that require an owner.")
        script_parts.append(f"Most critically: {orphans[0].title}.")

    script_parts.append("Stay focused and have a productive day.")
    full_script = " ".join(script_parts)

    audio_file_name = f"briefing_{uuid.uuid4().hex[:8]}.mp3"
    audio_path = os.path.join(STATIC_AUDIO_DIR, audio_file_name)
    relative_url = f"/static/audio/{audio_file_name}"

    if config.ELEVENLABS_API_KEY:
        try:
            from elevenlabs.client import ElevenLabs
            eleven = ElevenLabs(api_key=config.ELEVENLABS_API_KEY)
            
            audio_generator = eleven.text_to_speech.convert(
                text=full_script,
                voice_id=config.ELEVENLABS_VOICE_ID,
                model_id="eleven_multilingual_v2"
            )
            
            with open(audio_path, "wb") as f:
                for chunk in audio_generator:
                    f.write(chunk)
            
            return {
                "success": True,
                "audio_url": relative_url,
                "script": full_script,
                "voice_engine": "ElevenLabs Creator AI"
            }
        except Exception as e:
            print(f"[ElevenLabs Warning] API call failed: {e}. Falling back to browser speech.")

    # Fallback response for browser synthesis or demo preview
    return {
        "success": True,
        "audio_url": None, # Indicates browser Web Speech API should synthesize
        "script": full_script,
        "voice_engine": "Web Speech Synthesizer (Plug in ElevenLabs Key for Studio Voice)"
    }
