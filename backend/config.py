import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env file from project root
BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

class Config:
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", os.getenv("GOOGLE_API_KEY", ""))
    ELEVENLABS_API_KEY: str = os.getenv("ELEVENLABS_API_KEY", "")
    ELEVENLABS_VOICE_ID: str = os.getenv("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")  # Rachel
    PHOTON_API_KEY: str = os.getenv("PHOTON_API_KEY", "")
    SPECTRUM_PROJECT_ID: str = os.getenv("SPECTRUM_PROJECT_ID", "")
    SPECTRUM_PROJECT_SECRET: str = os.getenv("SPECTRUM_PROJECT_SECRET", "")
    PHOTON_BOT_NUMBER: str = os.getenv("PHOTON_BOT_NUMBER", "+18005550199")
    DATABASE_URL: str = os.getenv("DATABASE_URL", os.getenv("TIGER_DATA_URL", ""))
    PORT: int = int(os.getenv("PORT", 8000))
    HOST: str = os.getenv("HOST", "0.0.0.0")

config = Config()
