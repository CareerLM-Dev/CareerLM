# app/routes/resume.py (or wherever your router is)
import io
import json
import logging
from datetime import datetime
from fastapi import APIRouter, UploadFile, File, Form
from fastapi.responses import JSONResponse

# Setup logging
logger = logging.getLogger(__name__)

# Import centralized parser
from app.services.resume_parser import ResumeParser, get_parser

# Import service modules
from app.services.resume_optimizer import optimize_resume_logic, extract_text_from_pdf, parse_resume_sections

# Import Supabase client
from supabase_client import supabase

router = APIRouter()


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
    
    # 1️⃣ Extract raw text
    resume_bytes = await resume.read()
    resume_text = extract_text_from_pdf(resume_bytes)

    # 2️⃣ Parse structured sections
    sections = parse_resume_sections(resume_text)

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
        
        from app.services.resume_parser import ResumeParser
        from app.agents.skill_gap import analyze_skill_gap
        
        # Parse resume to extract text
        logger.info("Parsing resume text from PDF")
        parser = ResumeParser()
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
