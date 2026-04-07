# Mock Interview Agent Overview

## 1) What the feature does

The Mock Interview Agent runs an interview simulation tailored to a user profile and target role.

It currently provides:
- Resume-aware question generation using difficulty levels (easy, medium, hard)
- Structured interview flow (question list -> user answers -> feedback report)
- JSON feedback with readiness, stage performance, action plan, and per-question breakdown
- Duplicate-question avoidance using prior session questions for the same user and role
- Fallback behavior when LLM structured output fails or responses are low-signal


## 2) Why it exists

This feature exists to help users practice interviews with realistic, resume-grounded questions and receive actionable feedback before real interviews.

Primary goals:
- Improve interview readiness through guided repetition
- Surface skill communication gaps (technical depth, clarity, confidence)
- Give personalized next steps instead of generic interview tips
- Track historical sessions through persisted interview records


## 3) Where it fits in the system

The Mock Interview Agent sits at the intersection of:
- Frontend UI experience: interview setup, recording/typing responses, feedback visualization
- Backend orchestration: question workflow and feedback workflow via LangGraph
- Shared infrastructure: Supabase auth + resume/session data

Main integration path:
1. Frontend component starts interview and calls backend endpoints.
2. Backend route validates auth and user ownership.
3. Question generation workflow prepares resume context and builds question set.
4. Frontend collects answers and submits full interview data.
5. Feedback workflow builds transcript metrics and returns structured feedback JSON.
6. Session data is persisted in interview_sessions when DB operations succeed.


## 4) Inputs and outputs

### Inputs

Question generation endpoint input:
- user_id (required)
- target_role (required)
- difficulty: easy | medium | hard (optional, default medium)
- resume_id (optional, currently not used in route logic)
- Authorization: Bearer access token (required)

Feedback generation endpoint input:
- user_id (required)
- target_role (required)
- questions[] (required)
- answers[] (required)
- resume_text (optional)
- Authorization: Bearer access token (required)

### Outputs

Question generation output:
- success
- questions[]: [{ id, category, question }]
- session_id (nullable)
- resume_filename

Feedback generation output:
- success
- feedback (JSON object)
- timestamp

Feedback object shape (current):
- executive_summary
- overall_readiness
- quantitative_metrics { verbosity, confidence_tone, keyword_hit_rate }
- stage_performance { resume_validation, project_deep_dive, core_technical, behavioral }
- action_plan { stop_doing[], start_doing[], study_focus[], next_steps[] }
- question_breakdown[] { question, user_answer_summary, improvement_needed, ideal_golden_answer }


## 5) Rules and constraints

Functional constraints:
- Auth is mandatory for all interview routes.
- user_id in request must match authenticated token user.
- Feedback generation requires len(questions) == len(answers).
- Accepted interview lengths are strictly 5, 10, or 15.
- Difficulty maps to expected totals:
  - easy = 5
  - medium = 10
  - hard = 15

Question quality and safety constraints:
- Questions should be grounded in resume context and target role.
- Prompt rules discourage hallucinated project details.
- Duplicate questions are filtered (normalized text) and previous questions are considered.

Reliability constraints:
- DB write failures should not crash successful generation responses.
- Feedback generation uses layered fallback:
  1) structured output
  2) recovery from malformed payloads
  3) raw JSON extraction
  4) deterministic fallback report
- Severe low-signal responses trigger deterministic critical feedback path.


## 6) Example behavior

Example scenario:
1. User chooses target role "Full Stack Developer" and difficulty "medium".
2. Frontend requests questions.
3. Backend loads latest resume content, extracts resume sections, and generates 10 questions.
4. User answers all questions (voice or text).
5. Frontend submits questions + answers.
6. Backend builds transcript metrics (answered count, skipped count, low-signal ratio).
7. LLM attempts structured feedback generation.
8. If schema-valid response is returned, it is sent to frontend and stored in session analysis.
9. If model output is malformed, fallback logic still returns usable feedback JSON.

Expected user-visible result:
- A complete feedback dashboard appears even when the model response format is imperfect.


## 7) Current errors/problems faced by it

These are current implementation/operational pain points to be aware of:

1. Hardcoded backend URLs in frontend interview component
- Interview API calls use localhost URLs directly.
- Risk: non-local environments break unless manually changed.

2. resume_id is accepted but not used in generation route logic
- Can cause confusion for clients expecting resume selection behavior.

3. Strict question-count validation in feedback route
- Only 5/10/15 are accepted; any mismatch causes request failure.
- Useful for consistency, but brittle for experimental/custom interview lengths.

4. Dependency on resume data availability
- If no resume is found, question generation fails with 404.
- No alternate no-resume interview mode currently defined.

5. Browser and voice API dependency on frontend
- Speech recognition support varies by browser.
- Voice capture issues can degrade experience if user permissions fail.

6. LLM output-format instability
- Structured output may fail intermittently depending on provider behavior.
- Fallbacks reduce impact, but quality/detail can degrade in deterministic mode.

7. Prior-question dedupe scope is limited
- Deduping uses latest session for same user + same target role.
- It may still allow repeats across older sessions or across different role labels.


## 8) Summary

The Mock Interview Agent is production-oriented for guided practice and resilient to many model-output failures, but still has practical gaps around environment configuration, optional input handling, and cross-session dedupe breadth.

For roadmap improvements, the highest-impact items are:
1. Replace hardcoded frontend URLs with environment-based config.
2. Implement real resume_id selection behavior (or remove the field from contract).
3. Add optional no-resume onboarding fallback interview mode.
4. Expand dedupe strategy beyond latest same-role session.
