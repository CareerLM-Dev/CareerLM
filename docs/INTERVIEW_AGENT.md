# Mock Interview Agent: AI Change Guide

This document is the single source of truth for making safe changes to the mock interview agent with any AI/LLM coding tool.

Use this file as context whenever you ask an AI tool to update interview behavior, prompts, validation, API responses, or UI integration.

---

## 1) What This Agent Does

The mock interview feature has two backend workflows:

1. Question generation workflow
2. Feedback generation workflow

At runtime:

1. Frontend requests questions with target role + difficulty.
2. Backend fetches latest resume data from Supabase.
3. LangGraph workflow prepares context, generates questions, validates count.
4. Frontend collects answers.
5. Frontend sends questions + answers for feedback.
6. Backend builds transcript, generates structured feedback JSON, stores session.

---

## 2) Critical Files (Read Before Any Change)

### Backend core
- backend-fastapi/app/api/routes_interview.py
- backend-fastapi/app/agents/interview/graph.py
- backend-fastapi/app/agents/interview/nodes.py
- backend-fastapi/app/agents/interview/state.py

### Interview service layer
- backend-fastapi/app/services/interview/prompts.py
- backend-fastapi/app/services/interview/schemas.py
- backend-fastapi/app/services/interview/fallbacks.py
- backend-fastapi/app/services/interview/recovery.py
- backend-fastapi/app/services/interview/transcript.py
- backend-fastapi/app/services/interview/utils.py

### LLM configuration
- backend-fastapi/app/agents/llm_config.py

### Frontend integration
- frontend-react/src/components/MockInterview.js
- frontend-react/src/components/StagePerformanceRadar.js
- frontend-react/src/components/TimeManagementChart.js

### Existing reference docs/tests
- MOCK_INTERVIEW_IMPLEMENTATION.md
- backend-fastapi/tests/test_interview_fallbacks.py

---

## 3) Current API Contracts

### POST /api/v1/interview/generate-questions
Auth:
- Requires Authorization header: Bearer <access_token>

Request body:
- user_id: string (required)
- target_role: string (required)
- difficulty: easy | medium | hard (optional, default medium)
- resume_id: string (optional, currently reserved and not used in route logic)

Response shape:
- success: boolean
- questions: array of objects with id, category, question
- session_id: string | null
- resume_filename: string

Notable error responses:
- 401: missing/invalid auth token
- 403: token user mismatch with request.user_id
- 404: no resume found for user
- 503: auth provider connectivity issue

### POST /api/v1/interview/generate-feedback
Auth:
- Requires Authorization header: Bearer <access_token>

Request body:
- user_id: string (required)
- target_role: string (required)
- questions: array (required)
- answers: array (required)
- resume_text: string (optional)

Validation rules:
- len(questions) must equal len(answers)
- question count must be one of 5, 10, 15

Response shape:
- success: boolean
- feedback: JSON object (not markdown string)
- timestamp: ISO datetime

Notable error responses:
- 400: mismatched questions/answers length or invalid count
- 401: missing/invalid auth token
- 403: token user mismatch with request.user_id
- 500: workflow/feedback generation failure

### GET /api/v1/interview/history
Auth:
- Requires Authorization header: Bearer <access_token>

Query:
- limit: int (default 10)

Response shape:
- success: boolean
- sessions: array
- count: int

### Feedback JSON Schema (Current)

The feedback payload must match the schema in backend-fastapi/app/services/interview/schemas.py:

- executive_summary: string
- overall_readiness: string
- quantitative_metrics:
  - verbosity: string
  - confidence_tone: string
  - keyword_hit_rate: string
- stage_performance:
  - resume_validation: string
  - project_deep_dive: string
  - core_technical: string
  - behavioral: string
- action_plan:
  - stop_doing: string[]
  - start_doing: string[]
  - study_focus: string[]
  - next_steps: string[]
- question_breakdown: array of
  - question: string
  - user_answer_summary: string
  - improvement_needed: string | null
  - ideal_golden_answer: string

---

## 4) Difficulty Rules and Question Counts

Defined in backend-fastapi/app/agents/interview/nodes.py and backend-fastapi/app/services/interview/fallbacks.py.

Current expected totals:
- easy: 5
- medium: 10
- hard: 15

Any change to these counts requires synchronized changes in:
- nodes.py validation
- fallbacks.py category targets
- routes_interview.py feedback count checks
- frontend behavior that assumes these totals

---

## 5) Non-Negotiable Invariants

Do not break these without explicit product approval:

1. Authz check: token user must match request user_id.
2. No repeated/paraphrased previous questions in a session.
3. Questions must remain JSON-structured and machine-parseable.
4. Fallback logic must exist when LLM output is malformed or incomplete.
5. Feedback output must conform to FeedbackOutput schema fields.
6. Failures should return actionable HTTP errors, not silent success.
7. DB write failure should not crash successful generation (best effort logging allowed).
---

## 6) Known Data Dependencies

Supabase tables read/write paths used now:

1. resumes
2. resume_versions
3. interview_sessions

Important assumptions:
- resume_versions.content contains sections used to rebuild resume_text.
- interview_sessions.interview_report stores questions, answers, and analysis.
- history endpoint reads interview_sessions by user_id.
- previous question dedupe pulls from the latest interview_sessions row for the same user_id + target_role.

If schema changes, update route helpers and all related queries together.

---

## 7) LLM/Prompt Editing Guidance

Prompt functions live in backend-fastapi/app/services/interview/prompts.py.

When editing prompts:

