"""
Orchestrator API endpoints.

Main entry point for the supervisor-driven system.
Frontend calls these to trigger analysis flows.
"""

from fastapi import APIRouter, UploadFile, File, Form, Header, HTTPException
from typing import Optional
import json
import logging
from datetime import datetime

from app.agents.orchestrator import (
    CareerLMState,
    UserProfile,
    ActiveJob,
    ResumeAnalysisResults,
)
from app.agents.orchestrator.graph import orchestrator_graph
from app.services.resume_parser import get_parser
from supabase_client import supabase

logger = logging.getLogger(__name__)
router = APIRouter()


def ensure_user_row(user_id: str):
    """Make sure a row exists in the `user` table for this auth user.
    Avoids FK violations when inserting into `resumes` or other tables."""
    try:
        existing = (
            supabase.table("user")
            .select("id")
            .eq("id", user_id)
            .limit(1)
            .execute()
        )
        if not existing.data:
            supabase.table("user").insert({
                "id": user_id,
                "name": "User",
                "email": None,
                "password": None,
                "status": "student",
                "questionnaire_answered": False,
                "questionnaire_answers": None,
            }).execute()
            logger.info(f"Auto-created user row for {user_id}")
    except Exception as e:
        # Row might already exist (race condition) — ignore
        logger.debug(f"ensure_user_row {user_id}: {e}")


def initialize_state_from_user(user_id: str) -> CareerLMState:
    """
    Initialize CareerLMState for a user.
    
    Loads user profile, onboarding answers, previous analysis results
    from database. This becomes the starting state for the orchestrator.
    """
    
    # Fetch user profile from DB
    profile_data = None
    try:
        result = supabase.table("user")\
            .select("*")\
            .eq("id", user_id)\
            .limit(1)\
            .execute()
        
        if result.data:
            profile_data = result.data[0]
    except Exception as e:
        logger.warning(f"Could not load user profile for {user_id}: {e}")
    
    # Initialize profile from DB or defaults
    profile: UserProfile = {
        "user_id": user_id,
        "email": profile_data.get("email") if profile_data else None,
        "name": profile_data.get("name") if profile_data else "User",

        "status": None,
        "target_roles": [],
        "score_history": [],
        "confirmed_skills": [],
        "known_gaps": [],
        "resume_versions": [],
        "roles_targeted": [],
        "best_score_ever": None,
        "active_interview_date": None,
    }
    
    # Load onboarding answers if available
    if profile_data and profile_data.get("questionnaire_answers"):
        qa = profile_data["questionnaire_answers"]
        status = qa.get("status")
        if isinstance(status, list):
            status = status[0] if status else None
        # Use raw status values from DB ("applying", "building", "interview_upcoming", "exploring")
        profile["status"] = status
        
        target_role = qa.get("target_role") or qa.get("target_roles")
        if isinstance(target_role, list):
            profile["target_roles"] = target_role
        elif target_role:
            profile["target_roles"] = [target_role]
    
    # Initialize state
    state: CareerLMState = {
        "user_id": user_id,
        "profile": profile,
        "active_job": {
            "job_id": None,
            "company_name": "",
            "job_title": "",
            "job_description": "",
            "key_requirements": [],
            "seniority_level": None,
            "industry": None,
            "matched_requirements": [],
            "unmatched_requirements": [],
        },
        "resume_analysis": {
            "resume_text": None,
            "parsed_sections": {},
            "structure_score": None,
            "completeness_score": None,
            "relevance_score": None,
            "impact_score": None,
            "overall_score": None,
            "score_zone": None,
            "skill_gaps": [],
            "critical_fixes": [],
            "strengths": [],
            "weaknesses": [],
            "suggestions": [],
            "analyzed_for_role": None,
            "analysis_timestamp": None,
            "has_job_description": None,
        },
        "interview_prep": {},
        "cold_email": {},
        "study_plan": {},
        "bullet_rewrite": {
            "weak_bullets": [],
            "user_answers": None,
            "rewrites_generated": None,
            "waiting_for_user": False,
        },
        "current_phase": None,
        "prev_phase": None,
        "supervisor_decision": None,
        "resume_analysis_complete": False,
        "resume_analysis_failed": False,
        "fix_resume_complete": False,
        "interview_prep_complete": False,
        "cold_email_complete": False,
        "study_plan_complete": False,
        "skill_gap_complete": False,
        "bullet_rewrite_complete": False,
        "waiting_for_user": False,
        "waiting_for_input_type": None,
        "thread_id": user_id,
        "_checkpoint_id": None,
        "created_at": datetime.now().isoformat(),
        "last_updated": datetime.now().isoformat(),
        "messages": [],
    }
    
    return state


