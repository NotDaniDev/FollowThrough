# 🎯 Follow Through
### *The Autonomous Enterprise Commitment & Orphan Task Intelligence Engine*
**Built for GirlHacks 2026 | ADP Challenge: "AI for the Modern Enterprise"**

[![Python](https://img.shields.io/badge/Python-3.14-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-green.svg)](https://fastapi.tiangolo.com/)
[![Google Gemini](https://img.shields.io/badge/Gemini%20API-2.5%2FFlash-orange.svg)](https://ai.google.dev/)
[![Photon](https://img.shields.io/badge/Photon-iMessage%20Agent-purple.svg)](https://photon.codes/)
[![Tiger Data](https://img.shields.io/badge/Tiger%20Data-Postgres%20Time--Series-red.svg)](https://timescale.com/)
[![ElevenLabs](https://img.shields.io/badge/ElevenLabs-Voice%20AI-blueviolet.svg)](https://elevenlabs.io/)

---

## 💡 The Problem
In modern enterprise teams, critical business context doesn't live in clean JIRA tickets—it lives in **scattered conversations**:
1. **Broken 1-on-1 Promises**: A quick text or call promise (*"I'll get back to you with the revised pricing by 3 PM"*) gets buried in chat threads and forgotten.
2. **The "Orphan Task" Dilemma**: In team meetings, someone says *"Someone really needs to audit our backup replication before Friday"*—everyone nods in agreement, but **nobody is assigned ownership**. The task slips through the cracks, resulting in outages or blown client deals.

## 🚀 The Solution: Follow Through
Follow Through turns messy enterprise conversations into automated accountability:
- 📱 **Photon iMessage Agent**: Lives directly inside native iMessage/SMS. Text commitments naturally, and receive proactive conversational nudges before deadlines expire.
- 🎙️ **Gemini Transcript Parsing**: Upload raw Zoom/Teams transcripts. Gemini extracts explicit commitments with exact timeframes and flags **high-risk orphan tasks**.
- ⚠️ **Instant Orphan Task Claiming**: Allows any team member to claim ownership of unassigned meeting tasks with one click.
- 📊 **Tiger Data Time-Series Engine**: Tracks commitments over time with live countdown clocks and SLA breach warnings.
- 🔊 **ElevenLabs Morning Voice Standup**: Generates an expressive 60-second audio debrief of your commitments due today.

---

## 🏆 Hackathon Sponsor Prize Alignment

| Challenge / Sponsor | Implementation in Follow Through
| :--- | :--- | :--- |
| **ADP: AI for the Modern Enterprise** | Directly solves context fragmentation by unifying texts, calls, and transcripts into an actionable commitment timeline. 
| **Best Use of Gemini API** | High-context semantic parsing, timeframe normalization, and passive-voice orphan task classification.
| **Agents in iMessage using Photon** | Native conversational iMessage companion via Photon / Spectrum framework. 
| **Best Use of Tiger Data** | Time-series PostgreSQL storage of chronological promises, countdowns, and completion velocity. 
| **Best Use of ElevenLabs** | Expressive Morning Voice Debrief & automated voice reminder alerts. 

---

## ⚡ Quick Start

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Configure Environment (Optional)
Copy `.env.example` to `.env` and paste your API keys:
```bash
cp .env.example .env
```
*(Note: Follow Through includes intelligent heuristic fallbacks and Web Speech synthesis, so it runs completely out of the box even before keys are pasted!)*

### 3. Run the Application
```bash
python run.py
```
Open **[http://localhost:8000](http://localhost:8000)** in your browser!