1. Keep explicit output-format instructions.
2. Keep anti-hallucination constraints for resume-grounded questions.
3. Keep duplicate-avoidance rules against previous_questions.
4. Keep feedback tone and readiness-band constraints aligned with schema.
5. Never add fields in prompt output without updating schemas and frontend consumer.

If switching model or temperature, do it in backend-fastapi/app/agents/llm_config.py and document side effects.

---

## 7.1) Feedback Fallback Behavior (Must Preserve)

The feedback flow has layered recovery and deterministic fallback behavior:

1. Structured output path via FeedbackOutput schema.
2. Recovery path from parsing/tool payload errors.
3. Raw JSON extraction fallback from LLM text content.
4. Deterministic feedback fallback if all parsing paths fail.
5. Early deterministic "severe low-signal" feedback when answered == 0 or low_signal_ratio >= 0.60.

Do not remove these paths unless replacing them with equivalent reliability guarantees.

---

## 8) Safe Change Procedure (Use This Every Time)

1. Define exact goal in one sentence.
2. List files to change and why.
3. Preserve API contract unless this is a versioned API change.
4. Update backend logic first, then frontend integration.
5. Add/update tests for changed behavior.
6. Run targeted tests and sanity-check endpoints.
7. Verify no regressions in easy/medium/hard flows.
8. Confirm fallback path still works with malformed LLM output.

---

## 9) AI Prompt Template for Making Changes

Copy this template into any AI coding tool:

"""
Task: <one precise change>

Project context:
- Backend: FastAPI + LangGraph interview workflow
- Frontend: React mock interview UI
- Primary files:
  - backend-fastapi/app/api/routes_interview.py
  - backend-fastapi/app/agents/interview/nodes.py
  - backend-fastapi/app/services/interview/prompts.py
  - backend-fastapi/app/services/interview/schemas.py
  - backend-fastapi/app/services/interview/fallbacks.py
  - frontend-react/src/components/MockInterview.js

Hard constraints:
1) Keep authentication + authorization checks intact.
2) Keep question counts valid per difficulty (easy=5, medium=10, hard=15) unless explicitly changing spec.
3) Keep feedback output compatible with FeedbackOutput schema.
4) Keep fallback behavior for partial/failed LLM output.
5) Keep API response backwards-compatible unless I explicitly ask for a breaking change.

Required output from you:
1) Exact files changed
2) Patch-style explanation per file
3) Contract changes (if any)
4) Test updates and commands to run
5) Risk notes and rollback steps
"""

---

## 10) Change Scenarios and Where to Edit

### A) Change number/distribution of questions
Edit:
- backend-fastapi/app/agents/interview/nodes.py
- backend-fastapi/app/services/interview/fallbacks.py
- backend-fastapi/app/api/routes_interview.py
- frontend-react/src/components/MockInterview.js

### B) Improve question quality/tone
Edit:
- backend-fastapi/app/services/interview/prompts.py
- optionally backend-fastapi/app/services/interview/schemas.py (only if output format changes)

### C) Add new feedback metric
Edit:
- backend-fastapi/app/services/interview/schemas.py
- backend-fastapi/app/agents/interview/nodes.py
- backend-fastapi/app/services/interview/transcript.py (if metric is transcript-derived)
- frontend-react/src/components/MockInterview.js and visualization components

### D) Improve reliability when model output is bad
Edit:
- backend-fastapi/app/services/interview/recovery.py
- backend-fastapi/app/services/interview/fallbacks.py
- backend-fastapi/app/agents/interview/nodes.py

### E) Switch LLM model
Edit:
- backend-fastapi/app/agents/llm_config.py
- validate prompt compatibility in prompts.py and schema handling in nodes.py

---

## 11) Minimum Test Checklist After Any Interview-Agent Change

Backend:
1. generate-questions returns valid count for each difficulty.
2. duplicate-question avoidance works when previous_questions is provided.
3. fallback fills missing questions when model output is partial.
4. generate-feedback rejects mismatched question/answer lengths.
5. generate-feedback returns schema-compatible feedback JSON.

Frontend:
1. start interview sends target_role + difficulty.
2. submit feedback sends aligned questions and answers.
3. UI handles error messages and loading states.
4. stage/time visualizations render with returned feedback payload.
5. interview API base URL is environment-safe (current code uses hardcoded localhost URLs and should be preserved carefully or migrated deliberately).

---

## 12) Definition of Done for AI-Assisted Changes

A change is complete only if:

1. Required files are updated consistently across backend + frontend.
2. API contract impact is explicitly documented.
3. Happy path and fallback path both verified.
4. Tests are updated or justified if not added.
5. No unhandled exceptions introduced in routes or workflow nodes.

---

## 13) Common Failure Modes to Watch

1. Changing schema fields without updating frontend consumers.
2. Updating difficulty counts in one file but not others.
3. Weak prompt constraints causing fabricated resume details.
4. Removing fallback logic and causing hard failures on malformed LLM output.
5. Breaking auth flow by bypassing user_id validation.

---

## 14) Quick Commands (Manual Validation)

Backend:
- cd backend-fastapi
- uvicorn app.main:app --reload

Frontend:
- cd frontend-react
- npm start

Targeted test:
- cd backend-fastapi
- python -m pytest tests/test_interview_fallbacks.py -q

---

## 15) Suggested Versioning Note (When You Make Changes)

When you modify the interview agent, append a short changelog entry to this file:

- Date
- Goal
- Files changed
- Contract impact (none/minor/breaking)
- Validation performed

This makes future AI-assisted changes safer and faster.
