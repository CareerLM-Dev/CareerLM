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

from app.agents.interview.graph import (
    question_generation_workflow,
    feedback_generation_workflow
)
from app.agents.interview.state import InterviewState
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
    difficulty: Optional[str] = "medium"  # easy, medium, hard — controls depth, not count
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
    except HTTPException:
        raise
    except Exception as e:
        error_text = str(e).lower()
        network_markers = [
            "handshake operation timed out",
            "ssl",
            "timed out",
            "connection",
            "dns",
            "temporary failure",
            "name or service not known",
            "network is unreachable",
            "connection reset",
            "connection refused",
        ]

        if any(marker in error_text for marker in network_markers):
            logger.warning(f"Auth provider connectivity issue: {str(e)}")
            raise HTTPException(
                status_code=503,
                detail="Authentication service temporarily unavailable. Please retry.",
            )

        raise HTTPException(status_code=401, detail=f"Authentication failed: {str(e)}")


async def get_user_resume_data(user_id: str):
    """Retrieve latest resume data for a user"""
    try:
        parser = get_parser()

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

        profile_result = (
            supabase.table("user")
            .select("user_profile")
            .eq("id", user_id)
            .limit(1)
            .execute()
        )
        profile_data = profile_result.data[0].get("user_profile") if profile_result.data else {}
        if isinstance(profile_data, str):
            try:
                profile_data = json.loads(profile_data)
            except Exception:
                profile_data = {}

        sections = profile_data.get("resume_parsed_sections") if isinstance(profile_data, dict) else {}
        resume_text = profile_data.get("resume_text") if isinstance(profile_data, dict) else ""

        if not resume_text and sections:
            resume_text = parser.build_resume_text_from_sections(sections)

        filename = "resume.pdf"

        if not resume_text and not sections:
            version_result = supabase.table("resume_versions")\
                .select("content, raw_file_path")\
                .eq("resume_id", resume_record["resume_id"])\
                .order("version_number", desc=True)\
                .limit(1)\
                .execute()

            if not version_result.data:
                logger.warning(f"No versions found for resume {resume_record['resume_id']}")
                return None

            version_data = version_result.data[0]
            content = version_data.get("content")
            if isinstance(content, str):
                content = json.loads(content)

            sections = content.get("sections", {}) if content else {}
            resume_text = content.get("resume_text") or parser.build_resume_text_from_sections(sections)
            filename = version_data.get("raw_file_path", "resume.pdf")
        else:
            latest_file = (
                supabase.table("resume_versions")
                .select("raw_file_path")
                .eq("resume_id", resume_record["resume_id"])
                .order("version_number", desc=True)
                .limit(1)
                .execute()
            )
            if latest_file.data:
                filename = latest_file.data[0].get("raw_file_path", "resume.pdf")

        logger.info(
            f"Retrieved resume data: {filename}, text length: {len(resume_text)}, sections: {list(sections.keys()) if isinstance(sections, dict) else []}"
        )

        return {
            "resume_id": resume_record["resume_id"],
            "resume_text": (resume_text or "").strip(),
            "sections": sections or {},
            "filename": filename,
        }
        
    except Exception as e:
        logger.error(f"Error fetching resume data: {str(e)}")
        return None


