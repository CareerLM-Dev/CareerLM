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
    🤖 AGENTIC Resume Optimization Endpoint
    Uses LangGraph multi-agent system to analyze and optimize resumes
    """
    
    # 1️⃣ Extract raw text using centralized parser
    parser = get_parser()
    resume_bytes = await resume.read()
    resume_text = parser.extract_text(resume_bytes, filename=resume.filename)

    # 2️⃣ Parse structured sections (lowercase keys for ATS compatibility)
    sections = parser.parse_sections(resume_text)

    # 3️⃣ Run AGENTIC optimizer logic (this now uses LangGraph!)
    logger.info(f"Processing resume: {resume.filename}")
    
    analysis_result = optimize_resume_logic(
        resume_bytes, 
        job_description, 
        filename=resume.filename
    )
    
    logger.info(f"ATS Score: {analysis_result.get('ats_score')}/100")
    
    # 3.5️⃣ Run Skill Gap Analysis in parallel
    logger.info("Running skill gap analysis...")
    from app.agents.skill_gap import analyze_skill_gap
    skill_gap_result = analyze_skill_gap(resume_text, filename=resume.filename)
    
    logger.info(f"Skill gap analysis complete. Found {skill_gap_result.get('total_skills_found', 0)} skills")

    # 4️⃣ Build comprehensive result
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
            "structure_suggestions": analysis_result.get("structure_suggestions", []),  # ✅ Only if ATS < 60
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
        
        # 🤖 Agentic Metadata (for debugging/UI)
        "agentic_metadata": {
            "agent_execution_log": analysis_result.get("agent_execution_log", []),
            "total_iterations": analysis_result.get("total_iterations", 0),
            "completed_steps": analysis_result.get("completed_steps", []),
            "is_agentic": analysis_result.get("_agentic", False),
            "version": analysis_result.get("_version", "1.0")
        },
        
        "summary": "",  # Keep for backward compatibility
    }

    # 5️⃣ Insert/Update Supabase
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
    Load cached study materials from Supabase for the current user.
    Returns the most recent cached entry if available.
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
            .limit(1)
            .execute()
        )

        if result.data:
            row = result.data[0]
            return JSONResponse({
                "success": True,
                "cached": True,
                "target_career": row.get("target_career", ""),
                "skill_gap_report": row.get("skill_gap_report", []),
                "study_plan": row.get("study_plan", []),
                "cached_at": row.get("created_at"),
            })
        else:
            return JSONResponse({"success": True, "cached": False})

    except Exception as e:
        logger.warning(f"Failed to load study materials cache: {e}")
        return JSONResponse({"success": True, "cached": False})


@router.post("/generate-study-materials-simple")
async def generate_study_materials_simple(
    target_career: str = Form(...),
    missing_skills: str = Form(...),
    user=Depends(get_current_user_optional),
):
    """
    🤖 AGENTIC Study Planner Endpoint (LangGraph + Gemini Search Grounding)
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

        result = generate_study_plan(target_career, skills_list)

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
        if user:
            try:
                # Delete old cache for this user (keep only latest)
                supabase.table("study_materials_cache") \
                    .delete() \
                    .eq("user_id", user.id) \
                    .execute()

                # Insert new cache entry
                supabase.table("study_materials_cache").insert({
                    "user_id": user.id,
                    "target_career": result.get("target_career", target_career),
                    "skill_gap_report": result.get("skill_gap_report", []),
                    "study_plan": result.get("study_plan", []),
                }).execute()
                logger.info(f"Study materials cached for user {user.id}")
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
