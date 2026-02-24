"""
User onboarding and questionnaire endpoints
"""

import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from supabase_client import supabase
from .routes_user import get_current_user

router = APIRouter()


@router.post("/save-questionnaire")
async def save_questionnaire(
    user_id: str,
    questionnaire_data: dict,
    current_user=Depends(get_current_user)
):
    """
    Save user questionnaire answers.
    Requires a valid Bearer token. The token's user id must match user_id.
    
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
    # Ownership check — token user must match the user_id being written
    if current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Forbidden: cannot modify another user's data")

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
async def skip_questionnaire(
    user_id: str,
    current_user=Depends(get_current_user)
):
    """
    Mark questionnaire as skipped for a user.
    Requires a valid Bearer token. The token's user id must match user_id.

    Sets questionnaire_answered=True so that routing logic (AuthCallback,
    email login check) treats this user as having completed onboarding and
    does NOT redirect them back to /onboarding on every future login.

    questionnaire_answers is left as NULL to distinguish a skipped user
    from one who actually answered — features that rely on answers (e.g.
    study planner) should check for a null answers field.

    Args:
        user_id: The user ID

    Returns:
        Success response
    """
    # Ownership check — token user must match the user_id being written
    if current_user.id != user_id:
        raise HTTPException(status_code=403, detail="Forbidden: cannot modify another user's data")

    try:
        result = supabase.table("user").update({
            "questionnaire_answered": True,   # treat skip as onboarding complete
            "questionnaire_answers": None      # null = skipped (no answers stored)
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