async def get_previously_asked_questions(user_id: str, target_role: str) -> List[str]:
    """Fetch questions from the most recent interview session for this user/role."""
    try:
        normalized_target = (target_role or "").strip()
        if not normalized_target:
            return []

        result = supabase.table("interview_sessions")\
            .select("target_role, interview_report")\
            .eq("user_id", user_id)\
            .eq("target_role", normalized_target)\
            .order("created_at", desc=True)\
            .limit(1)\
            .execute()

        if not result.data:
            return []

        row = result.data[0]
        interview_report = row.get("interview_report") or {}
        if isinstance(interview_report, str):
            try:
                interview_report = json.loads(interview_report)
            except Exception:
                interview_report = {}

        if not isinstance(interview_report, dict):
            return []

        collected_questions: List[str] = []
        seen = set()

        questions = interview_report.get("questions") or []
        if isinstance(questions, list):
            for item in questions:
                question_text = ""
                if isinstance(item, dict):
                    question_text = str(item.get("question") or "").strip()
                elif isinstance(item, str):
                    question_text = item.strip()

                if question_text:
                    normalized = question_text.lower()
                    if normalized not in seen:
                        seen.add(normalized)
                        collected_questions.append(question_text)

        question_breakdown = interview_report.get("analysis", {}).get("question_breakdown", [])
        if isinstance(question_breakdown, list):
            for item in question_breakdown:
                if not isinstance(item, dict):
                    continue
                question_text = str(item.get("question") or "").strip()
                if question_text:
                    normalized = question_text.lower()
                    if normalized not in seen:
                        seen.add(normalized)
                        collected_questions.append(question_text)

        return collected_questions

    except Exception as e:
        logger.warning(f"Failed to fetch previous interview questions: {str(e)}")
        return []


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
        previous_questions = await get_previously_asked_questions(request.user_id, request.target_role)
        
        # Generate questions using workflow
        input_state: InterviewState = {
            "resume_text": resume_data["resume_text"],
            "resume_sections": resume_data["sections"],
            "target_role": request.target_role,
            "difficulty": request.difficulty,
            "user_skills": [],
            "previous_questions": previous_questions,
            "mode": "questions"
        }
        
        workflow_result = await question_generation_workflow.ainvoke(input_state)
        questions = workflow_result.get("questions_generated", [])
        is_valid = bool(workflow_result.get("is_valid", False))
        validation_error = workflow_result.get("validation_error", "")

        if not is_valid:
            raise HTTPException(
                status_code=500,
                detail=validation_error or "Question generation validation failed"
            )
        
        # Validate that questions were actually generated
        if not questions:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to generate questions: {validation_error}"
            )
        
        # Create interview session record (without questions column - stored in interview_report on feedback)
        session_data = {
            "user_id": request.user_id,
            "resume_id": resume_data["resume_id"],
            "target_role": request.target_role,
            "difficulty": request.difficulty,
            "interview_report": {
                "questions": questions,
                "answers": [],
                "analysis": {}
            },
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
            "questions": questions,
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
        
        logger.info(f"Generating feedback for user {request.user_id}")
        
        # Get resume text if not provided
        resume_text = request.resume_text
        if not resume_text:
            resume_data = await get_user_resume_data(request.user_id)
            resume_text = resume_data["resume_text"] if resume_data else ""
        
        # Generate feedback using workflow
        input_state: InterviewState = {
            "questions": request.questions,
            "answers": request.answers,
            "target_role": request.target_role,
            "resume_text": resume_text,
            "resume_sections": {},
            "mode": "feedback"
        }
        
        workflow_result = await feedback_generation_workflow.ainvoke(input_state)
        workflow_error = workflow_result.get("error")
        feedback_json = workflow_result.get("feedback_json")

        if workflow_error:
            logger.error(f"Feedback workflow error: {workflow_error}")
            raise HTTPException(status_code=500, detail=str(workflow_error))

        if not feedback_json or not isinstance(feedback_json, dict):
            logger.error("Feedback workflow returned empty or invalid JSON")
            raise HTTPException(status_code=500, detail="Feedback generation returned an empty report. Please retry.")
        
        # Store interview session in database (optional)
        try:
            difficulty = request.difficulty or "medium"
            user_details = {
                "id": getattr(user, "id", None),
                "email": getattr(user, "email", None),
                "user_metadata": getattr(user, "user_metadata", None)
            }

            session_data = {
                "user_id": request.user_id,
                "target_role": request.target_role,
                "difficulty": difficulty,
                "interview_report": {
                    "questions": request.questions,
                    "answers": request.answers,
                    "analysis": feedback_json
                },
                "user_details": user_details,
                "created_at": datetime.utcnow().isoformat()
            }
            
            supabase.table("interview_sessions")\
                .insert(session_data)\
                .execute()
        except Exception as db_error:
            logger.warning(f"Failed to store interview session in DB: {str(db_error)}")
        
        return {
            "success": True,
            "feedback": feedback_json,
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
        # Fetch interview session history
        result = supabase.table("interview_sessions")\
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
