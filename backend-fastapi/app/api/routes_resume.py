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
async def skill_gap_analysis(
    resume: UploadFile = File(...),
    user_id: Optional[str] = Form(None)
):
    """
    Analyze career matches based on skills clustering.
    
    Returns probability-based career recommendations and skill gaps for each career.
    
    Args:
        resume: The uploaded resume file (PDF).
        user_id: Optional user ID to personalize recommendations based on preferences.
        
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
        
        # Fetch questionnaire answers + user_profile if user_id is provided
        questionnaire_answers = None
        if user_id:
            try:
                profile = (
                    supabase.table("user")
                    .select("questionnaire_answers,user_profile")
                    .eq("id", user_id)
                    .limit(1)
                    .execute()
                )
                if profile.data:
                    row = profile.data[0] or {}
                    qa = row.get("questionnaire_answers") if isinstance(row.get("questionnaire_answers"), dict) else {}
                    up = row.get("user_profile") if isinstance(row.get("user_profile"), dict) else None

                    merged = dict(qa)
                    if up:
                        merged["user_profile"] = up

                    questionnaire_answers = merged if merged else None
                    if questionnaire_answers:
                        logger.info("Using user preferences/profile for skill gap analysis")
            except Exception as e:
                logger.warning(f"Could not fetch user questionnaire: {e}")
        
        # Analyze skill gaps using LangGraph workflow
        logger.info("Running skill gap analysis workflow")
        analysis_result = analyze_skill_gap(
            resume_text, filename=resume.filename, sections=sections, questionnaire_answers=questionnaire_answers
        )

        # Filter to user's interested role(s) when available.
        # Questionnaire can contain either target_role or target_roles.
        interested_roles: list[str] = []
        if questionnaire_answers:
            raw_roles = questionnaire_answers.get("target_roles") or questionnaire_answers.get("target_role") or []
            if isinstance(raw_roles, str):
                interested_roles = [raw_roles]
            elif isinstance(raw_roles, list):
                interested_roles = [r for r in raw_roles if isinstance(r, str) and r.strip()]

        def _normalize_role(role: str) -> str:
            return (role or "").strip().lower().replace("_", " ").replace("-", " ")

        def _role_matches(career_name: str, interested: list[str]) -> bool:
            career_norm = _normalize_role(career_name)
            for role in interested:
                role_norm = _normalize_role(role)
                if not role_norm:
                    continue
                if role_norm == career_norm:
                    return True
                # Tolerate small naming differences like "software engineer" vs "software engineering"
                if role_norm in career_norm or career_norm in role_norm:
                    return True
            return False

        if interested_roles:
            filtered_careers = [
                c for c in analysis_result.get("career_matches", [])
                if _role_matches(c.get("career", ""), interested_roles)
            ]

            # Only override when we can match at least one interested role.
            if filtered_careers:
                analysis_result["career_matches"] = filtered_careers
                analysis_result["top_3_careers"] = filtered_careers[:3]

                # Keep summary consistent with filtered results.
                best = filtered_careers[0]
                summary = analysis_result.get("analysis_summary") or {}
                summary["best_match"] = best.get("career")
                summary["best_match_probability"] = best.get("probability", 0)
                analysis_result["analysis_summary"] = summary

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
            "interested_roles": interested_roles,
            "target_role": analysis_result.get("target_role"),
            "selected_cluster_source": analysis_result.get("selected_cluster_source"),
            "selected_cluster_confidence": analysis_result.get("selected_cluster_confidence"),
            "timeline_weeks": analysis_result.get("timeline_weeks"),
            "user_skills": analysis_result["user_skills"],
            "normalized_skills": analysis_result.get("normalized_skills", []),
            "skill_proficiency": analysis_result.get("skill_proficiency", {}),
            "total_skills_found": analysis_result["total_skills_found"],
            "gap_buckets": analysis_result.get("gap_buckets", {}),
            "study_planner_skills": analysis_result.get("study_planner_skills", []),
            "resume_optimizer_skills": analysis_result.get("resume_optimizer_skills", []),
            "out_of_scope_skills": analysis_result.get("out_of_scope_skills", []),
            "timeline_note": analysis_result.get("timeline_note"),
            "selected_target_career_match": analysis_result.get("selected_target_career_match"),
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


@router.delete("/study-materials-cache/{target_career}")
async def delete_study_plan(
    target_career: str,
    user=Depends(get_current_user_optional),
):
    """
    Delete a specific study plan from cache by target career.
    Also removes associated calendar sync if it exists.
    """
    if not user:
        return JSONResponse(
            status_code=401,
            content={"success": False, "error": "Not authenticated"},
        )

    try:
        # Delete the study materials cache entry
        delete_result = (
            supabase.table("study_materials_cache")
            .delete()
            .eq("user_id", user.id)
            .eq("target_career", target_career)
            .execute()
        )

        # Also remove associated calendar sync if exists
        try:
            supabase.table("calendar_sync") \
                .delete() \
                .eq("user_id", user.id) \
                .eq("target_career", target_career) \
                .execute()
        except Exception as sync_err:
            logger.warning(f"Failed to delete calendar_sync record: {sync_err}")

        logger.info(f"Deleted study plan for user {user.id}, career: {target_career}")

        return JSONResponse({
            "success": True,
            "message": f"Study plan for {target_career} deleted successfully",
        })

    except Exception as e:
        logger.exception(f"Failed to delete study plan: {e}")
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": str(e),
                "message": "Failed to delete study plan",
            },
        )


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
