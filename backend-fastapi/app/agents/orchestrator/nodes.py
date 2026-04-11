"""
Supervisor orchestrator node — Dynamic Recommendation Engine.

Instead of forcing a rigid single-path flow, the supervisor reads the user's
current track (status) and computes a primary recommendation + parallel
secondary options. It then YIELDS control back to the user rather than
looping back into a specialist node automatically.

Track Flows:
  APPLYING:
    Primary:   tailor_resume (paste JD, optimize resume for it)
    Secondary: cold_email, mock_interview, skill_gap
    Loop:      After each JD match → cold_email → "ready for next application"
  
  BUILDING:
    Primary:   skill_gap (discover what to learn)
    Secondary: study_plan, resume_optimizer
    Loop:      After skill gap → study_plan → "continue building"
  
  EXPLORING:
    Primary:   skill_gap (find career matches)
    Secondary: resume_optimizer, study_plan
    Loop:      After exploration → "update target role?"
  
  INTERVIEW_UPCOMING:
    Primary:   mock_interview
    Secondary: resume_optimizer (if score <75), study_plan
    Loop:      After practice → "practice again or review resume"

Infinite Loop Prevention:
  - Each node type has a run counter in state (resume_analysis_runs, etc.)
  - Supervisor checks counter before routing to a node
  - Hard cap: MAX_RUNS_PER_NODE = 1 for automated nodes (user re-triggers manually)
  - After cap is reached, supervisor yields to recommendations rather than re-running
"""

from datetime import datetime
from app.agents.orchestrator.state import CareerLMState, TrackRecommendations, RecommendedAction

# Hard cap: automated nodes should not run more than once per session automatically.
# User can always manually re-trigger via the frontend.
MAX_AUTO_RUNS = 1


def _make_action(action_id: str, label: str, description: str, page: str,
                 priority: str, estimated_time: str, track: str) -> RecommendedAction:
    return {
        "action_id": action_id,
        "label": label,
        "description": description,
        "page": page,
        "priority": priority,
        "estimated_time": estimated_time,
        "track": track,
    }


def _compute_applying_recommendations(state: CareerLMState) -> TrackRecommendations:
    """
    Applying track: primary goal is tailoring resume to JDs and sending cold emails.
    Mock interviews are a parallel activity.
    """
    resume_analysis = state.get("resume_analysis", {}) or {}
    resume_score = resume_analysis.get("overall_score")
    has_resume = bool(resume_analysis.get("resume_text"))
    resume_analysis_complete = state.get("resume_analysis_complete", False)

    # Step 0: No resume yet — getting started is the only thing
    if not has_resume or not resume_analysis_complete:
        return {
            "track": "applying",
            "primary": _make_action(
                "upload_resume", "Upload Your Resume",
                "Let's establish your baseline before we tailor it to specific jobs.",
                "resume_optimizer", "primary", "2 min", "applying"
            ),
            "secondary": [],
            "reasoning": "Before tailoring your resume to job descriptions, we need your base resume on file.",
            "loop_key": "resume_ready",
            "computed_at": datetime.now().isoformat(),
        }

    # Step 1: Resume score is critical — fix basics first
    if resume_score is not None and resume_score < 45 and not state.get("fix_resume_complete"):
        return {
            "track": "applying",
            "primary": _make_action(
                "fix_resume", "Fix Critical Resume Issues",
                f"Your resume scored {resume_score}/100. Fix the critical issues before applying — employers often filter by ATS score.",
                "resume_optimizer", "primary", "10 min", "applying"
            ),
            "secondary": [
                _make_action("mock_interview", "Practice Interviews Anyway",
                             "Start preparing for interviews while refining your resume.",
                             "mock_interview", "secondary", "15 min", "applying"),
            ],
            "reasoning": f"Resume score {resume_score}/100 is below the typical ATS threshold (45). Fixing critical issues before applying maximizes your chances.",
            "loop_key": "resume_fixed",
            "computed_at": datetime.now().isoformat(),
        }

    # Step 2: Resume is ready — start the JD matching loop
    return {
        "track": "applying",
        "primary": _make_action(
            "tailor_resume", "Tailor Resume to a Job",
            "Paste a job description to get a version of your resume optimized specifically for that role.",
            "resume_optimizer", "primary", "5 min", "applying"
        ),
        "secondary": [
            _make_action("cold_email", "Draft a Cold Email",
                         "Write a targeted outreach email for a company or recruiter.",
                         "cold_email", "secondary", "5 min", "applying"),
            _make_action("mock_interview", "Practice Mock Interview",
                         "Practice interview questions for your target role while waiting to hear back.",
                         "mock_interview", "secondary", "15 min", "applying"),
            _make_action("skill_gap", "Discover Skill Gaps",
                         "Find out what skills are most in-demand for your target role.",
                         "skill_gap", "secondary", "10 min", "applying"),
        ],
        "reasoning": "Your resume is ready. The highest-value activity is tailoring it to specific jobs and sending targeted outreach.",
        "loop_key": "next_application",
        "computed_at": datetime.now().isoformat(),
    }


