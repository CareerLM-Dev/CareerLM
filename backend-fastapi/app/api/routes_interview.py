# app/api/routes_interview.py
"""
Mock Interview API Routes
Endpoints for generating questions and feedback reports
"""
from fastapi import APIRouter, HTTPException, Depends, Header, Body
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime
import logging
import json

from app.agents.interview.generator import (
    generate_interview_questions,
    generate_feedback_report
)
from app.services.resume_parser import get_parser
from supabase_client import supabase

router = APIRouter()
logger = logging.getLogger(__name__)


# ============ Request/Response Models ============

class GenerateQuestionsRequest(BaseModel):
    user_id: str
    target_role: str
    difficulty: Optional[str] = "medium"  # easy, medium, hard
    resume_id: Optional[str] = None  # If user wants to use existing resume


class QuestionAnswer(BaseModel):
    id: int
    category: str
    question: str
    answer: str


class GenerateFeedbackRequest(BaseModel):
    user_id: str
    target_role: str
    questions: List[Dict[str, Any]]
    answers: List[str]
    resume_text: Optional[str] = None


# ============ Helper Functions ============

async def get_current_user(authorization: Optional[str] = Header(None)):
    """Extract user from JWT token"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    token = authorization.replace("Bearer ", "")
    
    try:
        user = supabase.auth.get_user(token)
        if not user or not user.user:
            raise HTTPException(status_code=401, detail="Invalid token")
        return user.user
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Authentication failed: {str(e)}")


async def get_user_resume_data(user_id: str):
    """Retrieve latest resume data for a user"""
    try:
        # Get user's most recent resume
        result = supabase.table("resumes")\
            .select("resume_id, user_id")\
            .eq("user_id", user_id)\
            .order("latest_update", desc=True)\
            .limit(1)\
            .execute()
        
        if not result.data:
            logger.warning(f"No resume found for user {user_id}")
            return None
        
        resume_record = result.data[0]
        
        # Get latest version of this resume
        version_result = supabase.table("resume_versions")\
            .select("content, resume_text, raw_file_path")\
            .eq("resume_id", resume_record["resume_id"])\
            .order("version_number", desc=True)\
            .limit(1)\
            .execute()
        
        if not version_result.data:
            logger.warning(f"No versions found for resume {resume_record['resume_id']}")
            return None
        
        version_data = version_result.data[0]
        
        # Parse content
        content = version_data.get("content")
        if isinstance(content, str):
            content = json.loads(content)
        
        # Extract resume text and sections
        resume_text = version_data.get("resume_text", "")
        sections = content.get("sections", {}) if content else {}
        filename = version_data.get("raw_file_path", "resume.pdf")
        
        logger.info(f"Retrieved resume data: {filename}, text length: {len(resume_text)}, sections: {list(sections.keys())}")
        
        return {
            "resume_id": resume_record["resume_id"],
            "resume_text": resume_text,
            "sections": sections,
            "filename": filename
        }
        
    except Exception as e:
        logger.error(f"Error fetching resume data: {str(e)}")
        return None


# ============ API Endpoints ============

@router.post("/generate-questions")
async def generate_questions(
    request: GenerateQuestionsRequest,
    user = Depends(get_current_user)
):
    """
    Generate 15 structured interview questions based on user's resume and target role.
    
    Returns:
        {
            "success": true,
            "questions": [...],
            "session_id": "uuid"
        }
    """
    try:
        # Verify user authorization
        if user.id != request.user_id:
            raise HTTPException(status_code=403, detail="Unauthorized access")
        
        # Get user's resume data
        resume_data = await get_user_resume_data(request.user_id)
        
        if not resume_data:
            raise HTTPException(
                status_code=404,
                detail="No resume found. Please upload a resume first."
            )
        
        logger.info(f"Generating questions for user {request.user_id}, role: {request.target_role}")
        
        # Generate questions using Groq
        result = generate_interview_questions(
            resume_text=resume_data["resume_text"],
            resume_sections=resume_data["sections"],
            target_role=request.target_role,
            difficulty=request.difficulty,
            user_skills=None  # Can be extracted from sections if needed
        )
        
        # Create interview session record
        session_data = {
            "user_id": request.user_id,
            "resume_id": resume_data["resume_id"],
            "target_role": request.target_role,
            "questions": result["questions"],
            "status": "in_progress",
            "created_at": datetime.utcnow().isoformat()
        }
        
        # Store session in database (optional - can be used for history)
        try:
            session_result = supabase.table("interview_sessions")\
                .insert(session_data)\
                .execute()
            
            session_id = session_result.data[0]["id"] if session_result.data else None
        except Exception as db_error:
            logger.warning(f"Failed to store session in DB: {str(db_error)}")
            session_id = None
        
        return {
            "success": True,
            "questions": result["questions"],
            "session_id": session_id,
            "resume_filename": resume_data["filename"]
        }
        
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"Question generation error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/generate-feedback")
async def generate_feedback(
    request: GenerateFeedbackRequest,
    user = Depends(get_current_user)
):
    """
    Generate feedback report based on interview transcript.
    
    Returns:
        {
            "success": true,
            "feedback": "markdown report",
            "timestamp": "iso datetime"
        }
    """
    try:
        # Verify user authorization
        if user.id != request.user_id:
            raise HTTPException(status_code=403, detail="Unauthorized access")
        
        # Validate input
        if len(request.questions) != len(request.answers):
            raise HTTPException(
                status_code=400,
                detail="Number of questions and answers must match"
            )
        
        # Validate question count (5 for easy, 10 for medium, 15 for hard)
        valid_counts = [5, 10, 15]
        if len(request.questions) not in valid_counts:
            raise HTTPException(
                status_code=400,
                detail=f"Expected 5, 10, or 15 questions based on difficulty level, got {len(request.questions)}"
            )
        
        logger.info(f"Generating feedback for user {request.user_id}")
        
        # Get resume text if not provided
        resume_text = request.resume_text
        if not resume_text:
            resume_data = await get_user_resume_data(request.user_id)
            resume_text = resume_data["resume_text"] if resume_data else ""
        
        # Generate feedback using Groq
        feedback_report = generate_feedback_report(
            questions=request.questions,
            answers=request.answers,
            target_role=request.target_role,
            resume_text=resume_text
        )
        
        # Store feedback in database (optional)
        try:
            feedback_data = {
                "user_id": request.user_id,
                "target_role": request.target_role,
                "transcript": {
                    "questions": request.questions,
                    "answers": request.answers
                },
                "feedback_report": feedback_report,
                "created_at": datetime.utcnow().isoformat()
            }
            
            supabase.table("interview_feedback")\
                .insert(feedback_data)\
                .execute()
        except Exception as db_error:
            logger.warning(f"Failed to store feedback in DB: {str(db_error)}")
        
        return {
            "success": True,
            "feedback": feedback_report,
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Feedback generation error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/history")
async def get_interview_history(
    user = Depends(get_current_user),
    limit: int = 10
):
    """
    Get user's interview history (past sessions and feedback).
    
    Returns:
        {
            "success": true,
            "sessions": [...],
            "count": int
        }
    """
    try:
        # Fetch interview feedback history
        result = supabase.table("interview_feedback")\
            .select("*")\
            .eq("user_id", user.id)\
            .order("created_at", desc=True)\
            .limit(limit)\
            .execute()
        
        return {
            "success": True,
            "sessions": result.data if result.data else [],
            "count": len(result.data) if result.data else 0
        }
        
    except Exception as e:
        logger.error(f"Error fetching interview history: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