@router.post("/analyze-resume")
async def analyze_resume(
    user_id: str = Form(...),
    resume: UploadFile = File(...),
    job_description: Optional[str] = Form(None),
    job_title: Optional[str] = Form(None),
    company_name: Optional[str] = Form(None),
):
    """
    Main endpoint: Upload resume and trigger orchestrator analysis.
    
    Initializes CareerLMState, loads resume text, invokes orchestrator graph.
    Graph will:
    1. Supervisor routes to resume_analysis (if resume not analyzed)
    2. resume_analysis_wrapper runs the existing resume_workflow
    3. profile_update_node updates user profile with score delta
    4. Supervisor re-evaluates next steps
    5. Graph pauses at next decision point or human-in-loop pause
    6. State is checkpointed to Supabase
    
    Returns the final state (may be paused waiting for user input).
    """
    
    logger.info(f"[ANALYZE_RESUME] Starting for user {user_id}")
    
    try:
        # ===== PARSE RESUME =====
        parser = get_parser()
        resume_bytes = await resume.read()
        resume_text = parser.extract_text(resume_bytes, filename=resume.filename)
        sections = parser.parse_sections(resume_text)
        
        if not resume_text:
            raise ValueError("Could not extract text from resume")
        
        logger.info(f"[ANALYZE_RESUME] Extracted {len(resume_text)} chars")
        
        # ===== INITIALIZE STATE =====
        state = initialize_state_from_user(user_id)
        
        # ===== POPULATE WITH RESUME + JOB INFO =====
        state["resume_analysis"]["resume_text"] = resume_text
        
        if job_description:
            state["active_job"]["job_description"] = job_description
        if job_title:
            state["active_job"]["job_title"] = job_title
        if company_name:
            state["active_job"]["company_name"] = company_name
        
        state["messages"].append(
            f"[API] Resume uploaded: {resume.filename}, {len(resume_text)} chars"
        )
        
        # ===== INVOKE ORCHESTRATOR GRAPH =====
        logger.info(f"[ANALYZE_RESUME] Invoking orchestrator graph")
        
        from app.agents.orchestrator.graph import orchestrator_graph
        
        result = orchestrator_graph.invoke(
            state,
            config={
                "configurable": {"thread_id": user_id},
                "recursion_limit": 25,  # Prevent infinite loops
            },
        )
        
        logger.info(f"[ANALYZE_RESUME] Graph completed. Phase: {result.get('current_phase')}")
        
        # ===== SKILL GAP ANALYSIS =====
        from app.agents.skill_gap import analyze_skill_gap

        skill_gap_result = analyze_skill_gap(
            resume_text, filename=resume.filename, sections=sections
        )

        # ===== STORE RESUME VERSION (LEAN) =====
        try:
            # Ensure user row exists first to prevent FK constraint failures
            ensure_user_row(user_id)
            
            logger.info("[ANALYZE_RESUME] Persisting resume_versions entry")
            existing_resume = (
                supabase.table("resumes")
                .select("*")
                .eq("user_id", user_id)
                .execute()
            )

            if existing_resume.data:
                resume_id = existing_resume.data[0]["resume_id"]
                new_version_number = existing_resume.data[0]["current_version"] + 1
                supabase.table("resumes").update({
                    "current_version": new_version_number,
                    "latest_update": datetime.utcnow().isoformat(),
                }).eq("resume_id", resume_id).execute()
            else:
                resp = supabase.table("resumes").insert({
                    "user_id": user_id,
                    "template_type": "default",
                    "current_version": 1,
                    "latest_update": datetime.utcnow().isoformat(),
                }).execute()
                resume_id = resp.data[0]["resume_id"]
                new_version_number = 1

            resume_analysis = result.get("resume_analysis", {}) or {}
            analysis_payload = {
                "strengths": resume_analysis.get("strengths", []),
                "weaknesses": resume_analysis.get("weaknesses", []),
                "suggestions": resume_analysis.get("suggestions", []),
                "analysis_timestamp": resume_analysis.get("analysis_timestamp"),
                "ats_score": resume_analysis.get("overall_score"),
                "score_zone": resume_analysis.get("score_zone"),
                "structure_score": resume_analysis.get("structure_score"),
                "completeness_score": resume_analysis.get("completeness_score"),
                "relevance_score": resume_analysis.get("relevance_score"),
                "impact_score": resume_analysis.get("impact_score"),
            }

            # Store only section-wise resume text (exclude contact info).
            cleaned_sections = {k: v for k, v in (sections or {}).items() if k != "contact"}
            content_data = {
                "sections": cleaned_sections,
            }

            insert_result = supabase.table("resume_versions").insert({
                "resume_id": resume_id,
                "version_number": new_version_number,
                "job_description": job_description or "",
                "content": json.dumps(content_data),
                "resume_analysis": json.dumps(analysis_payload),
                "skill_gap": json.dumps(skill_gap_result),
                "ats_score": resume_analysis.get("overall_score"),
                "raw_file_path": resume.filename,
                "notes": f"Orchestrator resume analysis | has_jd: {bool(job_description)}",
            }).execute()
            logger.info(
                "[ANALYZE_RESUME] resume_versions insert done | resume_id=%s | version=%s | rows=%s",
                resume_id,
                new_version_number,
                len(insert_result.data) if insert_result and insert_result.data else 0,
            )
        except Exception as db_err:
            logger.error(f"Failed to store resume version: {db_err}")
            raise HTTPException(
                status_code=500,
                detail=f"Resume analysis completed but failed to save: {str(db_err)}"
            )

        # ===== RETURN STATE FOR FRONTEND =====
        score_history = (result.get("profile") or {}).get("score_history", [])
        score_delta = score_history[-1].get("delta") if score_history else None

        return {
            "success": True,
            "user_id": user_id,
            "current_phase": result.get("current_phase"),
            "supervisor_decision": result.get("supervisor_decision"),
            "resume_score": result.get("resume_analysis", {}).get("overall_score"),
            "score_delta": score_delta,
            "filename": resume.filename,
            "resume_analysis": result.get("resume_analysis"),
            "active_job": result.get("active_job"),
            "profile": result.get("profile"),
            "messages": result.get("messages", []),
            "waiting_for_user": result.get("waiting_for_user", False),
            "waiting_for_input_type": result.get("waiting_for_input_type"),
        }
    
    except Exception as e:
        logger.error(f"[ANALYZE_RESUME] Error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/state")