def _compute_building_recommendations(state: CareerLMState) -> TrackRecommendations:
    """Building track: primary goal is identifying skill gaps and learning."""
    resume_analysis = state.get("resume_analysis", {}) or {}
    has_resume = bool(resume_analysis.get("resume_text"))
    resume_analysis_complete = state.get("resume_analysis_complete", False)
    skill_gap_complete = state.get("skill_gap_complete", False)

    if not has_resume or not resume_analysis_complete:
        return {
            "track": "building",
            "primary": _make_action(
                "upload_resume", "Upload Your Resume",
                "Start by uploading your resume so we can identify exactly what skills you already have.",
                "resume_optimizer", "primary", "2 min", "building"
            ),
            "secondary": [],
            "reasoning": "We need your resume to accurately identify skill gaps against your target role.",
            "loop_key": "resume_ready",
            "computed_at": datetime.now().isoformat(),
        }

    if not skill_gap_complete:
        return {
            "track": "building",
            "primary": _make_action(
                "skill_gap", "Analyze Your Skill Gaps",
                "Discover which skills you already have and which ones are holding you back.",
                "skill_gap", "primary", "10 min", "building"
            ),
            "secondary": [
                _make_action("resume_optimizer", "Review Resume",
                             "Check your resume score and see what areas need improvement.",
                             "resume_optimizer", "secondary", "5 min", "building"),
            ],
            "reasoning": "Understanding your skill gaps is the foundation of any effective learning plan.",
            "loop_key": "gaps_identified",
            "computed_at": datetime.now().isoformat(),
        }

    return {
        "track": "building",
        "primary": _make_action(
            "study_plan", "Build Your Learning Plan",
            "Create a personalized study plan based on your identified skill gaps.",
            "study_planner", "primary", "15 min", "building"
        ),
        "secondary": [
            _make_action("skill_gap", "Re-analyze Skills",
                         "Run another skill gap analysis with a different target role in mind.",
                         "skill_gap", "secondary", "10 min", "building"),
            _make_action("resume_optimizer", "Improve Resume",
                         "Add newly learned skills to your resume.",
                         "resume_optimizer", "secondary", "5 min", "building"),
        ],
        "reasoning": "Skill gaps identified. A personalized study plan will give you a structured path forward.",
        "loop_key": "continue_building",
        "computed_at": datetime.now().isoformat(),
    }


