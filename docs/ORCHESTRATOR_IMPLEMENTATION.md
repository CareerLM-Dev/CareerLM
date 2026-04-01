# Orchestrator Implementation Summary

## What's Been Built

### 1. **Central State Object** (`CareerLMState`)
- **File**: [app/agents/orchestrator/state.py](app/agents/orchestrator/state.py)
- Single unified state that flows through all agents
- Contains: user profile, active job, resume analysis results, interview prep, cold email, study plan, human-in-loop state
- Full state gets checkpointed after every node
- One thread per user_id (session persistence)

### 2. **Supervisor Orchestrator Node**
- **File**: [app/agents/orchestrator/nodes.py](app/agents/orchestrator/nodes.py)
- The brain of the system
- Decides which specialist runs next based on:
  - Whether resume exists
  - Resume score level
  - Interview deadline
  - User status (actively_applying, building_skills, exploring)
  - Weak bullets identified
  - Skill gaps
- Routing is explicit and auditable (decision and reason logged in state.supervisor_decision)

### 3. **Supabase Checkpointer**
- **File**: [app/agents/orchestrator/checkpointer.py](app/agents/orchestrator/checkpointer.py)
- Custom checkpoint saver implementing LangGraph's checkpoint interface
- Persists full state to `graph_checkpoints` table after every node
- Supports:
  - **Session persistence**: Load latest checkpoint on next session
  - **Time travel**: Retrieve any past checkpoint and resume from there
  - **Score history**: All past scores exist in different checkpoints
- Schema required in Supabase:
  ```sql
  CREATE TABLE graph_checkpoints (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    thread_id TEXT NOT NULL,
    checkpoint_id TEXT NOT NULL,
    parent_checkpoint_id TEXT,
    node_name TEXT,
    state JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(thread_id, checkpoint_id)
  );
  CREATE INDEX ON graph_checkpoints(thread_id, created_at DESC);
  ```

### 4. **Resume Analysis Wrapper Node**
- **File**: [app/agents/orchestrator/resume_wrapper.py](app/agents/orchestrator/resume_wrapper.py)
- Bridges orchestrator state with existing resume_workflow
- Extracts only what resume analysis needs (resume_text, job_description, role_type)
- Calls existing resume_workflow.ainvoke()
- Maps results back into CareerLMState.resume_analysis
- Marks `resume_analysis_complete = True`
- Handles async execution

### 5. **Profile Update Node** ⭐
- **File**: [app/agents/orchestrator/profile_update.py](app/agents/orchestrator/profile_update.py)
- Runs immediately after resume analysis completes
- **Score Delta Calculation** (the key motivational feature):
  - Gets new score from resume analysis
  - Compares to previous score in score_history
  - Computes delta (e.g., 55 → 71 = +16)
  - Adds new entry to score_history with timestamp
- Merges new skills found into confirmed_skills
- Merges gaps into known_gaps
- Updates best_score_ever
- This passively builds the user profile without any extra work

### 6. **Main Orchestrator Graph**
- **File**: [app/agents/orchestrator/graph.py](app/agents/orchestrator/graph.py)
- Supervisor at center
- Routes based on supervisor's decision
- Current flow: `supervisor → resume_analysis_wrapper → profile_update → supervisor → [next specialist]`
- Compiles with SupabaseCheckpointer (checkpoints after every node)
- Placeholder nodes for other specialists (to be filled in)

### 7. **Orchestrator API Endpoints**
- **File**: [app/api/routes_orchestrator.py](app/api/routes_orchestrator.py)
- `POST /api/v1/orchestrator/analyze-resume` — Main entry point
  - Upload resume + job info
  - Initializes CareerLMState
  - Invokes orchestrator graph
  - Returns state (may be paused waiting for user input)
- `GET /api/v1/orchestrator/state/{user_id}` — Retrieve user state (debugging)

### 8. **Test Script**
- **File**: [test_orchestrator.py](test_orchestrator.py)
- Demonstrates full flow: upload → analyze → profile_update → score_delta
- Verifies checkpointing works
- Run with: `python test_orchestrator.py`

---

## The Flow (First Resume Upload)

