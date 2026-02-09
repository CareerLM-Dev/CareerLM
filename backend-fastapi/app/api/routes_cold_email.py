"""
API routes for cold email generation
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional
from app.api.routes_user import get_current_user
from app.services.cold_email_generator import generate_cold_email
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


class ColdEmailRequest(BaseModel):
    user_name: str
    user_skills: List[str]
    target_company: str
    target_role: str
    job_description: Optional[str] = None
    user_experience: Optional[str] = None


@router.post("/generate")
async def create_cold_email(
    request: ColdEmailRequest,
    user=Depends(get_current_user)
):
    """Generate a personalized cold email for job application"""
    try:
        result = await generate_cold_email(
            user_name=request.user_name,
            user_skills=request.user_skills,
            target_company=request.target_company,
            target_role=request.target_role,
            job_description=request.job_description,
            user_experience=request.user_experience
        )
        
        if not result.get("success"):
            raise HTTPException(
                status_code=500,
                detail=result.get("error", "Failed to generate email")
            )
        
        return {
            "success": True,
            "email": result.get("email", {}),
            "research_notes": result.get("research_notes")
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Cold email generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
