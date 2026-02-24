# app/agents/interview/generator.py
"""
Mock Interview Generator - Compatibility Facade
Routes to graph workflows for question generation and feedback

This module provides the original function signatures for backward compatibility
while delegating to the new graph-based architecture (state.py, nodes.py, graph.py)
"""

import logging
from typing import Dict, Any, List, Optional
from .graph import question_generation_workflow, feedback_generation_workflow
from .state import InterviewState

logger = logging.getLogger(__name__)


def generate_interview_questions(
    resume_text: str,
    resume_sections: dict,
    target_role: str,
    difficulty: str = "medium",
    user_skills: list = None
) -> dict:
    """
    Generate structured interview questions based on user context and difficulty.
    
    FACADE: Routes to question_generation_workflow
    
    Question count by difficulty:
    - Easy: 5 questions total (2 Resume, 2 Project, 1 Technical)
    - Medium: 10 questions total (2 Resume, 3 Project, 3 Technical, 1 System Design, 1 Behavioral)
    - Hard: 15 questions total (3 Resume, 4 Project, 4 Technical, 2 System Design, 2 Behavioral)
    
    Args:
        resume_text: Full resume text
        resume_sections: Parsed sections dict
        target_role: Target job role
        difficulty: Difficulty level (easy/medium/hard)
        user_skills: List of user's skills
        
    Returns:
        dict with questions array
        
    Raises:
        ValueError: If validation fails
        RuntimeError: If generation fails
    """
    logger.info(f"generate_interview_questions called: role={target_role}, difficulty={difficulty}")
    
    try:
        # Build input state
        input_state: InterviewState = {
            "resume_text": resume_text,
            "resume_sections": resume_sections,
            "target_role": target_role,
            "difficulty": difficulty,
            "user_skills": user_skills or [],
            "mode": "questions"
        }
        
        # Execute workflow
        result = question_generation_workflow.invoke(input_state)
        
        # Extract and return questions in original format
        questions = result.get("questions_generated", [])
        
        logger.info(f"Generated {len(questions)} questions successfully")
        
        return {
            "questions": questions
        }
        
    except ValueError as e:
        logger.error(f"Validation error in question generation: {str(e)}")
        raise
    except Exception as e:
        logger.error(f"Workflow error in question generation: {str(e)}")
        raise RuntimeError(f"Question generation failed: {str(e)}")


def generate_feedback_report(
    questions: list,
    answers: list,
    target_role: str,
    resume_text: str
) -> str:
    """
    Generate markdown feedback report based on interview transcript.
    
    FACADE: Routes to feedback_generation_workflow
    
    Args:
        questions: List of question dicts with id, category, question, follow_up_hint
        answers: List of answer texts (same order as questions)
        target_role: Target job role
        resume_text: Original resume text for context
        
    Returns:
        Markdown formatted feedback report
        
    Raises:
        RuntimeError: If feedback generation fails
    """
    logger.info(f"generate_feedback_report called: role={target_role}, questions={len(questions)}")
    
    try:
        # Build input state
        input_state: InterviewState = {
            "questions": questions,
            "answers": answers,
            "target_role": target_role,
            "resume_text": resume_text,
            "resume_sections": {},  # Not needed for feedback
            "mode": "feedback"
        }
        
        # Execute workflow
        result = feedback_generation_workflow.invoke(input_state)
        
        # Extract and return feedback in original format
        feedback = result.get("feedback_report", "")
        
        logger.info("Feedback report generated successfully")
        
        return feedback
        
    except Exception as e:
        logger.error(f"Workflow error in feedback generation: {str(e)}")
        raise RuntimeError(f"Feedback generation failed: {str(e)}")
