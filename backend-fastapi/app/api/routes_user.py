# app/api/v1/routes_user.py
from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime
from supabase_client import supabase
import json
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


class QuestionnaireUpdate(BaseModel):
    questionnaire_answers: Dict[str, Any]

async def get_current_user(authorization: Optional[str] = Header(None)):
    """Extract user from JWT token"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    token = authorization.replace("Bearer ", "")
    
    try:
        # Verify token with Supabase
        user = supabase.auth.get_user(token)
        if not user or not user.user:
            raise HTTPException(status_code=401, detail="Invalid token")
        return user.user
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Authentication failed: {str(e)}")

@router.get("/history")
async def get_resume_history(
    user = Depends(get_current_user),
    limit: int = 50,
    offset: int = 0
):
    """Get user's resume testing history from resume_versions"""
    try:
        # Get all resumes for this user
        user_resumes = supabase.table("resumes")\
            .select("resume_id")\
            .eq("user_id", user.id)\
            .execute()
        
        if not user_resumes.data:
            return {
                "success": True,
                "data": [],
                "count": 0
            }
        
        resume_ids = [r["resume_id"] for r in user_resumes.data]
        
        # Get all versions for these resumes
        result = supabase.table("resume_versions")\
            .select("*, resumes!inner(user_id)")\
            .in_("resume_id", resume_ids)\
            .order("updated_at", desc=True)\
            .range(offset, offset + limit - 1)\
            .execute()
        
        # Parse and format the data
        formatted_data = []
        for item in result.data:
            content = json.loads(item["content"]) if isinstance(item["content"], str) else (item["content"] or {})
            
            # Parse skill_gap column (new) or fall back to content.careerAnalysis (old)
            skill_gap = None
            if item.get("skill_gap"):
                skill_gap = json.loads(item["skill_gap"]) if isinstance(item["skill_gap"], str) else item["skill_gap"]
            career_analysis = skill_gap or content.get("careerAnalysis", {})
            
            # Extract relevant information
            formatted_item = {
                "id": item["version_id"],
                "resume_id": item["resume_id"],
                "version_number": item["version_number"],
                "filename": item.get("raw_file_path", "Unknown"),
                "ats_score": item.get("ats_score"),
                "created_at": item.get("updated_at"),  # Using updated_at for timestamp
                "notes": item.get("notes", "")
            }
            
            # Try to extract additional data from content
            if content:
                formatted_item["job_description"] = item.get("job_description", "")
            
            # Extract career analysis summary
            if career_analysis:
                summary = career_analysis.get("analysis_summary", {})
                formatted_item["best_career_match"] = summary.get("best_match")
                formatted_item["match_probability"] = summary.get("best_match_probability")
                formatted_item["total_skills_found"] = career_analysis.get("total_skills_found")
            
            formatted_data.append(formatted_item)
        
        return {
            "success": True,
            "data": formatted_data,
            "count": len(formatted_data)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch history: {str(e)}")

@router.get("/history/{version_id}")
async def get_history_item(
    version_id: str,
    user = Depends(get_current_user)
):
    """Get a specific resume version"""
    try:
        result = supabase.table("resume_versions")\
            .select("*, resumes!inner(user_id)")\
            .eq("version_id", version_id)\
            .execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="History item not found")
        
        item = result.data[0]
        
        # Verify user owns this resume
        if item["resumes"]["user_id"] != user.id:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Parse content, resume_analysis, and skill_gap columns
        content = json.loads(item["content"]) if isinstance(item["content"], str) else (item["content"] or {})
        
        resume_analysis = None
        if item.get("resume_analysis"):
            resume_analysis = json.loads(item["resume_analysis"]) if isinstance(item["resume_analysis"], str) else item["resume_analysis"]
        
        skill_gap = None
        if item.get("skill_gap"):
            skill_gap = json.loads(item["skill_gap"]) if isinstance(item["skill_gap"], str) else item["skill_gap"]
        
        # Merge back into a single object for frontend compatibility
        merged_content = {**content}
        if resume_analysis:
            merged_content["ats_score"] = resume_analysis.get("ats_score")
            merged_content["ats_analysis"] = resume_analysis.get("ats_analysis")
            merged_content["analysis"] = resume_analysis.get("analysis")
            merged_content["agentic_metadata"] = resume_analysis.get("agentic_metadata")
        if skill_gap:
            merged_content["careerAnalysis"] = skill_gap
        
        return {
            "success": True,
            "data": {
                "id": item["version_id"],
                "resume_id": item["resume_id"],
                "version_number": item["version_number"],
                "content": merged_content,
                "ats_score": item.get("ats_score"),
                "filename": item.get("raw_file_path"),
                "notes": item.get("notes"),
                "created_at": item.get("updated_at")  # Using updated_at for timestamp
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch history item: {str(e)}")

@router.get("/resume-text/{version_id}")
async def get_resume_text(
    version_id: str,
    user = Depends(get_current_user)
):
    """Get the full resume text and parsed sections for a specific version"""
    try:
        # Get the version from database
        result = supabase.table("resume_versions")\
            .select("resume_text, content, raw_file_path, resumes!inner(user_id)")\
            .eq("version_id", version_id)\
            .execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Resume version not found")
        
        item = result.data[0]
        
        # Verify user owns this resume
        if item["resumes"]["user_id"] != user.id:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Get resume text from dedicated column (new structure)
        resume_text = item.get("resume_text", "")
        
        # Parse content for sections
        content = json.loads(item["content"]) if isinstance(item["content"], str) else item["content"]
        sections = content.get("sections", {})
        
        # Fallback to old structure if resume_text column is empty
        if not resume_text and "resume_text" in content:
            resume_text = content["resume_text"]
        
        return {
            "success": True,
            "data": {
                "resume_text": resume_text,
                "sections": sections,
                "filename": item.get("raw_file_path", "Resume")
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch resume text: {str(e)}")


@router.delete("/history/{version_id}")
async def delete_history_item(
    version_id: str,
    user = Depends(get_current_user)
):
    """Delete a resume version"""
    try:
        # First verify ownership
        result = supabase.table("resume_versions")\
            .select("*, resumes!inner(user_id)")\
            .eq("version_id", version_id)\
            .execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="History item not found")
        
        if result.data[0]["resumes"]["user_id"] != user.id:
            raise HTTPException(status_code=403, detail="Access denied")
        
        # Delete the version
        supabase.table("resume_versions")\
            .delete()\
            .eq("version_id", version_id)\
            .execute()
        
        return {
            "success": True,
            "message": "History item deleted successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete history item: {str(e)}")

@router.get("/profile")
async def get_user_profile(user = Depends(get_current_user)):
    """Get current user profile"""
    return {
        "success": True,
        "user": {
            "id": user.id,
            "email": user.email,
            "created_at": user.created_at
        }
    }


@router.get("/profile-details")
async def get_profile_details(user = Depends(get_current_user)):
    """Get current user profile details stored in the user table."""
    try:
        result = supabase.table("user").select(
            "id, name, email, status, current_company, questionnaire_answered, questionnaire_answers"
        ).eq("id", user.id).single().execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="User not found")

        return {
            "success": True,
            "data": result.data
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch profile: {str(e)}")


@router.patch("/profile-questionnaire")
async def update_profile_questionnaire(
    payload: QuestionnaireUpdate,
    user = Depends(get_current_user)
):
    """Update questionnaire answers for the current user."""
    try:
        if not isinstance(payload.questionnaire_answers, dict):
            raise HTTPException(status_code=400, detail="Invalid questionnaire payload")

        update_data = {
            "questionnaire_answers": payload.questionnaire_answers,
            "questionnaire_answered": bool(payload.questionnaire_answers)
        }

        result = supabase.table("user").update(update_data).eq("id", user.id).execute()

        if not result.data:
            raise HTTPException(status_code=400, detail="Failed to update questionnaire")

        return {
            "success": True,
            "data": update_data
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update questionnaire: {str(e)}")
