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

# Import service modules
from app.services.resume_optimizer import optimize_resume_logic

# Import Supabase client
from supabase_client import supabase

router = APIRouter()


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


@router.post("/optimize")
async def optimize_resume(
    user_id: str = Form(...),
    resume: UploadFile = File(...),
    job_description: str = Form(...)
):
    """
    AGENTIC Resume Optimization Endpoint
    Uses LangGraph multi-agent system to analyze and optimize resumes
    """
    
    # Extract raw text using centralized parser
    parser = get_parser()
    resume_bytes = await resume.read()
    resume_text = parser.extract_text(resume_bytes, filename=resume.filename)

    # Parse structured sections (lowercase keys for ATS compatibility)
    sections = parser.parse_sections(resume_text)

    # Run AGENTIC optimizer logic (this now uses LangGraph!)
    logger.info(f"Processing resume: {resume.filename}")
    
    analysis_result = optimize_resume_logic(
        resume_bytes,
        job_description,
        filename=resume.filename,
        resume_text=resume_text,
        sections=sections
    )
    
    logger.info(f"ATS Score: {analysis_result.get('ats_score')}/100")
    
    # Run Skill Gap Analysis in parallel
    logger.info("Running skill gap analysis...")
    from app.agents.skill_gap import analyze_skill_gap
    skill_gap_result = analyze_skill_gap(resume_text, filename=resume.filename)
    
    logger.info(f"Skill gap analysis complete. Found {skill_gap_result.get('total_skills_found', 0)} skills")

    # Build comprehensive result
    result = {
        # Original fields (backward compatible)
        "sections": sections,
        "filename": resume.filename,
        "resume_text": resume_text,  # Store full resume text for cold email generation
        
        # ATS Analysis
        "ats_score": analysis_result.get("ats_score"),
        "ats_analysis": analysis_result.get("ats_analysis", {}),
        
        # Optimization Suggestions
        "analysis": {
            "gaps": analysis_result.get("gaps", []),  # Skill gaps
            "alignment_suggestions": analysis_result.get("alignment_suggestions", []),
            "structure_suggestions": analysis_result.get("structure_suggestions", []),  # Only if ATS < 60
        },
        
        # Career & Skill Gap Analysis (auto-populated)
        "careerAnalysis": skill_gap_result if "error" not in skill_gap_result else {
            "user_skills": [],
            "total_skills_found": 0,
            "career_matches": [],
            "top_3_careers": [],
            "ai_recommendations": "",
            "analysis_summary": {
                "best_match": None,
                "best_match_probability": 0,
                "skills_to_focus": []
            }
        },
        
        # Agentic Metadata (for debugging/UI)
        "agentic_metadata": {
            "agent_execution_log": analysis_result.get("agent_execution_log", []),
            "total_iterations": analysis_result.get("total_iterations", 0),
            "completed_steps": analysis_result.get("completed_steps", []),
            "is_agentic": analysis_result.get("_agentic", False),
            "version": analysis_result.get("_version", "1.0")
        },
        
        "summary": "",  # Keep for backward compatibility
    }

    # Insert/Update Supabase
    existing_resume = supabase.table("resumes").select("*").eq("user_id", user_id).execute()

    if existing_resume.data:
        resume_id = existing_resume.data[0]["resume_id"]
        new_version_number = existing_resume.data[0]["current_version"] + 1

        supabase.table("resumes").update({
            "current_version": new_version_number,
            "latest_update": datetime.utcnow().isoformat()
        }).eq("resume_id", resume_id).execute()

    else:
        resp = supabase.table("resumes").insert({
            "user_id": user_id,
            "template_type": "default",
            "current_version": 1,
            "latest_update": datetime.utcnow().isoformat()
        }).execute()

        resume_id = resp.data[0]["resume_id"]
        new_version_number = 1

    # Separate resume text from analysis data
    analysis_data = {
        "sections": result["sections"],
        "filename": result["filename"],
        "ats_score": result["ats_score"],
        "ats_analysis": result["ats_analysis"],
        "analysis": result["analysis"],
        "careerAnalysis": result["careerAnalysis"],
        "agentic_metadata": result["agentic_metadata"],
        "summary": result["summary"]
    }

    stored_version = supabase.table("resume_versions").insert({
        "resume_id": resume_id,
        "version_number": new_version_number,
        "resume_text": resume_text,  # Store plain resume text separately
        "job_description": job_description,
        "content": json.dumps(analysis_data),  # Store only analysis data
        "ats_score": result.get("ats_score"),
        "raw_file_path": result.get("filename"),
        "notes": f"Agentic analysis v{result['agentic_metadata']['version']} - {result['agentic_metadata']['total_iterations']} iterations"
    }).execute()

    return JSONResponse({
        "success": True,
        "optimization": result,
        "resume_id": resume_id,
        "version_stored": stored_version.data
    })


# Keep your other endpoints as-is
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
        
        # Analyze skill gaps using LangGraph workflow
        logger.info("Running skill gap analysis workflow")
        analysis_result = analyze_skill_gap(resume_text, filename=resume.filename)
        
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
            plans = []
            for row in result.data:
                plans.append({
                    "target_career": row.get("target_career", ""),
                    "skill_gap_report": row.get("skill_gap_report", []),
                    "study_plan": row.get("study_plan", []),
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
                .select("content")
                .eq("resume_id", resume_id)
                .order("version_number", desc=True)
                .limit(1)
                .execute()
            )
            if version_row.data:
                content = version_row.data[0].get("content")
                if isinstance(content, str):
                    content = json.loads(content)
                career_analysis = content.get("careerAnalysis", {}) if content else {}
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
                    "study_plan": result.get("study_plan", []),
                }).execute()
                logger.info(f"Study materials cached for user {user.id} / career {target_career}")
            except Exception as cache_err:
                logger.warning(f"Failed to cache study materials: {cache_err}")

        return JSONResponse({
            "success": True,
            "target_career": result.get("target_career", target_career),
            "skill_gap_report": result.get("skill_gap_report", []),
            "study_plan": result.get("study_plan", []),
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


@router.post("/generate-study-materials")
async def generate_study_materials(
    resume: UploadFile = File(...),
    job_description: str = Form(...),
    target_career: str = Form(None),
    missing_skills: str = Form(None)
):
    """
    Generate personalized study materials and learning resources based on skill gaps.
    
    Args:
        resume: The uploaded resume file (PDF).
        job_description: The target job description.
        target_career: Optional target career path.
        missing_skills: Optional JSON string of missing skills.
        
    Returns:
        JSON response with study materials and learning resources.
    """
    try:
        resume_bytes = await resume.read()
        from app.services.study_materials_generator import generate_learning_resources
        
        import json
        skills_list = json.loads(missing_skills) if missing_skills else []
        
        study_result = generate_learning_resources(
            resume_bytes,
            job_description,
            filename=resume.filename,
            target_career=target_career,
            missing_skills=skills_list
        )
        
        return JSONResponse({
            "success": True,
            "filename": resume.filename,
            "target_career": target_career,
            "learning_resources": study_result.get("learning_resources", []),
            "study_plan": study_result.get("study_plan", ""),
            "recommended_courses": study_result.get("recommended_courses", []),
            "practice_projects": study_result.get("practice_projects", []),
            "certifications": study_result.get("certifications", []),
            "timeline": study_result.get("timeline", "")
        })
        
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": str(e),
                "message": "Failed to generate study materials"
            }
        )