def _compute_exploring_recommendations(state: CareerLMState) -> TrackRecommendations:
    """Exploring track: help user discover career paths that match their skills."""
    resume_analysis = state.get("resume_analysis", {}) or {}
    has_resume = bool(resume_analysis.get("resume_text"))
    resume_analysis_complete = state.get("resume_analysis_complete", False)
    skill_gap_complete = state.get("skill_gap_complete", False)

    if not has_resume or not resume_analysis_complete:
        return {
            "track": "exploring",
            "primary": _make_action(
                "upload_resume", "Upload Your Resume",
                "Upload your resume and we'll show you which career paths are the best fit for your current skills.",
                "resume_optimizer", "primary", "2 min", "exploring"
            ),
            "secondary": [],
            "reasoning": "We need your resume to map your skills to career opportunities.",
            "loop_key": "resume_ready",
            "computed_at": datetime.now().isoformat(),
        }

    if not skill_gap_complete:
        return {
            "track": "exploring",
            "primary": _make_action(
                "skill_gap", "Discover Career Matches",
                "Find out which roles your current skills are most aligned with, and what the gaps look like for each.",
                "skill_gap", "primary", "10 min", "exploring"
            ),
            "secondary": [
                _make_action("resume_optimizer", "Review Resume Score",
                             "See how your resume scores overall before exploring career paths.",
                             "resume_optimizer", "secondary", "5 min", "exploring"),
            ],
            "reasoning": "Career exploration starts with understanding where your skills already place you.",
            "loop_key": "paths_discovered",
            "computed_at": datetime.now().isoformat(),
        }

    return {
        "track": "exploring",
        "primary": _make_action(
            "skill_gap", "Explore a Different Role",
            "Try analyzing against a different target role to compare how well you'd fit.",
            "skill_gap", "primary", "10 min", "exploring"
        ),
        "secondary": [
            _make_action("study_plan", "Build Skills for a Target Role",
                         "Once you've picked a direction, create a study plan to close the gaps.",
                         "study_planner", "secondary", "15 min", "exploring"),
            _make_action("resume_optimizer", "Optimize Resume",
                         "Improve your resume once you've identified a target role.",
                         "resume_optimizer", "secondary", "5 min", "exploring"),
            _make_action("cold_email", "Reach out to Professionals",
                         "Connect with people in roles you're interested in exploring.",
                         "cold_email", "secondary", "5 min", "exploring"),
        ],
        "reasoning": "You've started exploring. Try different roles to find where you want to focus.",
        "loop_key": "continue_exploring",
        "computed_at": datetime.now().isoformat(),
    }


def _compute_interview_recommendations(state: CareerLMState) -> TrackRecommendations:
    """Interview upcoming track: urgency on prep, resume polish is secondary."""
    resume_analysis = state.get("resume_analysis", {}) or {}
    resume_score = resume_analysis.get("overall_score")
    has_resume = bool(resume_analysis.get("resume_text"))
    resume_analysis_complete = state.get("resume_analysis_complete", False)

    if not has_resume or not resume_analysis_complete:
        return {
            "track": "interview_upcoming",
            "primary": _make_action(
                "upload_resume", "Upload Resume First",
                "Upload your resume so we can tailor your interview prep to the exact role.",
                "resume_optimizer", "primary", "2 min", "interview_upcoming"
            ),
            "secondary": [],
            "reasoning": "Even with an interview coming up fast, starting with your resume helps us ask the right practice questions.",
            "loop_key": "prep_started",
            "computed_at": datetime.now().isoformat(),
        }

    secondary = [
        _make_action("study_plan", "Review Key Topics",
                     "Generate a quick study checklist for topics likely to come up in your interview.",
                     "study_planner", "secondary", "10 min", "interview_upcoming"),
    ]

    # If resume is poor, add it as a secondary recommendation
    if resume_score is not None and resume_score < 75:
        secondary.insert(0, _make_action(
            "resume_optimizer", f"Improve Resume (Score: {resume_score})",
            "Your resume score could be higher. A strong resume improves your confidence walking into the interview.",
            "resume_optimizer", "secondary", "10 min", "interview_upcoming"
        ))

    return {
        "track": "interview_upcoming",
        "primary": _make_action(
            "mock_interview", "Start Mock Interview",
            "Practice with AI-generated interview questions specific to your role. Repetition builds confidence.",
            "mock_interview", "primary", "15 min", "interview_upcoming"
        ),
        "secondary": secondary,
        "reasoning": "Interview coming up — mock practice is the highest-leverage activity right now. The more you practice, the better you'll perform.",
        "loop_key": "practice_again",
        "computed_at": datetime.now().isoformat(),
    }


