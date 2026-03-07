"""
Resume analysis wrapper node used by the orchestrator.

Bridges the orchestrator's CareerLMState with the existing resume workflow.
"""

from datetime import datetime
import json
from supabase_client import supabase

from app.agents.resume.graph import resume_workflow
from app.agents.orchestrator.state import CareerLMState
from app.services.rag_suggestions import get_resume_rag_evaluation
from app.services.resume_parser import get_parser


def resume_analysis_wrapper_node(state: CareerLMState) -> CareerLMState:
    """
    Run resume analysis and merge results into orchestrator state.

    Extracts from state:
    - resume_text
    - job_description (if active_job set)
    - role_type

    Merges back:
    - All resume_analysis fields
    - Marks resume_analysis_complete = True
    """

    print("[RESUME_WRAPPER] Entered resume_analysis_wrapper_node")

    messages = state.get("messages", [])
    resume_analysis = state.get("resume_analysis", {})
    active_job = state.get("active_job", {})
    profile = state.get("profile", {})

    # Check for cancellation flag before starting long operation
    user_id = profile.get("user_id")
    if user_id:
        try:
            result = supabase.table("user")\
                .select("analysis_cancelled")\
                .eq("id", user_id)\
                .single()\
                .execute()
            if result.data and result.data.get("analysis_cancelled"):
                print(f"[RESUME_WRAPPER] Cancellation detected for user {user_id}")
                messages.append("[RESUME_WRAPPER] Analysis cancelled by user.")
                # Reset the flag immediately so next run works
                supabase.table("user")\
                    .update({"analysis_cancelled": False})\
                    .eq("id", user_id)\
                    .execute()
                state["messages"] = messages
                state["resume_analysis_failed"] = True
                state["waiting_for_user"] = True
                state["waiting_for_input_type"] = "cancelled"
                return state
        except Exception as e:
            print(f"[RESUME_WRAPPER] Error checking cancellation: {e}")

    # ===== EXTRACT WHAT RESUME WORKFLOW NEEDS =====

    resume_text = resume_analysis.get("resume_text")
    if not resume_text:
        messages.append("[RESUME_WRAPPER] Error: no resume_text in state")
        state["messages"] = messages
        return state

    job_description = active_job.get("job_description", "")
    # Get target_roles list from profile (multi-select from onboarding)
    target_roles = profile.get("target_roles", [])
    target_role = target_roles[0] if target_roles else None
    
    # Make target_role optional with fallback to None (generic analysis)
    # Users can skip target_role selection; analysis works fine without it
    role_type = (target_role or "").lower().replace(" ", "_") if target_role else None

    # ===== PARSE RESUME SECTIONS BEFORE WORKFLOW =====
    # This is critical for completeness_score calculation
    print("[RESUME_WRAPPER] Parsing resume sections...")
    parsed_sections = get_parser().parse_sections(resume_text)
    print(f"[RESUME_WRAPPER] Parsed sections: {list(parsed_sections.keys())}")

    # ===== PREPARE INPUT FOR RESUME WORKFLOW =====

    resume_input = {
        "resume_text": resume_text,
        "job_description": job_description,
        "resume_sections": parsed_sections,  # Now contains actual parsed sections
        "role_type": role_type if role_type else None,
        "has_job_description": bool(job_description),
        "structure_score": None,
        "completeness_score": None,
        "relevance_score": None,
        "impact_score": None,
        "ats_score": None,
        "score_zone": None,
        "ats_components": {},
        "ats_justification": [],
        "structure_suggestions": [],
        "readability_issues": [],
        "needs_template": None,
        "keyword_gap_table": [],
        "skills_analysis": [],
        "overall_readiness": None,
        "ready_skills": [],
        "critical_gaps": [],
        "learning_priorities": [],
        "ats_issues": [],
        "job_readiness_estimate": None,
        "gaps": [],
        "alignment_suggestions": [],
        "completed_steps": [],
        "iteration_count": 0,
        "max_iterations": 5,
        "messages": [],
        "_status": None,
    }

    messages.append("[RESUME_WRAPPER] Calling resume_workflow...")
    print("[RESUME_WRAPPER] Calling resume_workflow...")

    try:
        resume_result = resume_workflow.invoke(resume_input)

        messages.append("[RESUME_WRAPPER] Resume workflow completed")
        print("[RESUME_WRAPPER] Resume workflow completed")
    except Exception as e:
        messages.append(f"[RESUME_WRAPPER] Error calling resume_workflow: {e}")
        print(f"[RESUME_WRAPPER] Error: {e}")
        import traceback
        traceback.print_exc()
        state["resume_analysis_failed"] = True
        state["waiting_for_user"] = True
        state["waiting_for_input_type"] = "resume_analysis_error"
        state["messages"] = messages
        return state

    # ===== MAP RESUME RESULTS INTO ORCHESTRATOR STATE =====

    rag_eval = get_resume_rag_evaluation(
        resume_text=resume_text,
        job_description=job_description,
        category="resume",
    )

    # Resume sections were parsed before workflow and should be in result
    # (workflow receives them as input and preserves them in state)
    parsed_sections = resume_result.get("resume_sections", {}) or parsed_sections

    state["resume_analysis"] = {
        "resume_text": resume_analysis.get("resume_text"),
        "parsed_sections": parsed_sections,
        # Scores (used by DB + orchestrator + profile_update)
        "structure_score": resume_result.get("structure_score"),
        "completeness_score": resume_result.get("completeness_score"),
        "relevance_score": resume_result.get("relevance_score"),
        "impact_score": resume_result.get("impact_score"),
        "overall_score": resume_result.get("ats_score"),
        "score_zone": resume_result.get("score_zone"),
        # Data needed by profile_update
        "skill_gaps": resume_result.get("critical_gaps", []),  # Used as skill_gaps
        "critical_fixes": [
            s.get("issue") for s in resume_result.get("structure_suggestions", [])
        ][:3],
        # Metadata
        "analyzed_for_role": role_type,
        "analysis_timestamp": datetime.now().isoformat(),
        "has_job_description": resume_result.get("has_job_description"),
        # RAG evaluation (stored in DB)
        "strengths": rag_eval.get("strengths", []),
        "weaknesses": rag_eval.get("weaknesses", []),
        "suggestions": rag_eval.get("suggestions", []),
    }

    state["resume_analysis_complete"] = True
    state["resume_analysis_failed"] = False

    messages.append(
        f"[RESUME_WRAPPER] Merged results. New score: "
        f"{resume_result.get('ats_score')}/100"
    )

    # ===== AUTO-POPULATE USER_PROFILE WITH PARSED SECTIONS =====
    user_id = state.get("user_id") or profile.get("user_id") or state.get("thread_id")
    if user_id and parsed_sections:
        try:
            # Extract parsed sections from resume analysis
            cleaned_sections = {k: v for k, v in parsed_sections.items() if k != "contact"}
            parser = get_parser()
            profile_payload = {
                "intro": cleaned_sections.get("summary", ""),
                "skills": parser.parse_skills_list(cleaned_sections.get("skills", "")),
                "education": cleaned_sections.get("education", ""),
                "projects": cleaned_sections.get("projects", ""),
                "experience": cleaned_sections.get("experience", ""),
                "certifications": cleaned_sections.get("certifications", ""),
                "coursework": cleaned_sections.get("coursework", ""),
                "co_curricular_achievements": cleaned_sections.get("awards", ""),
            }
            
            # Fetch current user_profile
            user_data = supabase.table("user").select("user_profile").eq("id", user_id).single().execute()
            current_profile = user_data.data.get("user_profile", {}) if user_data.data else {}
            
            # Handle various types: None, string (JSON), or dict
            if current_profile is None:
                current_profile = {}
            elif isinstance(current_profile, str):
                try:
                    current_profile = json.loads(current_profile)
                except Exception:
                    current_profile = {}
            elif not isinstance(current_profile, dict):
                current_profile = {}
            
            # Merge parsed sections into user_profile (preserve extra keys)
            cleaned_payload = {}
            for key, value in profile_payload.items():
                if isinstance(value, list) and value:
                    cleaned_payload[key] = value
                elif isinstance(value, str) and value.strip():
                    cleaned_payload[key] = value

            merged_profile = {
                **current_profile,
                **cleaned_payload,
                "resume_auto_populated_at": datetime.now().isoformat(),
            }
            
            # Update user_profile in Supabase
            update_result = (
                supabase.table("user")
                .update({"user_profile": merged_profile})
                .eq("id", user_id)
                .execute()
            )
            if not update_result.data:
                # Verify row exists for this user_id
                exists_result = (
                    supabase.table("user")
                    .select("id")
                    .eq("id", user_id)
                    .execute()
                )
                exists = bool(exists_result.data)
                msg = "no rows updated" if exists else "user row not found"
                messages.append(f"[RESUME_WRAPPER] Auto-population skipped: {msg}")
                print("[RESUME_WRAPPER] Auto-population skipped:", msg, user_id)
            else:
                messages.append("[RESUME_WRAPPER] Auto-populated user_profile with parsed sections")
                print("[RESUME_WRAPPER] Auto-populated user_profile", user_id)
        except Exception as e:
            print(f"[RESUME_WRAPPER] Warning: Failed to auto-populate user_profile: {e}")
            messages.append(f"[RESUME_WRAPPER] Warning: auto-population failed")

    state["messages"] = messages
    return state