```
Frontend: POST /api/v1/orchestrator/analyze-resume
  ↓ (resume_text + job_description)
[API] Initialize CareerLMState for user
  ↓
[SUPERVISOR] Sees has_resume=true, resume_analysis_complete=false
  → Decide: "resume_analysis"
  ↓
[RESUME_ANALYSIS_WRAPPER]
  → Extract {resume_text, job_description, role_type}
  → Call resume_workflow.ainvoke()
  → Map results → state.resume_analysis
  → (CHECKPOINT #1: State with analysis results)
  ↓
[PROFILE_UPDATE]
  → Get new_score from resume_analysis
  → Compare to score_history (empty first time)
  → Add score_history[0] = {score: 72, delta: None, timestamp}
  → Update best_score_ever = 72
  → Merge skills, gaps
  → (CHECKPOINT #2: State with updated profile)
  ↓
[SUPERVISOR] Sees resume_analysis_complete=true, score=72, status="actively_applying"
  → Decide: "cold_email" (or "interview_prep" if interview soon)
  ↓
[PLACEHOLDER cold_email node]
  → (Will be implemented next)
  ↓
Frontend receives: {
  current_phase: "cold_email",
  resume_score: 72,
  score_delta: null,  # First upload
  profile: {
    score_history: [{score: 72, delta: null, ...}],
    best_score_ever: 72,
    confirmed_skills: [...],
    known_gaps: [...],
  },
  messages: [...]
}
```

---

## The Flow (Second Resume Upload — Score Delta Demonstration)

```
Same user uploads a different resume 2 weeks later
  ↓
[RESUME_ANALYSIS_WRAPPER]
  → Analyzes new resume
  → New score: 81
  ↓
[PROFILE_UPDATE]
  → Reads score_history[0] = {score: 72}
  → Calculates delta = 81 - 72 = +9
  → Adds score_history[1] = {score: 81, delta: +9, timestamp}
  → Updates best_score_ever = 81
  ↓
Frontend receives: {
  current_phase: "...",
  resume_score: 81,
  score_delta: 9,  # ⭐ VISIBLE PROOF OF IMPROVEMENT
  profile: {
    score_history: [
      {score: 72, delta: null, ...},
      {score: 81, delta: 9, ...}  # ← Shows progress
    ],
    best_score_ever: 81,
  }
}
```

This is what creates **sustainable re-engagement** — the user can literally see they improved.

---

## What Happens When You Create the `graph_checkpoints` Table

1. After first resume analysis, checkpointer.put() is called
   - Full state is serialized to JSON
   - Inserted into graph_checkpoints with thread_id = user_id
2. Next session: checkpointer.get() is called
   - Fetches latest checkpoint for user_id
   - Restores full state
   - User's work is not lost
3. **Time travel becomes free**: Can load any past checkpoint and re-run from there with different inputs
   - User adds job description 2 days later → re-run from resume_parsed checkpoint
   - All versions exist simultaneously
---

## Next Phases (in order)

1. **Cold Email Wrapper** — Similar to resume_wrapper, but calls cold_email_workflow
2. **Interview Prep Wrapper**
3. **Study Plan Wrapper**
4. **Human-in-Loop (Bullet Rewrite)** — Complex state management for pause/resume with user input
5. **RAG Integration** — Populate job_postings, wire into resume analysis
6. **Tavily Integration** — Live company/role research for cold email and interview prep
7. **Dashboard Redesign** — Build UI around new routing and profile data
8. **Streaming** — Push real-time status updates to frontend

---

## Key Design Decisions

1. **Checkpointing happens automatically** — LangGraph calls put() after every node. No manual save logic needed.
2. **Profile builds passively** — No extra work from user. Every interaction updates score_history, skills, gaps.
3. **Supervisor is reusable** — Same supervisor, same routing rules, but behavior changes based on state (user status, score, deadline).
4. **State is the single source of truth** — No separate state objects for different modules (wrappers handle the bridging).
5. **Token efficiency** — Each specialist only sees what it needs (extracted context), not the full 10k+ token state.
6. **Transparency** — supervisor_decision explains why each routing choice was made (auditable).

---


## Files Created

- `/app/agents/orchestrator/state.py` — CareerLMState definition
- `/app/agents/orchestrator/nodes.py` — supervisor_node
- `/app/agents/orchestrator/resume_wrapper.py` — resume_analysis_wrapper_node
- `/app/agents/orchestrator/profile_update.py` — profile_update_node
- `/app/agents/orchestrator/checkpointer.py` — SupabaseCheckpointer
- `/app/agents/orchestrator/graph.py` — Main orchestrator graph
- `/app/agents/orchestrator/__init__.py` — Exports
- `/app/api/routes_orchestrator.py` — API endpoints
- `/test_orchestrator.py` — Test script
- Updated `/app/main.py` — Registered orchestrator routes
