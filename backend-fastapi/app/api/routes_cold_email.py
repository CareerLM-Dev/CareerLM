"""
API routes for cold email generation
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
from app.api.routes_user import get_current_user
from app.services.cold_email_generator import generate_cold_email
from supabase_client import supabase
import logging
import json

router = APIRouter()
logger = logging.getLogger(__name__)


class ColdEmailRequest(BaseModel):
    target_company: str
    target_role: str
    job_description: Optional[str] = None


@router.post("/generate")
async def create_cold_email(
    request: ColdEmailRequest,
    user=Depends(get_current_user)
):
    """Generate a personalized cold email using user's latest resume from database"""
    try:
        # Fetch user's latest resume from database
        logger.info(f"Fetching latest resume for user: {user.id}")
        
        # Get user's resumes
        user_resumes = supabase.table("resumes")\
            .select("resume_id")\
            .eq("user_id", user.id)\
            .execute()
        
        if not user_resumes.data:
            raise HTTPException(
                status_code=404,
                detail="No resume found. Please upload a resume first."
            )
        
        resume_ids = [r["resume_id"] for r in user_resumes.data]
        
        # Get the most recent version
        latest_version = supabase.table("resume_versions")\
            .select("resume_text, content, raw_file_path")\
            .in_("resume_id", resume_ids)\
            .order("updated_at", desc=True)\
            .limit(1)\
            .execute()
        
        if not latest_version.data:
            raise HTTPException(
                status_code=404,
                detail="No resume version found. Please upload a resume first."
            )
        
        version_data = latest_version.data[0]
        
        # Get resume text from dedicated column (new structure)
        resume_text = version_data.get("resume_text", "")
        
        # Parse content for analysis data
        content = json.loads(version_data["content"]) if isinstance(version_data["content"], str) else version_data["content"]
        
        # Fallback to old structure if resume_text column is empty
        if not resume_text and "resume_text" in content:
            resume_text = content["resume_text"]
        
        # Extract data from stored resume
        user_name = user.email.split("@")[0].replace(".", " ").title()  # Fallback name from email
        sections = content.get("sections", {})
        projects_section = sections.get("projects", "")
        experience_section = sections.get("experience", "")
        
        # Extract skills from career analysis
        career_analysis = content.get("careerAnalysis", {})
        user_skills = career_analysis.get("user_skills", [])
        
        if not user_skills:
            # Fallback to extracting from sections
            skills_text = sections.get("skills", "")
            if skills_text:
                from app.services.resume_parser import get_parser
                parser = get_parser()
                user_skills = parser.parse_skills_list(skills_text)
        
        logger.info(f"Found resume with {len(user_skills)} skills and {len(projects_section)} chars of projects")
        
        # Generate cold email using actual resume data
        result = await generate_cold_email(
            user_name=user_name,
            user_skills=user_skills,
            target_company=request.target_company,
            target_role=request.target_role,
            job_description=request.job_description,
            user_experience=experience_section[:200] if experience_section else None,  # Brief summary
            resume_text=resume_text,
            projects_section=projects_section
        )
        
        if not result.get("success"):
            raise HTTPException(
                status_code=500,
                detail=result.get("error", "Failed to generate email")
            )
        
        return {
            "success": True,
            "email": result.get("email", {}),
            "research_notes": result.get("research_notes"),
            "resume_used": version_data.get("raw_file_path", "Latest resume")
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Cold email generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
