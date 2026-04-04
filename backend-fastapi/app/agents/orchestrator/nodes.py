"""
Supervisor orchestrator node.

The brain of the system. Sees the full user context and decides which
specialist to call next based on what work is complete, user status,
onboarding answers, and what makes sense right now.

Routing rules:
1. If no resume uploaded → send to resume analysis
2. If resume score is low (< 50) → fix resume before anything else
3. If interview is within 7 days → prioritize interview prep
4. If actively applying → cold email + interview prep
5. If exploring/building skills → study plan for gaps
6. If weak bullets identified → offer bullet rewrite (human-in-loop)

The supervisor doesn't do work itself. It decides, directs, and re-evaluates.
"""

from datetime import datetime
from app.agents.orchestrator.state import CareerLMState


def supervisor_node(state: CareerLMState) -> CareerLMState:
    """
    Central orchestrator decision node.

    Reads the full state, evaluates what's been done,
    and decides which specialist should run next.

    Returns updated state with:
    - current_phase: next specialist to run
    - supervisor_decision: explanation for the choice
    """
    print("[SUPERVISOR] Entered supervisor_node")

    # Initialize messages if not present
    if "messages" not in state or state["messages"] is None:
        state["messages"] = []

    # Check for cancellation flag
    user_id = state.get("profile", {}).get("user_id")
    if user_id:
        try:
            from supabase_client import supabase
            result = supabase.table("user").select("analysis_cancelled").eq("id", user_id).execute()
            if result.data and result.data[0].get("analysis_cancelled"):
                print(f"[SUPERVISOR] Cancellation detected for user {user_id}")
                state["current_phase"] = "idle"
                state["supervisor_decision"] = "Analysis cancelled by user."
                state["messages"].append("[SUPERVISOR] Analysis cancelled by user request.")
                # Clear the cancellation flag
                supabase.table("user").update({"analysis_cancelled": False}).eq("id", user_id).execute()
                return state
        except Exception as e:
            print(f"[SUPERVISOR] Error checking cancellation: {e}")

    print("[SUPERVISOR] Reading state fields...")

    profile         = state.get("profile", {})
    resume_analysis = state.get("resume_analysis", {})

    user_status    = profile.get("status")
    interview_date = profile.get("active_interview_date")
    resume_score   = resume_analysis.get("overall_score")
    has_resume     = bool(resume_analysis.get("resume_text"))

    print(f"[SUPERVISOR] has_resume={has_resume}")
    print(f"[SUPERVISOR] resume_score={resume_score}")
    print(f"[SUPERVISOR] user_status={user_status}")
    print(f"[SUPERVISOR] resume_analysis_complete={state.get('resume_analysis_complete')}")
    print(f"[SUPERVISOR] resume_analysis_failed={state.get('resume_analysis_failed')}")

    # ===== DECIDE NEXT PHASE =====

    # Rule 1: No resume yet → demand resume
    if not has_resume:
        state["current_phase"]       = "upload_resume"
        state["supervisor_decision"] = "No resume uploaded yet. User must upload to begin."
        state["messages"].append("[SUPERVISOR] Directing to: upload_resume")
        print("[SUPERVISOR] Decision: upload_resume")
        return state

    # Rule 1b: Resume exists but not analyzed yet → analyze it
    if state.get("resume_analysis_failed"):
        state["current_phase"] = "idle"
        state["supervisor_decision"] = (
            "Resume analysis failed. Waiting for user action or system fix."
        )
        state["messages"].append("[SUPERVISOR] Resume analysis failed. Going idle.")
        print("[SUPERVISOR] Decision: idle (resume_analysis_failed)")
        return state

    # Rule 1b: Resume exists but not analyzed yet → analyze it
    if has_resume and not state.get("resume_analysis_complete"):
        state["current_phase"]       = "resume_analysis"
        state["supervisor_decision"] = "Resume uploaded. Running analysis."
        state["messages"].append("[SUPERVISOR] Directing to: resume_analysis")
        print("[SUPERVISOR] Decision: resume_analysis")
        return state

    # Rule 2: Resume score is critical (< 50) → focus on fixes
    if resume_score is not None and resume_score < 50 and not state.get("fix_resume_complete"):
        state["current_phase"]       = "fix_resume"
        state["supervisor_decision"] = (
            f"Resume score is {resume_score}/100 (critical). "
            "Prioritizing structure and completeness fixes before other work."
        )
        state["messages"].append("[SUPERVISOR] Directing to: fix_resume (score too low)")
        print(f"[SUPERVISOR] Decision: fix_resume (score={resume_score})")
        return state

    # Rule 3: Interview within 7 days → prep comes first
    if interview_date:
        days_to_interview = (interview_date - datetime.now()).days
        if 0 <= days_to_interview <= 7:
            state["current_phase"]       = "interview_prep"
            state["supervisor_decision"] = (
                f"Interview in {days_to_interview} days. "
                "Prioritizing interview preparation."
            )
            state["messages"].append("[SUPERVISOR] Directing to: interview_prep (interview soon)")
            print(f"[SUPERVISOR] Decision: interview_prep (days={days_to_interview})")
            return state

    # Rule 4: Route based on user status (4-way flow)
    # Statuses from onboarding: "exploring" | "applying" | "building" | "interview_upcoming"
    
    # APPLYING: resume + interview prep + cold email + skill gap
    if user_status == "applying" and resume_score is not None and resume_score >= 50:
        if not state.get("interview_prep_complete"):
            state["current_phase"]       = "interview_prep"
            state["supervisor_decision"] = "Actively applying. Prioritizing interview prep."
            state["messages"].append("[SUPERVISOR] Directing to: interview_prep")
            print("[SUPERVISOR] Decision: interview_prep (applying flow)")
            return state
        
        if not state.get("cold_email_complete"):
            state["current_phase"]       = "cold_email"
            state["supervisor_decision"] = "Actively applying. Generating personalized cold email."
            state["messages"].append("[SUPERVISOR] Directing to: cold_email")
            print("[SUPERVISOR] Decision: cold_email (applying flow)")
            return state
    
    # BUILDING: skill gap analysis + study plan
    if user_status == "building":
        if not state.get("study_plan_complete"):
            state["current_phase"]       = "study_plan"
            state["supervisor_decision"] = "Building skills. Creating personalized study plan."
            state["messages"].append("[SUPERVISOR] Directing to: study_plan")
            print("[SUPERVISOR] Decision: study_plan (building flow)")
            return state
    
    # INTERVIEW_UPCOMING: resume optimization + mock interview + study plan
    if user_status == "interview_upcoming":
        if resume_score is not None and resume_score < 75 and not state.get("fix_resume_complete"):
            state["current_phase"]       = "fix_resume"
            state["supervisor_decision"] = "Interview upcoming. Optimizing resume first."
            state["messages"].append("[SUPERVISOR] Directing to: fix_resume")
            print("[SUPERVISOR] Decision: fix_resume (interview upcoming)")
            return state
        
        if not state.get("interview_prep_complete"):
            state["current_phase"]       = "interview_prep"
            state["supervisor_decision"] = "Interview upcoming. Running mock interview prep."
            state["messages"].append("[SUPERVISOR] Directing to: interview_prep")
            print("[SUPERVISOR] Decision: interview_prep (interview upcoming)")
            return state
    
    # EXPLORING: Suggest skill gap analysis after resume analysis
    if user_status == "exploring":
        if not state.get("skill_gap_complete") and resume_score is not None:
            state["current_phase"]       = "skill_gap_analysis"
            state["supervisor_decision"] = "Resume analyzed. Discover career matches based on your skills."
            state["messages"].append("[SUPERVISOR] Directing to: skill_gap_analysis")
            print("[SUPERVISOR] Decision: skill_gap_analysis (exploring flow)")
            return state
    
    # Default: All work done for current status → suggest next logical step
    if resume_score is not None:
        if resume_score < 75 and not state.get("fix_resume_complete"):
            state["current_phase"]       = "fix_resume"
            state["supervisor_decision"] = f"Resume score is {resume_score}/100. Continue improving for better results."
            state["messages"].append("[SUPERVISOR] Suggesting: fix_resume (score can improve)")
        elif user_status in ["applying", "interview_upcoming"] and not state.get("interview_prep_complete"):
            state["current_phase"]       = "interview_prep"
            state["supervisor_decision"] = "Resume looks good. Practice interview questions to prepare."
            state["messages"].append("[SUPERVISOR] Suggesting: interview_prep")
        elif not state.get("study_plan_complete"):
            state["current_phase"]       = "study_plan"
            state["supervisor_decision"] = "Resume complete. Build skills with a personalized learning plan."
            state["messages"].append("[SUPERVISOR] Suggesting: study_plan")
        else:
            state["current_phase"]       = "idle"
            state["supervisor_decision"] = "All primary tasks complete. Ready for new goals."
            state["messages"].append("[SUPERVISOR] All work complete → idle")
    else:
        state["current_phase"]       = "idle"
        state["supervisor_decision"] = "Waiting for user input."
        state["messages"].append("[SUPERVISOR] Idle.")
    
    print(f"[SUPERVISOR] Decision: {state['current_phase']}")
    return state