# app/api/v1/routes_user.py
from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from supabase_client import supabase
import json

router = APIRouter()

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
            content = json.loads(item["content"]) if isinstance(item["content"], str) else item["content"]
            
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
                formatted_item["job_description"] = content.get("jobDescription", "")
                
                # Extract career analysis if available
                career_analysis = content.get("careerAnalysis", {})
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
        
        # Parse content
        content = json.loads(item["content"]) if isinstance(item["content"], str) else item["content"]
        
        return {
            "success": True,
            "data": {
                "id": item["version_id"],
                "resume_id": item["resume_id"],
                "version_number": item["version_number"],
                "content": content,
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
