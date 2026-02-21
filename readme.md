# CareerLM

AI-powered career assistant that helps job seekers optimize resumes, identify skill gaps, and prepare for interviews.

## Features

- **Resume Optimizer** – ATS scoring, gap analysis, and AI suggestions
- **Skill Gap Analyzer** – Career path matching with skill recommendations  
- **Mock Interview** – AI interview practice with feedback
- **Cold Email Generator** – Personalized outreach templates
- **Study Planner** – Learning paths for missing skills

## Tech Stack

```
Frontend:  React
Backend:   FastAPI + LangGraph Agents
AI:        Groq (llama-3.1-8b-instant), Gemini 2.0 Flash (Google Search grounding)
Database:  PostgreSQL (Supabase)
```

## API Keys Setup

Create a `.env` file inside `backend-fastapi/` with the following keys:

```env
GROQ_API_KEY=your_groq_api_key
GEMINI_API_KEY=your_gemini_api_key
SUPABASE_URL=your_supabase_project_url
SUPABASE_KEY=your_supabase_service_role_key
```

### Getting the keys

| Key | Where to get it |
|-----|----------------|
| **GROQ_API_KEY** | Sign up at [console.groq.com](https://console.groq.com) → **API Keys** → Create |
| **GEMINI_API_KEY** | Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey) → **Create API Key** (free tier available) |
| **SUPABASE_URL** | Create a project at [supabase.com](https://supabase.com) → **Settings → API** → Project URL |
| **SUPABASE_KEY** | Same page → **service_role** secret key |

> **Note:** The Gemini API key is used by the **Study Planner** agent for live resource discovery via Google Search grounding. All other agents use Groq.

## Quick Start

```bash
# Backend
cd backend-fastapi
pip install -r requirements.txt
uvicorn app.main:app --reload

# Frontend
cd frontend-react
npm install
npm start
```

## Project Structure

```
CareerLM/
├── frontend-react/     # React app
│   └── src/
│       ├── components/ # UI components
│       ├── pages/      # Home, Dashboard, Auth
│       └── context/    # User session
│
└── backend-fastapi/    # FastAPI server
    └── app/
        ├── agents/     # LangGraph workflow
        ├── services/   # Business logic
        └── api/        # REST endpoints
```

**Built with ❤️ by [avogadronuggies](https://github.com/avogadronuggies)**
