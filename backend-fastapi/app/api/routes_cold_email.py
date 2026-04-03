"""
API routes for cold email generation
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
from app.api.routes_user import get_current_user
from app.services.cold_email_generator import generate_cold_email
from app.services.resume_parser import get_parser
from supabase_client import supabase
import logging
import json
import re

from langchain_core.messages import HumanMessage, SystemMessage
from app.agents.llm_config import RESUME_LLM

router = APIRouter()
logger = logging.getLogger(__name__)


class ColdEmailRequest(BaseModel):
    outreach_type: Optional[str] = None  # referral, recruiter, alumni, internship
    form_data: Optional[dict] = None  # Dynamic fields based on outreach type
    tone: Optional[str] = "professional"  # professional or casual
    format: Optional[str] = "email"  # email or message
    # Legacy fields for backward compatibility
    target_company: Optional[str] = None
    target_role: Optional[str] = None
    job_description: Optional[str] = None
    template_subject: Optional[str] = None
    template_body: Optional[str] = None


class SaveColdEmailRequest(BaseModel):
    subject: str
    body: str


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
        # Handle new structure with outreach_type or fall back to legacy
        if request.outreach_type and request.form_data:
            # New structure
            outreach_type = request.outreach_type
            form_data = request.form_data
            tone = request.tone or "professional"
            format_type = request.format or "email"
            
            # Extract fields based on outreach type
            if outreach_type == "referral":
                target_company = form_data.get("companyName", "")
                target_role = form_data.get("targetRole", "")
                recipient_name = form_data.get("recipientName", "")
                recipient_position = form_data.get("recipientPosition", "")
                mutual_connection = form_data.get("mutualConnection", "")
            elif outreach_type == "recruiter":
                target_company = form_data.get("companyName", "")
                target_role = form_data.get("targetRole", "")
                recipient_name = form_data.get("recipientName", "")
                team_domain = form_data.get("teamDomain", "")
                company_reason = form_data.get("companyReason", "")
            elif outreach_type == "alumni":
                recipient_name = form_data.get("recipientName", "")
                recipient_role = form_data.get("recipientRole", "")
                recipient_company = form_data.get("recipientCompany", "")
                reachout_reason = form_data.get("reachoutReason", "")
                target_company = recipient_company
                target_role = ""
        else:
            # Legacy structure
            outreach_type = "general"
            tone = "professional"
            format_type = "email"
            target_company = request.target_company
            target_role = request.target_role
            form_data = {}
        
        logger.info(f"Fetching resume profile for user: {user.id}")

        parser = get_parser()
        user_name = ""
        user_profile = {}

        try:
            profile_result = (
                supabase.table("user")
                .select("name, user_profile")
                .eq("id", user.id)
                .single()
                .execute()
            )
            if profile_result.data:
                user_name = (profile_result.data.get("name") or "").strip()
                user_profile = profile_result.data.get("user_profile") or {}
                if isinstance(user_profile, str):
                    try:
                        user_profile = json.loads(user_profile)
                    except Exception:
                        user_profile = {}
        except Exception:
            user_name = ""
            user_profile = {}

        if not user_name:
            user_name = user.email.split("@")[0].replace(".", " ").title()

        sections = user_profile.get("resume_parsed_sections") or {}
        resume_text = user_profile.get("resume_text") or parser.build_resume_text_from_sections(sections)
        projects_section = sections.get("projects", "") if isinstance(sections, dict) else ""
        experience_section = sections.get("experience", "") if isinstance(sections, dict) else ""

        skills_text = ""
        if isinstance(user_profile, dict):
            skills_text = user_profile.get("skills") or ""
        if not skills_text and isinstance(sections, dict):
            skills_text = sections.get("skills", "")

        user_skills = parser.parse_skills_list(skills_text) if skills_text else []

        if not resume_text and not sections and not user_skills:
            # Legacy fallback to resume_versions when profile data is missing.
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

            latest_version = supabase.table("resume_versions")\
                .select("content")\
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
            content = json.loads(version_data["content"]) if isinstance(version_data["content"], str) else version_data["content"]
            sections = content.get("sections", {}) if content else {}
            resume_text = content.get("resume_text") or parser.build_resume_text_from_sections(sections)
            projects_section = sections.get("projects", "") if isinstance(sections, dict) else ""
            experience_section = sections.get("experience", "") if isinstance(sections, dict) else ""

            skills_text = sections.get("skills", "") if isinstance(sections, dict) else ""
            user_skills = parser.parse_skills_list(skills_text) if skills_text else []

        logger.info(f"Found resume with {len(user_skills)} skills and {len(projects_section)} chars of projects")
        
        # Generate cold email using actual resume data
        result = await generate_cold_email(
            user_name=user_name,
            user_skills=user_skills,
            target_company=target_company,
            target_role=target_role,
            job_description=request.job_description,
            user_experience=experience_section[:200] if experience_section else None,  # Brief summary
            resume_text=resume_text,
            projects_section=projects_section,
            template_subject=request.template_subject,
            template_body=request.template_body,
            outreach_type=outreach_type,
            tone=tone,
            format_type=format_type,
            form_data=form_data
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


@router.get("/saved")
async def list_saved_cold_emails(user=Depends(get_current_user)):
    try:
        result = (
            supabase.table("cold_email_templates")
            .select("id, subject, body, created_at")
            .eq("user_id", user.id)
            .order("created_at", desc=True)
            .execute()
        )
        return {"success": True, "data": result.data or []}
    except Exception as e:
        logger.error(f"Failed to list saved cold emails: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/saved")
async def save_cold_email_template(
    request: SaveColdEmailRequest,
    user=Depends(get_current_user)
):
    try:
        existing = (
            supabase.table("cold_email_templates")
            .select("id")
            .eq("user_id", user.id)
            .execute()
        )
        if existing.data and len(existing.data) >= 5:
            raise HTTPException(
                status_code=400,
                detail="You can save up to 5 emails. Remove one to save another.",
            )

        payload = {
            "user_id": user.id,
            "subject": request.subject.strip()[:120] if request.subject else "",
            "body": request.body.strip() if request.body else "",
        }

        result = (
            supabase.table("cold_email_templates")
            .insert(payload)
            .execute()
        )

        return {"success": True, "data": result.data[0] if result.data else payload}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to save cold email template: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/saved/{template_id}")
async def delete_cold_email_template(
    template_id: str,
    user=Depends(get_current_user)
):
    try:
        result = (
            supabase.table("cold_email_templates")
            .delete()
            .eq("id", template_id)
            .eq("user_id", user.id)
            .execute()
        )

        if not result.data:
            raise HTTPException(status_code=404, detail="Template not found")

        return {"success": True, "data": result.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete cold email template: {e}")
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
