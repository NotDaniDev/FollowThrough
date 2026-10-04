import sys
sys.stdout.reconfigure(encoding='utf-8')

from fastapi.testclient import TestClient
from backend.app import app

client = TestClient(app)

print("1. Testing GET / (Dashboard)")
r = client.get("/")
assert r.status_code == 200, f"Dashboard failed: {r.status_code}"
print("   Dashboard OK!")

print("2. Testing GET /api/commitments")
r = client.get("/api/commitments")
assert r.status_code == 200, f"Commitments failed: {r.status_code}"
data = r.json()
print(f"   Found {len(data)} commitments!")

print("3. Testing GET /api/analytics")
r = client.get("/api/analytics")
assert r.status_code == 200, f"Analytics failed: {r.status_code}"
analytics = r.json()
print("   Analytics:", analytics)

print("4. Testing POST /api/imessage/simulate")
r = client.post("/api/imessage/simulate", data={"sender": "Alex", "text": "I will send the revised roadmap by 4 PM today."})
assert r.status_code == 200, f"iMessage simulation failed: {r.status_code}"
print("   iMessage Bot Reply:\n", r.json()["reply"])

print("5. Testing POST /api/meetings/upload")
sample_meeting = """
Alex: I will email the contract to Acme Corp by 5 PM.
Maya: Sounds good.
Sarah: Someone really needs to verify the database backup replication before Friday!
"""
r = client.post("/api/meetings/upload", data={"raw_text": sample_meeting, "title": "Test Sync"})
assert r.status_code == 200, f"Meeting upload failed: {r.status_code}"
res = r.json()
print(f"   Meeting extracted {res['total_extracted']} items: {res['assigned_commitments']} assigned, {res['orphan_tasks']} orphan tasks!")

print("6. Testing POST /api/voice/briefing")
r = client.post("/api/voice/briefing")
assert r.status_code == 200, f"Voice briefing failed: {r.status_code}"
voice_res = r.json()
print("   Voice debrief script generated:", voice_res["script"][:80], "...")

print("\n🎉 ALL TESTS PASSED! Backend is 100% operational!")
