"""
User onboarding and questionnaire endpoints
"""

import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from supabase_client import supabase

router = APIRouter()


@router.post("/save-questionnaire")
async def save_questionnaire(
    user_id: str,
    questionnaire_data: dict
):
    """
    Save user questionnaire answers
    
    Args:
        user_id: The user ID
        questionnaire_data: Dictionary with answers
            {
                "target_role": "software_engineer",
                "primary_goal": "get_first_job",
                "learning_preference": "video_tutorials",
                "time_commitment": "20_hours_week"
            }
    
    Returns:
        Success response with saved data
    """
    try:
        # Add timestamp
        data_to_save = {
            **questionnaire_data,
            "completed_at": datetime.utcnow().isoformat()
        }
        
        # Update user record in Supabase
        result = supabase.table("user").update({
            "questionnaire_answered": True,
            "questionnaire_answers": data_to_save
        }).eq("id", user_id).execute()
        
        if not result.data:
            raise HTTPException(
                status_code=400,
                detail="Failed to save questionnaire"
            )
        
        return JSONResponse({
            "success": True,
            "message": "Questionnaire saved successfully",
            "data": data_to_save
        })
        
    except Exception as e:
        print(f"Error saving questionnaire: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to save questionnaire: {str(e)}"
        )


@router.post("/skip-questionnaire")
async def skip_questionnaire(user_id: str):
    """
    Mark questionnaire as skipped for a user
    
    Args:
        user_id: The user ID
    
    Returns:
        Success response
    """
    try:
        result = supabase.table("user").update({
            "questionnaire_answered": False,
            "questionnaire_answers": None
        }).eq("id", user_id).execute()
        
        if not result.data:
            raise HTTPException(
                status_code=400,
                detail="Failed to skip questionnaire"
            )
        
        return JSONResponse({
            "success": True,
            "message": "Questionnaire skipped"
        })
        
    except Exception as e:
        print(f"Error skipping questionnaire: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to skip questionnaire: {str(e)}"
        )


@router.get("/questionnaire/{user_id}")
async def get_questionnaire(user_id: str):
    """
    Get user questionnaire answers
    
    Args:
        user_id: The user ID
    
    Returns:
        User's questionnaire data if exists
    """
    try:
        result = supabase.table("user").select(
            "questionnaire_answered, questionnaire_answers"
        ).eq("id", user_id).single().execute()
        
        if not result.data:
            raise HTTPException(
                status_code=404,
                detail="User not found"
            )
        
        return JSONResponse({
            "success": True,
            "questionnaire_answered": result.data.get("questionnaire_answered", False),
            "questionnaire_answers": result.data.get("questionnaire_answers")
        })
        
    except Exception as e:
        print(f"Error retrieving questionnaire: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve questionnaire: {str(e)}"
        )
