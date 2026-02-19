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
import re

from langchain_core.messages import HumanMessage, SystemMessage
from app.agents.llm_config import RESUME_LLM

router = APIRouter()
logger = logging.getLogger(__name__)


class ColdEmailRequest(BaseModel):
    target_company: str
    target_role: str
    job_description: Optional[str] = None


def _clean_extracted_value(value: Optional[str]) -> str:
    if not value:
        return ""
    cleaned = value.strip().strip("-:;,")
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned[:120]


def _extract_company_role_heuristic(job_description: str) -> dict:
    company = ""
    role = ""

    company_patterns = [
        r"\bCompany\s*[:\-]\s*(.+)",
        r"\bEmployer\s*[:\-]\s*(.+)",
        r"\bOrganization\s*[:\-]\s*(.+)",
        r"\bAbout\s+(?:the\s+)?Company\s*[:\-]?\s*(.+)",
    ]

    role_patterns = [
        r"\bRole\s*[:\-]\s*(.+)",
        r"\bTitle\s*[:\-]\s*(.+)",
        r"\bPosition\s*[:\-]\s*(.+)",
        r"\bJob\s*Title\s*[:\-]\s*(.+)",
    ]

    for pattern in company_patterns:
        match = re.search(pattern, job_description, re.IGNORECASE)
        if match:
            company = _clean_extracted_value(match.group(1))
            break

    for pattern in role_patterns:
        match = re.search(pattern, job_description, re.IGNORECASE)
        if match:
            role = _clean_extracted_value(match.group(1))
            break

    if not role:
        match = re.search(
            r"\b(?:seeking|hiring)\s+(?:a|an)\s+(.+?)(?:\.|,|\n|\bat\b)",
            job_description,
            re.IGNORECASE,
        )
        if match:
            role = _clean_extracted_value(match.group(1))

    if not company:
        match = re.search(r"\bat\s+([A-Z][A-Za-z0-9&\.\- ]{2,})", job_description)
        if match:
            company = _clean_extracted_value(match.group(1))

    return {"company": company, "role": role}


def _extract_company_role_llm(job_description: str) -> dict:
    prompt = f"""Extract the company name and role title from this job description.

Return ONLY valid JSON in this format:
{{"company": "", "role": ""}}

Job Description:
{job_description[:2000]}
"""

    response = RESUME_LLM.invoke([
        SystemMessage(content="You extract company and role from job descriptions."),
        HumanMessage(content=prompt),
    ])

    content = response.content.strip()
    json_match = re.search(r"\{.*\}", content, re.DOTALL)
    if not json_match:
        return {"company": "", "role": ""}

    try:
        data = json.loads(json_match.group(0))
    except Exception:
        return {"company": "", "role": ""}

    return {
        "company": _clean_extracted_value(data.get("company")),
        "role": _clean_extracted_value(data.get("role")),
    }


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


@router.get("/prefill")
async def get_cold_email_prefill(user=Depends(get_current_user)):
    """Return latest job description and parsed company/role for cold email autofill."""
    try:
        user_resumes = supabase.table("resumes") \
            .select("resume_id") \
            .eq("user_id", user.id) \
            .execute()

        if not user_resumes.data:
            return {
                "success": True,
                "job_description": None,
                "target_company": "",
                "target_role": "",
            }

        resume_ids = [r["resume_id"] for r in user_resumes.data]

        latest_version = supabase.table("resume_versions") \
            .select("job_description, updated_at") \
            .in_("resume_id", resume_ids) \
            .order("updated_at", desc=True) \
            .limit(1) \
            .execute()

        if not latest_version.data:
            return {
                "success": True,
                "job_description": None,
                "target_company": "",
                "target_role": "",
            }

        job_description = (latest_version.data[0].get("job_description") or "").strip()

        if not job_description:
            return {
                "success": True,
                "job_description": "",
                "target_company": "",
                "target_role": "",
            }

        parsed = _extract_company_role_heuristic(job_description)
        if not parsed.get("company") or not parsed.get("role"):
            llm_parsed = _extract_company_role_llm(job_description)
            parsed = {
                "company": parsed.get("company") or llm_parsed.get("company", ""),
                "role": parsed.get("role") or llm_parsed.get("role", ""),
            }

        return {
            "success": True,
            "job_description": job_description,
            "target_company": parsed.get("company", ""),
            "target_role": parsed.get("role", ""),
        }

    except Exception as e:
        logger.error(f"Cold email prefill error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
