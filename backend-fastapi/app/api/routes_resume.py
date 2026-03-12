# app/routes/resume.py (or wherever your router is)
import io
import json
import logging
from datetime import datetime
from fastapi import APIRouter, UploadFile, File, Form, Depends, Header, Query
from fastapi.responses import JSONResponse
from typing import Optional

# Setup logging
logger = logging.getLogger(__name__)

# Import centralized parser
from app.services.resume_parser import get_parser

# Import Supabase client
from supabase_client import supabase

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


async def get_current_user_optional(authorization: Optional[str] = Header(None)):
    """Extract user from JWT token (returns None if not authenticated)."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.replace("Bearer ", "")
    try:
        user = supabase.auth.get_user(token)
        return user.user if user and user.user else None
    except Exception:
        return None


@router.post("/skill-gap-analysis")
async def skill_gap_analysis(resume: UploadFile = File(...)):
    """
    Analyze career matches based on skills clustering.
    
    Returns probability-based career recommendations and skill gaps for each career.
    
    Args:
        resume: The uploaded resume file (PDF).
        
    Returns:
        JSON response with skill analysis and career recommendations.
    """
    try:
        logger.info(f"Starting skill gap analysis for file: {resume.filename}")
        resume_bytes = await resume.read()
        
        if not resume_bytes:
            logger.error("Resume file is empty")
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": "Resume file is empty"
                }
            )
        
        from app.agents.skill_gap import analyze_skill_gap
        
        # Parse resume to extract text using centralized parser
        logger.info("Parsing resume text from PDF")
        parser = get_parser()
        resume_text = parser.extract_text_from_pdf(resume_bytes)
        
        if not resume_text or len(resume_text.strip()) < 10:
            logger.error("Failed to extract meaningful text from resume")
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": "Could not extract text from resume. Please ensure it's a valid PDF."
                }
            )
        
        logger.info(f"Extracted {len(resume_text)} characters from resume")

        # Parse structured sections so skill extractor uses skills + projects only
        sections = parser.parse_sections(resume_text)
        
        # Analyze skill gaps using LangGraph workflow
        logger.info("Running skill gap analysis workflow")
        analysis_result = analyze_skill_gap(
            resume_text, filename=resume.filename, sections=sections
        )
        
        if "error" in analysis_result:
            logger.warning(f"Analysis error: {analysis_result['error']}")
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": analysis_result["error"]
                }
            )
        
        logger.info(f"Analysis complete. Found {analysis_result.get('total_skills_found', 0)} skills")
        
        return JSONResponse({
            "success": True,
            "filename": resume.filename,
            "user_skills": analysis_result["user_skills"],
            "total_skills_found": analysis_result["total_skills_found"],
            "career_matches": analysis_result["career_matches"],
            "top_3_careers": analysis_result["top_3_careers"],
            "ai_recommendations": analysis_result["ai_recommendations"],
            "analysis_summary": analysis_result["analysis_summary"]
        })
        
    except Exception as e:
        logger.exception(f"Unexpected error in skill gap analysis: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": str(e),
                "message": "Failed to analyze career matches"
            }
        )


@router.get("/study-materials-cache")
async def get_study_materials_cache(
    user=Depends(get_current_user_optional),
):
    """
    Load ALL cached study plans from Supabase for the current user.
    Returns one entry per career path so the frontend can switch between them.
    """
    if not user:
        return JSONResponse(
            status_code=401,
            content={"success": False, "error": "Not authenticated"},
        )

    try:
        result = (
            supabase.table("study_materials_cache")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", desc=True)
            .execute()
        )

        if result.data:
            # Load questionnaire answers once for schedule computation
            questionnaire_answers = None
            if user:
                try:
                    q_result = (
                        supabase.table("user")
                        .select("questionnaire_answers")
                        .eq("id", user.id)
                        .limit(1)
                        .execute()
                    )
                    if q_result.data and q_result.data[0].get("questionnaire_answers"):
                        questionnaire_answers = q_result.data[0]["questionnaire_answers"]
                except Exception:
                    pass

            from app.services.google_calendar import compute_schedule_summary

            plans = []
            for row in result.data:
                sgr = row.get("skill_gap_report", [])
                sched = compute_schedule_summary(sgr, questionnaire_answers) if sgr else None
                plans.append({
                    "target_career": row.get("target_career", ""),
                    "skill_gap_report": sgr,
                    "study_plan": [],
                    "schedule_summary": sched,
                    "cached_at": row.get("created_at"),
                })
            return JSONResponse({
                "success": True,
                "cached": True,
                "plans": plans,
            })
        else:
            return JSONResponse({"success": True, "cached": False, "plans": []})

    except Exception as e:
        logger.warning(f"Failed to load study materials cache: {e}")
        return JSONResponse({"success": True, "cached": False, "plans": []})


# ── Mapping from questionnaire target_role values to CAREER_CLUSTERS keys ──
_ROLE_TO_CAREER = {
    "software_engineer": "Software Engineer",
    "data_scientist": "Data Scientist",
    "data_analyst": "Data Analyst",
    "devops_engineer": "DevOps Engineer",
    "full_stack_developer": "Full Stack Developer",
    "ml_engineer": "Machine Learning Engineer",
    "product_manager": "Product Manager",
    "ux_ui_designer": "UI/UX Designer",
    "cloud_architect": "Cloud Architect",
    "cybersecurity_analyst": "Cybersecurity Analyst",
    "business_analyst": "Business Analyst",
    "mobile_developer": "Mobile Developer",
}


@router.get("/suggested-roles")
async def get_suggested_roles(
    user=Depends(get_current_user_optional),
    stack: Optional[str] = Query(None, description="Tech stack to filter skills by (e.g. 'Python')"),
):
    """
    Return career roles ranked by combining skill-gap match scores with the
    user's questionnaire interest.  Roles the user expressed interest in during
    onboarding are boosted so they appear near the top.

    If ``stack`` is provided, each role's ``missing_skills`` are filtered to
    only include skills relevant to that tech stack.  The response also
    includes ``detected_stacks`` derived from the user's resume skills.
    """
    if not user:
        return JSONResponse(
            status_code=401,
            content={"success": False, "error": "Not authenticated"},
        )

    try:
        # 1. Load the latest resume analysis (career_matches from skill-gap)
        from app.agents.skill_gap.nodes import (
            CAREER_CLUSTERS,
            TECH_STACKS,
            detect_primary_stacks,
            get_career_skills_for_stack,
        )

        resume_row = (
            supabase.table("resumes")
            .select("resume_id")
            .eq("user_id", user.id)
            .limit(1)
            .execute()
        )

        career_matches = []
        user_skills: list[str] = []
        if resume_row.data:
            resume_id = resume_row.data[0]["resume_id"]
            version_row = (
                supabase.table("resume_versions")
                .select("content, skill_gap")
                .eq("resume_id", resume_id)
                .order("version_number", desc=True)
                .limit(1)
                .execute()
            )
            if version_row.data:
                row = version_row.data[0]
                skill_gap = row.get("skill_gap")
                if isinstance(skill_gap, str):
                    skill_gap = json.loads(skill_gap)
                if not skill_gap:
                    content = row.get("content")
                    if isinstance(content, str):
                        content = json.loads(content)
                    skill_gap = content.get("careerAnalysis", {}) if content else {}
                career_analysis = skill_gap or {}
                career_matches = career_analysis.get("career_matches", [])
                user_skills = career_analysis.get("user_skills", [])

        # Auto-detect stacks from resume skills
        detected_stacks = detect_primary_stacks(user_skills)

        # If no explicit stack given, pick the top auto-detected one (if any)
        active_stack = stack
        if not active_stack and detected_stacks:
            active_stack = detected_stacks[0]["stack"]

        # 2. Load questionnaire answers
        q_result = (
            supabase.table("user")
            .select("questionnaire_answers")
            .eq("id", user.id)
            .limit(1)
            .execute()
        )
        qa = {}
        if q_result.data and q_result.data[0].get("questionnaire_answers"):
            qa = q_result.data[0]["questionnaire_answers"]

        interested_roles_raw = qa.get("target_role", [])
        if isinstance(interested_roles_raw, str):
            interested_roles_raw = [interested_roles_raw]

        # Map questionnaire values to career names
        interested_careers = set()
        for r in interested_roles_raw:
            mapped = _ROLE_TO_CAREER.get(r)
            if mapped:
                interested_careers.add(mapped)

        # Helper: filter a skill list through the active stack
        def _filter_skills(career: str, skills: list[str]) -> list[str]:
            if not active_stack:
                return skills
            allowed = set(
                s.lower() for s in get_career_skills_for_stack(career, active_stack)
            )
            return [s for s in skills if s.lower() in allowed]

        # 3. Build ranked list
        INTEREST_BOOST = 20  # percentage points added for user-selected roles

        ranked = []
        seen = set()

        for cm in career_matches:
            career = cm["career"]
            seen.add(career)
            base_score = cm.get("probability", 0)
            is_interested = career in interested_careers
            boosted_score = min(100, base_score + INTEREST_BOOST) if is_interested else base_score
            filtered_missing = _filter_skills(career, cm.get("missing_skills", []))
            ranked.append({
                "career": career,
                "base_score": base_score,
                "boosted_score": round(boosted_score, 2),
                "is_interested": is_interested,
                "missing_skills": filtered_missing,
                "matched_skills_count": cm.get("matched_skills_count", 0),
                "total_required_skills": cm.get("total_required_skills", 0),
            })

        # Add interested roles that weren't in career_matches (e.g. no resume yet)
        for career in interested_careers:
            if career not in seen:
                if active_stack:
                    all_skills = get_career_skills_for_stack(career, active_stack)
                else:
                    cluster = CAREER_CLUSTERS.get(career, {})
                    all_skills = cluster.get("skills", [])
                ranked.append({
                    "career": career,
                    "base_score": 0,
                    "boosted_score": INTEREST_BOOST,
                    "is_interested": True,
                    "missing_skills": all_skills,
                    "matched_skills_count": 0,
                    "total_required_skills": len(all_skills),
                })

        # Sort by boosted_score descending
        ranked.sort(key=lambda x: x["boosted_score"], reverse=True)

        return JSONResponse({
            "success": True,
            "suggested_roles": ranked,
            "interested_roles": list(interested_careers),
            "detected_stacks": detected_stacks,
            "active_stack": active_stack,
            "available_stacks": list(TECH_STACKS.keys()),
        })

    except Exception as e:
        logger.exception(f"Error fetching suggested roles: {e}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": str(e)},
        )


@router.post("/generate-study-materials-simple")
async def generate_study_materials_simple(
    target_career: str = Form(...),
    missing_skills: str = Form(...),
    user=Depends(get_current_user_optional),
):
    """
    AGENTIC Study Planner Endpoint (LangGraph + Gemini Search Grounding)
    Generates a live learning roadmap for the given skill gaps.
    No resume upload required – accepts career + skills directly.
    Auto-saves results to Supabase for the authenticated user.
    """
    try:
        logger.info(f"Study planner request: career={target_career}")

        skills_list = json.loads(missing_skills) if missing_skills else []
        if not skills_list:
            return JSONResponse(
                status_code=400,
                content={"success": False, "error": "No missing skills provided"},
            )

        from app.agents.study_planner import generate_study_plan

        # Fetch questionnaire answers if user is authenticated
        questionnaire_answers = None
        if user:
            try:
                q_result = (
                    supabase.table("user")
                    .select("questionnaire_answers")
                    .eq("id", user.id)
                    .limit(1)
                    .execute()
                )
                if q_result.data and q_result.data[0].get("questionnaire_answers"):
                    questionnaire_answers = q_result.data[0]["questionnaire_answers"]
                    logger.info(f"Loaded questionnaire answers for user {user.id}")
            except Exception as qa_err:
                logger.warning(f"Failed to load questionnaire answers: {qa_err}")

        result = generate_study_plan(target_career, skills_list, questionnaire_answers)

        if result.get("error"):
            logger.warning(f"Study planner error: {result['error']}")
            return JSONResponse(
                status_code=500,
                content={"success": False, "error": result["error"]},
            )

        logger.info(
            f"Study planner complete. {len(result.get('skill_gap_report', []))} skills covered"
        )

        # Auto-save to Supabase if user is authenticated
        # Upsert per career: delete only the matching career entry, keep others
        if user:
            try:
                supabase.table("study_materials_cache") \
                    .delete() \
                    .eq("user_id", user.id) \
                    .eq("target_career", result.get("target_career", target_career)) \
                    .execute()

                supabase.table("study_materials_cache").insert({
                    "user_id": user.id,
                    "target_career": result.get("target_career", target_career),
                    "skill_gap_report": result.get("skill_gap_report", []),
                }).execute()
                logger.info(f"Study materials cached for user {user.id} / career {target_career}")
            except Exception as cache_err:
                logger.warning(f"Failed to cache study materials: {cache_err}")

        # Recompute schedule_summary with consistent field names
        from app.services.google_calendar import compute_schedule_summary
        schedule_summary = compute_schedule_summary(
            result.get("skill_gap_report", []),
            questionnaire_answers,
        )

        return JSONResponse({
            "success": True,
            "target_career": result.get("target_career", target_career),
            "skill_gap_report": result.get("skill_gap_report", []),
            "study_plan": result.get("study_plan", []),
            "schedule_summary": schedule_summary,
        })

    except Exception as e:
        logger.exception(f"Unexpected error in study planner: {e}")
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": str(e),
                "message": "Failed to generate study materials",
            },
        )


# ────────────────────────────────────────────────────────
# Google Calendar sync endpoints
# ────────────────────────────────────────────────────────

@router.get("/calendar-sync-status")
async def get_calendar_sync_status(
    target_career: str = Query(...),
    user=Depends(get_current_user_optional),
):
    """
    Check if a study plan has been synced to Google Calendar and whether
    the user's questionnaire preferences have changed since the last sync.
    """
    if not user:
        return JSONResponse(
            status_code=401,
            content={"success": False, "error": "Authentication required"},
        )

    try:
        # 1. Load sync record
        sync_result = (
            supabase.table("calendar_sync")
            .select("*")
            .eq("user_id", user.id)
            .eq("target_career", target_career)
            .limit(1)
            .execute()
        )

        if not sync_result.data:
            return JSONResponse({
                "success": True,
                "synced": False,
            })

        sync_row = sync_result.data[0]

        # 2. Load current questionnaire answers
        current_qa = None
        try:
            q_result = (
                supabase.table("user")
                .select("questionnaire_answers")
                .eq("id", user.id)
                .limit(1)
                .execute()
            )
            if q_result.data:
                current_qa = q_result.data[0].get("questionnaire_answers")
        except Exception:
            pass

        # 3. Check if preferences changed
        snapshot = sync_row.get("questionnaire_snapshot")
        preferences_changed = _preferences_changed(snapshot, current_qa)

        return JSONResponse({
            "success": True,
            "synced": True,
            "event_count": sync_row.get("event_count", 0),
            "synced_at": sync_row.get("synced_at"),
            "preferences_changed": preferences_changed,
        })

    except Exception as e:
        logger.warning(f"Calendar sync status error: {e}")
        return JSONResponse({"success": True, "synced": False})


def _preferences_changed(snapshot: dict | None, current: dict | None) -> bool:
    """Compare questionnaire snapshots to detect preference changes."""
    if snapshot is None and current is None:
        return False
    if snapshot is None or current is None:
        return True
    # Compare the fields that affect scheduling
    schedule_fields = ["time_commitment", "learning_preference"]
    for field in schedule_fields:
        if snapshot.get(field) != current.get(field):
            return True
    return False


@router.post("/sync-to-google-calendar")
async def sync_to_google_calendar(
    target_career: str = Form(...),
    google_access_token: str = Form(...),
    timezone: str = Form("Asia/Kolkata"),
    user=Depends(get_current_user_optional),
):
    """
    Sync a user's study plan to Google Calendar.

    - On first sync: creates events and saves their IDs in `calendar_sync`.
    - On re-sync: deletes old events from Google Calendar first, then creates
      new ones (no duplicates).
    - Stores a snapshot of the questionnaire answers used so the frontend
      can detect when preferences change.
    """
    try:
        if not user:
            return JSONResponse(
                status_code=401,
                content={"success": False, "error": "Authentication required"},
            )

        # 1. Load cached study plan for this career
        cache_result = (
            supabase.table("study_materials_cache")
            .select("skill_gap_report")
            .eq("user_id", user.id)
            .eq("target_career", target_career)
            .limit(1)
            .execute()
        )

        if not cache_result.data or not cache_result.data[0].get("skill_gap_report"):
            return JSONResponse(
                status_code=404,
                content={
                    "success": False,
                    "error": f"No cached study plan found for '{target_career}'. Generate one first.",
                },
            )

        skill_gap_report = cache_result.data[0]["skill_gap_report"]

        # 2. Load questionnaire answers
        questionnaire_answers = None
        try:
            q_result = (
                supabase.table("user")
                .select("questionnaire_answers")
                .eq("id", user.id)
                .limit(1)
                .execute()
            )
            if q_result.data and q_result.data[0].get("questionnaire_answers"):
                questionnaire_answers = q_result.data[0]["questionnaire_answers"]
        except Exception as qa_err:
            logger.warning(f"Failed to load questionnaire answers: {qa_err}")

        # 3. Delete old events if this career was synced before
        from app.services.google_calendar import (
            build_calendar_events,
            delete_events_from_google_calendar,
            sync_events_to_google_calendar,
        )

        old_sync = (
            supabase.table("calendar_sync")
            .select("event_ids")
            .eq("user_id", user.id)
            .eq("target_career", target_career)
            .limit(1)
            .execute()
        )

        old_event_ids = []
        if old_sync.data and old_sync.data[0].get("event_ids"):
            old_event_ids = old_sync.data[0]["event_ids"]

        if old_event_ids:
            delete_result = await delete_events_from_google_calendar(
                access_token=google_access_token,
                event_ids=old_event_ids,
            )
            logger.info(
                f"Deleted {delete_result['deleted_count']} old events for "
                f"user {user.id} / career {target_career}"
            )

        # 4. Build new calendar events
        events = build_calendar_events(
            skill_gap_report=skill_gap_report,
            questionnaire_answers=questionnaire_answers,
            target_career=target_career,
            timezone=timezone,
        )

        if not events:
            return JSONResponse(
                status_code=400,
                content={"success": False, "error": "No events to create from this study plan"},
            )

        # 5. Push to Google Calendar
        result = await sync_events_to_google_calendar(
            access_token=google_access_token,
            events=events,
        )

        # 6. Persist sync state (upsert)
        new_event_ids = [e["id"] for e in result.get("created_events", []) if e.get("id")]
        sync_data = {
            "user_id": user.id,
            "target_career": target_career,
            "event_ids": new_event_ids,
            "event_count": result["created_count"],
            "timezone": timezone,
            "questionnaire_snapshot": questionnaire_answers,
            "synced_at": datetime.utcnow().isoformat(),
        }

        try:
            # Upsert: delete then insert (Supabase doesn't have native upsert on composite keys easily)
            supabase.table("calendar_sync") \
                .delete() \
                .eq("user_id", user.id) \
                .eq("target_career", target_career) \
                .execute()
            supabase.table("calendar_sync").insert(sync_data).execute()
        except Exception as db_err:
            logger.warning(f"Failed to persist calendar sync state: {db_err}")

        logger.info(
            f"Calendar sync for user {user.id}: "
            f"{result['created_count']}/{result['total']} events created"
        )

        return JSONResponse({
            "success": True,
            "message": f"Created {result['created_count']} study sessions in Google Calendar",
            "replaced_old": len(old_event_ids) > 0,
            "old_events_deleted": len(old_event_ids),
            **result,
        })

    except Exception as e:
        logger.exception(f"Google Calendar sync error: {e}")
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": str(e),
                "message": "Failed to sync to Google Calendar",
            },
        )


@router.post("/remove-from-google-calendar")
async def remove_from_google_calendar(
    target_career: str = Form(...),
    google_access_token: str = Form(...),
    user=Depends(get_current_user_optional),
):
    """
    Remove previously synced study events from Google Calendar
    and clear the sync record from the database.
    """
    try:
        if not user:
            return JSONResponse(
                status_code=401,
                content={"success": False, "error": "Authentication required"},
            )

        # 1. Load stored event IDs
        sync_result = (
            supabase.table("calendar_sync")
            .select("event_ids")
            .eq("user_id", user.id)
            .eq("target_career", target_career)
            .limit(1)
            .execute()
        )

        if not sync_result.data or not sync_result.data[0].get("event_ids"):
            return JSONResponse({
                "success": True,
                "message": "No synced events found to remove",
                "deleted_count": 0,
            })

        event_ids = sync_result.data[0]["event_ids"]

        # 2. Delete events from Google Calendar
        from app.services.google_calendar import delete_events_from_google_calendar

        delete_result = await delete_events_from_google_calendar(
            access_token=google_access_token,
            event_ids=event_ids,
        )

        # 3. Remove sync record from DB
        try:
            supabase.table("calendar_sync") \
                .delete() \
                .eq("user_id", user.id) \
                .eq("target_career", target_career) \
                .execute()
        except Exception as db_err:
            logger.warning(f"Failed to delete calendar_sync record: {db_err}")

        logger.info(
            f"Removed {delete_result['deleted_count']}/{len(event_ids)} "
            f"calendar events for user {user.id} / career {target_career}"
        )

        return JSONResponse({
            "success": True,
            "message": f"Removed {delete_result['deleted_count']} events from Google Calendar",
            **delete_result,
        })

    except Exception as e:
        logger.exception(f"Google Calendar remove error: {e}")
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": str(e),
                "message": "Failed to remove events from Google Calendar",
            },
        )


# ─────────────────────────────────────────────────────────────────────────────
# RESUME EDITOR ENDPOINTS
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/editor/{version_id}")
async def get_resume_for_editor(version_id: int):
    """
    Fetch resume sections and suggestions for the editor.
    
    Returns:
        - sections: Parsed resume content by section
        - suggestions: Bullet rewrites and improvements with section metadata
        - job_description: Original JD used for analysis
        - ats_score: Overall ATS score
    """
    try:
        # Fetch resume version
        result = supabase.table("resume_versions") \
            .select("*") \
            .eq("version_id", version_id) \
            .single() \
            .execute()
        
        if not result.data:
            return JSONResponse(
                status_code=404,
                content={"success": False, "error": "Resume version not found"}
            )
        
        version_data = result.data
        
        # Parse stored JSON fields
        content = version_data.get("content")
        if isinstance(content, str):
            content = json.loads(content)
        
        resume_analysis = version_data.get("resume_analysis")
        if isinstance(resume_analysis, str):
            resume_analysis = json.loads(resume_analysis)
        
        sections = content.get("sections", {}) if content else {}
        
        # Extract RAG-based suggestions (actual structure in DB)
        suggestions = resume_analysis.get("suggestions", []) if resume_analysis else []
        strengths = resume_analysis.get("strengths", []) if resume_analysis else []
        weaknesses = resume_analysis.get("weaknesses", []) if resume_analysis else []
        
        # Helper function to find original bullet text in sections
        def find_original_bullet(rewritten_text, sections):
            """
            Find the original bullet point that matches the rewritten one.
            Uses keyword matching to identify similar content.
            Preserves bullet characters (-, •, etc.) from the original.
            """
            # Extract key terms from rewritten text (nouns, verbs, important words)
            rewritten_lower = rewritten_text.lower()
            # Get significant words (>4 chars, not common words)
            stop_words = {'the', 'and', 'for', 'with', 'that', 'this', 'from', 'using', 'used', 'have', 'been'}
            keywords = [w for w in rewritten_lower.split() if len(w) > 4 and w not in stop_words][:5]
            
            best_match = None
            best_score = 0
            matched_section = None
            
            for section_key, section_content in sections.items():
                if not section_content or section_key in ['contact', 'summary', 'skills']:
                    continue
                    
                section_str = str(section_content)
                # Split into lines - preserve original formatting including bullets
                lines = [line for line in section_str.split('\n') if line.strip()]
                
                for line in lines:
                    line_stripped = line.strip()
                    if len(line_stripped) < 20:  # Skip short lines
                        continue
                    
                    line_lower = line_stripped.lower()
                    # Count how many keywords appear in this line
                    score = sum(1 for kw in keywords if kw in line_lower)
                    
                    if score > best_score:
                        best_score = score
                        # Keep the line with its original formatting (bullets, whitespace)
                        best_match = line
                        matched_section = section_key
            
            return best_match, matched_section
        
        # Transform RAG suggestions to match frontend SuggestionPanel structure
        # bullet_rewrites: Array of { before, after, reason, section_key }
        bullet_rewrites = []
        for suggestion in suggestions:
            bullet_text = suggestion.get("bullet_rewrite", "")
            explanation = suggestion.get("explanation", "")
            suggestion_title = suggestion.get("suggestion", "")
            
            if not bullet_text:
                continue
            
            # Find the original bullet point in the resume sections
            original_bullet, matched_section = find_original_bullet(bullet_text, sections)
            
            if original_bullet:
                bullet_rewrites.append({
                    "before": original_bullet,
                    "after": bullet_text,
                    "reason": explanation,
                    "section_key": matched_section or "general",
                    "original": original_bullet,
                    "rewritten": bullet_text
                })
            else:
                # If we can't find original, create a suggestion-only entry
                bullet_rewrites.append({
                    "before": suggestion_title or "Original bullet (not found in current resume)",
                    "after": bullet_text,
                    "reason": explanation,
                    "section_key": "general",
                    "original": "",
                    "rewritten": bullet_text,
                    "no_original": True  # Flag indicating we couldn't find original
                })
        
        # improvements: Combine strengths and weaknesses 
        # Array of { title, explanation, evidence, section_key }
        improvements = []
        
        for strength in strengths:
            title = strength.get("title", "Strength")
            explanation = strength.get("explanation", "")
            matched_section = None
            
            for section_key, section_content in sections.items():
                section_str = str(section_content).lower()
                if explanation:
                    explanation_words = explanation.split()[:5]
                    if any(word.lower() in section_str for word in explanation_words if len(word) > 3):
                        matched_section = section_key
                        break
            
            improvements.append({
                "title": f"✅ {title}",
                "explanation": explanation,
                "evidence": "",
                "section_key": matched_section or "general",
                "type": "strength"
            })
        
        for weakness in weaknesses:
            title = weakness.get("title", "Area for Improvement")
            explanation = weakness.get("explanation", "")
            matched_section = None
            
            for section_key, section_content in sections.items():
                section_str = str(section_content).lower()
                if explanation:
                    explanation_words = explanation.split()[:5]
                    if any(word.lower() in section_str for word in explanation_words if len(word) > 3):
                        matched_section = section_key
                        break
            
            improvements.append({
                "title": f"⚠️ {title}",
                "explanation": explanation,
                "evidence": "",
                "section_key": matched_section or "general",
                "type": "weakness"
            })
        
        return JSONResponse({
            "success": True,
            "version_id": version_id,
            "sections": sections,
            "suggestions": {
                "bullet_rewrites": bullet_rewrites,
                "improvements": improvements
            },
            "job_description": version_data.get("job_description", ""),
            "ats_score": version_data.get("ats_score"),
            "structure_score": resume_analysis.get("structure_score") if resume_analysis else None,
            "completeness_score": resume_analysis.get("completeness_score") if resume_analysis else None,
            "relevance_score": resume_analysis.get("relevance_score") if resume_analysis else None,
            "impact_score": resume_analysis.get("impact_score") if resume_analysis else None,
            "score_zone": resume_analysis.get("score_zone") if resume_analysis else None,
            "resume_text": version_data.get("resume_text", ""),
        })
        
    except Exception as e:
        logger.exception(f"Error fetching resume for editor: {e}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": str(e)}
        )


@router.patch("/editor/{version_id}/sections")
async def update_resume_sections(version_id: int, sections: dict):
    """
    Save edited resume sections back to database.
    
    Args:
        version_id: Resume version ID
        sections: Updated sections dictionary
    """
    try:
        # Fetch current version to get resume_id
        current = supabase.table("resume_versions") \
            .select("resume_id, content") \
            .eq("version_id", version_id) \
            .single() \
            .execute()
        
        if not current.data:
            return JSONResponse(
                status_code=404,
                content={"success": False, "error": "Resume version not found"}
            )
        
        # Update content with new sections
        content = current.data.get("content")
        if isinstance(content, str):
            content = json.loads(content)
        if not content:
            content = {}
        
        content["sections"] = sections
        
        # Update in database
        supabase.table("resume_versions") \
            .update({
                "content": json.dumps(content),
                "updated_at": datetime.utcnow().isoformat()
            }) \
            .eq("version_id", version_id) \
            .execute()
        
        logger.info(f"Updated sections for resume version {version_id}")
        
        return JSONResponse({
            "success": True,
            "message": "Sections updated successfully",
            "version_id": version_id
        })
        
    except Exception as e:
        logger.exception(f"Error updating resume sections: {e}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": str(e)}
        )


@router.post("/generate-latex")
async def generate_latex_code(sections: dict):
    """
    Generate LaTeX code from resume sections using Jake's Resume Template.
    
    Args:
        sections: Dictionary with resume section contents
    
    Returns:
        LaTeX code as string
    """
    try:
        from app.services.latex_generator import generate_latex
        
        latex_code = generate_latex(sections)
        
        return JSONResponse({
            "success": True,
            "latex_code": latex_code,
            "template": "jakes_resume"
        })
        
    except Exception as e:
        logger.exception(f"Error generating LaTeX: {e}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": str(e)}
        )


@router.post("/generate-pdf")
async def generate_pdf(sections: dict):
    """
    Generate PDF from resume sections using Jake's Resume Template.
    
    Compiles LaTeX to PDF using pdflatex (with API fallback).
    
    Args:
        sections: Dictionary with resume section contents
    
    Returns:
        PDF file as binary response
    """
    try:
        from app.services.latex_generator import generate_latex
        from app.services.pdf_compiler import compile_latex_with_fallback, PDFCompilationError
        from fastapi.responses import Response
        
        # Generate LaTeX code
        latex_code = generate_latex(sections)
        
        try:
            # Compile to PDF
            pdf_bytes = await compile_latex_with_fallback(latex_code)
            
            return Response(
                content=pdf_bytes,
                media_type="application/pdf",
                headers={
                    "Content-Disposition": "attachment; filename=resume.pdf"
                }
            )
        except PDFCompilationError as pdf_err:
            logger.warning(f"PDF compilation failed: {pdf_err}")
            return JSONResponse(
                status_code=500,
                content={
                    "success": False,
                    "error": str(pdf_err),
                    "log": pdf_err.log_output,
                    "latex_code": latex_code,  # Return LaTeX so user can compile elsewhere
                    "message": "PDF compilation failed. LaTeX code returned for manual compilation."
                }
            )
        
    except Exception as e:
        logger.exception(f"Error generating PDF: {e}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": str(e)}
        )


@router.post("/apply-suggestion")
async def apply_suggestion(
    version_id: int,
    suggestion_type: str,  # "bullet_rewrite" or "improvement"
    section_key: str,
    original_text: str,
    replacement_text: str
):
    """
    Apply a single suggestion to a resume section.
    
    Finds and replaces the original text with the suggested replacement.
    """
    try:
        # Fetch current sections
        result = supabase.table("resume_versions") \
            .select("content") \
            .eq("version_id", version_id) \
            .single() \
            .execute()
        
        if not result.data:
            return JSONResponse(
                status_code=404,
                content={"success": False, "error": "Resume version not found"}
            )
        
        content = result.data.get("content")
        if isinstance(content, str):
            content = json.loads(content)
        
        sections = content.get("sections", {})
        
        # Apply replacement
        if section_key in sections:
            section_content = sections[section_key]
            if original_text in section_content:
                sections[section_key] = section_content.replace(original_text, replacement_text, 1)
                content["sections"] = sections
                
                # Save back to database
                supabase.table("resume_versions") \
                    .update({
                        "content": json.dumps(content),
                        "updated_at": datetime.utcnow().isoformat()
                    }) \
                    .eq("version_id", version_id) \
                    .execute()
                
                logger.info(f"Applied suggestion to {section_key} in version {version_id}")
                
                return JSONResponse({
                    "success": True,
                    "message": f"Suggestion applied to {section_key}",
                    "updated_sections": sections
                })
            else:
                return JSONResponse(
                    status_code=400,
                    content={
                        "success": False,
                        "error": "Original text not found in section",
                        "section_key": section_key
                    }
                )
        else:
            return JSONResponse(
                status_code=400,
                content={
                    "success": False,
                    "error": f"Section '{section_key}' not found",
                }
            )
        
    except Exception as e:
        logger.exception(f"Error applying suggestion: {e}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": str(e)}
        )


@router.get("/user/{user_id}/latest-version")
async def get_latest_resume_version(user_id: str):
    """
    Get the latest resume version ID for a user.
    """
    try:
        result = supabase.table("resumes") \
            .select("resume_id, current_version") \
            .eq("user_id", user_id) \
            .single() \
            .execute()
        
        if not result.data:
            return JSONResponse(
                status_code=404,
                content={"success": False, "error": "No resume found for user"}
            )
        
        resume_id = result.data["resume_id"]
        current_version = result.data["current_version"]
        
        # Get version_id for current version
        version_result = supabase.table("resume_versions") \
            .select("version_id") \
            .eq("resume_id", resume_id) \
            .eq("version_number", current_version) \
            .single() \
            .execute()
        
        if not version_result.data:
            return JSONResponse(
                status_code=404,
                content={"success": False, "error": "Resume version not found"}
            )
        
        return JSONResponse({
            "success": True,
            "version_id": version_result.data["version_id"],
            "resume_id": resume_id,
            "version_number": current_version
        })
        
    except Exception as e:
        logger.exception(f"Error getting latest version: {e}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": str(e)}
        )