def supervisor_node(state: CareerLMState) -> CareerLMState:
    """
    Central orchestrator decision node — Recommendation Engine.

    Reads the full state, evaluates what track the user is on and what
    work has been completed, and computes dynamic recommendations.

    DOES NOT force users into a single path. After computing recommendations,
    it sets current_phase to 'ready_for_next_action' and yields back to the
    human (via the frontend Floating Helper).

    Infinite loop prevention:
    - Checks run counters before routing to any automated node.
    - Only one automated trigger per node per session (user re-triggers manually).
    """
    print("[SUPERVISOR] Entered supervisor_node")

    if "messages" not in state or state["messages"] is None:
        state["messages"] = []

    messages = state["messages"]

    # ── Cancellation check ──────────────────────────────────────────────────
    user_id = state.get("profile", {}).get("user_id")
    if user_id:
        try:
            from supabase_client import supabase
            result = supabase.table("user").select("analysis_cancelled").eq("id", user_id).execute()
            if result.data and result.data[0].get("analysis_cancelled"):
                print(f"[SUPERVISOR] Cancellation detected for user {user_id}")
                state["current_phase"] = "ready_for_next_action"
                messages.append("[SUPERVISOR] Analysis cancelled by user request.")
                supabase.table("user").update({"analysis_cancelled": False}).eq("id", user_id).execute()
                state["messages"] = messages
                return state
        except Exception as e:
            print(f"[SUPERVISOR] Error checking cancellation: {e}")

    profile = state.get("profile", {}) or {}
    resume_analysis = state.get("resume_analysis", {}) or {}
    user_status = profile.get("status", "exploring")
    has_resume = bool(resume_analysis.get("resume_text"))
    resume_analysis_complete = state.get("resume_analysis_complete", False)

    print(f"[SUPERVISOR] track={user_status}, has_resume={has_resume}, analysis_complete={resume_analysis_complete}")

    # ── Auto-trigger resume analysis exactly once ───────────────────────────
    # If resume is present but not yet analyzed, and we haven't run analysis yet,
    # trigger it automatically. Cap at MAX_AUTO_RUNS to prevent infinite loops.
    analysis_runs = state.get("resume_analysis_runs", 0)
    if has_resume and not resume_analysis_complete and not state.get("resume_analysis_failed"):
        if analysis_runs < MAX_AUTO_RUNS:
            state["current_phase"] = "resume_analysis"
            messages.append("[SUPERVISOR] Auto-triggering resume analysis (first time).")
            print("[SUPERVISOR] Decision: resume_analysis (auto, first run)")
            state["messages"] = messages
            return state
        else:
            # Already ran once — don't loop. Fall through to recommendations.
            messages.append("[SUPERVISOR] Resume analysis already ran once. Skipping auto-trigger.")

    # ── Compute track-specific recommendations ──────────────────────────────
    if user_status == "applying":
        recommendations = _compute_applying_recommendations(state)
    elif user_status == "building":
        recommendations = _compute_building_recommendations(state)
    elif user_status == "interview_upcoming":
        recommendations = _compute_interview_recommendations(state)
    else:
        # Default: exploring
        recommendations = _compute_exploring_recommendations(state)

    state["recommendations"] = recommendations
    state["current_phase"] = "ready_for_next_action"

    messages.append(
        f"[SUPERVISOR] Track={user_status} | "
        f"Primary={recommendations['primary']['action_id']} | "
        f"Secondaries={[a['action_id'] for a in recommendations.get('secondary', [])]}"
    )
    print(f"[SUPERVISOR] Recommendations computed. Phase → ready_for_next_action")

    state["messages"] = messages
    return state