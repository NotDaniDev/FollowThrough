from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field

class CommitmentBase(BaseModel):
    title: str = Field(description="Clear, actionable task summary")
    raw_statement: str = Field(description="Exact sentence or quote from conversation")
    committer: Optional[str] = Field(default=None, description="Person who made the commitment, or null if unassigned")
    recipient: Optional[str] = Field(default=None, description="Person or client the commitment was made to")
    channel: str = Field(default="imessage", description="imessage, sms, meeting, call")
    meeting_title: Optional[str] = Field(default=None, description="Associated meeting or call name")
    deadline_text: Optional[str] = Field(default=None, description="Natural phrasing e.g. 'by 3 PM today', 'by EOD Friday'")
    deadline_iso: Optional[str] = Field(default=None, description="Normalized ISO-8601 UTC timestamp")
    is_orphan: bool = Field(default=False, description="True if task was identified but unassigned to any owner")
    urgency: str = Field(default="medium", description="low, medium, high, critical")
    status: str = Field(default="pending", description="pending, completed, overdue, claimed")
    claimed_by: Optional[str] = Field(default=None, description="User who adopted the orphan task")

class CommitmentCreate(CommitmentBase):
    pass

class Commitment(CommitmentBase):
    id: str
    created_at: str
    completed_at: Optional[str] = None
    nudge_count: int = 0

class MeetingUpload(BaseModel):
    title: str
    transcript: str
    attendees: Optional[List[str]] = []
    recorded_at: Optional[str] = None

class MeetingAnalysisResult(BaseModel):
    meeting_id: str
    title: str
    summary: str
    attendees: List[str]
    commitments: List[Commitment]
    orphan_tasks: List[Commitment]

class ClaimRequest(BaseModel):
    user_name: str
    notify_phone: bool = True
    target_phone: Optional[str] = None

class NudgeRequest(BaseModel):
    commitment_id: Optional[str] = None
    custom_message: Optional[str] = None
    target_phone: Optional[str] = None

class PhoneSettingsRequest(BaseModel):
    phone: str

class CustomReminderRequest(BaseModel):
    title: str
    timeframe: str
    recipient: Optional[str] = "Colleague / Client"
    committer: Optional[str] = "Me"
    notify_phone: bool = True

class VoiceBriefingRequest(BaseModel):
    user_name: Optional[str] = "Alex"
    include_orphans: bool = True