async def get_current_user_state(authorization: str = Header(None)):
    """
    Retrieve current workflow state for authenticated user.
    Returns the checkpointed state with current_phase, supervisor_decision, etc.
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")
    
    try:
        # Extract token from "Bearer <token>"
        token = authorization.split(" ")[1] if " " in authorization else authorization
        
        # Verify token with Supabase
        response = supabase.auth.get_user(token)
        if not response or not response.user:
            raise HTTPException(status_code=401, detail="Invalid token")
        
        user_id = response.user.id
        ensure_user_row(user_id)
        
        # Try to get checkpointed state
        state = None
        try:
            from app.agents.orchestrator.checkpointer import SupabaseCheckpointer
            
            checkpointer = SupabaseCheckpointer()
            checkpoint = checkpointer.get({"configurable": {"thread_id": user_id}})
            if checkpoint:
                state = checkpoint.get("channel_values")
        except Exception as e:
            logger.warning(f"[GET_STATE] Checkpointer unavailable: {e}")
        
        # If no checkpoint, initialize from user profile
        if not state:
            state = initialize_state_from_user(user_id)
        
        return {
            "success": True,
            "data": {
                "user_id": user_id,
                "current_phase": state.get("current_phase"),
                "supervisor_decision": state.get("supervisor_decision"),
                "status": state.get("user_profile", {}).get("status"),
                "target_roles": state.get("user_profile", {}).get("target_roles", []),
                "updated_at": state.get("updated_at"),
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[GET_STATE] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cancel/{user_id}")
async def cancel_analysis(user_id: str):
    try:
        result = supabase.table("user")\
            .update({"analysis_cancelled": True})\
            .eq("id", user_id)\
            .execute()
        
        if not result.data:
            return {"success": False, "error": "User not found"}
        
        logger.info(f"[CANCEL] Cancellation set for user {user_id}")
        return {
            "success": True,
            "message": "Cancellation requested. Graph will stop at next checkpoint."
        }
    except Exception as e:
        logger.error(f"[CANCEL] Error: {e}")
        return {"success": False, "error": str(e)}


@router.get("/state/{user_id}")
async def get_user_state(user_id: str):
    """
    Retrieve current state for a user (for debugging).
    """
    try:
        state = None
        try:
            from app.agents.orchestrator.checkpointer import SupabaseCheckpointer

            checkpointer = SupabaseCheckpointer()
            checkpoint = checkpointer.get({"configurable": {"thread_id": user_id}})
            if checkpoint:
                state = checkpoint.get("channel_values")
        except Exception as e:
            logger.warning(f"[GET_STATE] Checkpointer unavailable: {e}")

        if not state:
            state = initialize_state_from_user(user_id)

        return {
            "success": True,
            "user_id": user_id,
            "state": state,
        }
    except Exception as e:
        logger.error(f"[GET_STATE] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
