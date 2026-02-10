"""
Service for generating cold emails
"""

from typing import Dict, List, Optional
from app.agents.cold_email.graph import cold_email_workflow
from app.agents.cold_email.state import ColdEmailState
import logging

logger = logging.getLogger(__name__)


async def generate_cold_email(
    user_name: str,
    user_skills: List[str],
    target_company: str,
    target_role: str,
    job_description: Optional[str] = None,
    user_experience: Optional[str] = None,
    resume_text: Optional[str] = None,
    projects_section: Optional[str] = None
) -> Dict:
    """
    Generate a personalized cold email using actual resume content
    
    Args:
        user_name: User's name
        user_skills: List of user's skills
        target_company: Company name
        target_role: Job role/title
        job_description: Optional job description
        user_experience: Optional brief experience summary
        resume_text: Optional full resume text content
        projects_section: Optional parsed projects section from resume
        
    Returns:
        Dictionary with subject, body, and metadata
    """
    try:
        # Initialize state
        initial_state: ColdEmailState = {
            "user_name": user_name,
            "user_skills": user_skills,
            "user_experience": user_experience,
            "target_company": target_company,
            "target_role": target_role,
            "job_description": job_description,
            "company_info": None,
            "resume_text": resume_text,
            "projects_section": projects_section,
            "email_subject": None,
            "email_body": None,
            "personalization_notes": None,
            "error": None
        }
        
        # Run workflow
        logger.info(f"Generating cold email for {target_role} at {target_company}")
        result = cold_email_workflow.invoke(initial_state)
        
        if result.get("error"):
            return {
                "success": False,
                "error": result["error"]
            }
        
        return {
            "success": True,
            "email": {
                "subject": result.get("email_subject", "Job Application"),
                "body": result.get("email_body", "")
            },
            "research_notes": result.get("personalization_notes")
        }
        
    except Exception as e:
        logger.error(f"Cold email generation failed: {e}")
        return {
            "success": False,
            "error": str(e)
        }
