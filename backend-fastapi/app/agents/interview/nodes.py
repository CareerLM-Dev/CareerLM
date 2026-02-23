"""
Interview workflow nodes
Contains all business logic for question generation and feedback
"""

from typing import Dict, Any
import logging

from app.services.interview.prompts import (
    build_feedback_generation_prompt,
    build_question_generation_prompt,
)
from app.services.interview.recovery import (
    recover_feedback_from_error,
    recover_questions_from_error,
)
from app.services.interview.schemas import FeedbackOutput, QuestionList
from app.services.interview.transcript import build_transcript_and_metrics
from app.services.interview.utils import truncate_natural

from .state import InterviewState

try:
    from app.agents.llm_config import INTERVIEW_LLM  # type: ignore
except ImportError:
    from app.agents.llm_config import RESUME_LLM as INTERVIEW_LLM

logger = logging.getLogger(__name__)


# ===== CONSTANTS =====
DIFFICULTY_GUIDANCE = {
    "easy": "Use beginner-friendly, practical questions suitable for junior/entry-level developers. Avoid edge cases, trick questions, and overly deep system internals.",
    "medium": "Use accessible foundational-to-intermediate questions with practical context. Keep scenarios realistic and avoid punishing complexity.",
    "hard": "Use moderately advanced but still approachable questions. Prioritize clarity and real-world relevance over obscure trivia."
}

QUESTION_DISTRIBUTIONS = {
    "easy": {
        "total": 5,
        "breakdown": "2 Resume Validation, 2 Project Deep Dive, 1 Core Technical"
    },
    "medium": {
        "total": 10,
        "breakdown": "2 Resume Validation, 3 Project Deep Dive, 3 Core Technical, 1 System Design, 1 Behavioral"
    },
    "hard": {
        "total": 15,
        "breakdown": "3 Resume Validation, 4 Project Deep Dive, 4 Core Technical, 2 System Design, 2 Behavioral"
    }
}

EXPECTED_QUESTION_COUNTS = {
    "easy": 5,
    "medium": 10,
    "hard": 15
}


def prepare_context_node(state: InterviewState) -> Dict[str, Any]:
    """
    Node: Prepare and extract context from resume sections
    
    Extracts experience, projects, skills, education excerpts
    Determines difficulty guidance and question distribution
    """
    difficulty = str(state.get("difficulty", "medium"))
    logger.info(f"Preparing context for {difficulty} difficulty interview")
    
    # Extract sections with length limits
    resume_sections = state.get("resume_sections", {})
    
    experience_excerpt = truncate_natural(str(resume_sections.get("experience", "")), 500)
    projects_excerpt = truncate_natural(str(resume_sections.get("projects", "")), 500)
    skills_excerpt = truncate_natural(str(resume_sections.get("skills", "")), 300)
    education_excerpt = truncate_natural(str(resume_sections.get("education", "")), 300)
    
    # Get difficulty guidance
    difficulty_lower = difficulty.lower()
    difficulty_desc = DIFFICULTY_GUIDANCE.get(difficulty_lower, DIFFICULTY_GUIDANCE["medium"])
    
    # Get question distribution
    question_distribution = QUESTION_DISTRIBUTIONS.get(difficulty_lower, QUESTION_DISTRIBUTIONS["medium"])
    
    return {
        "experience_excerpt": experience_excerpt,
        "projects_excerpt": projects_excerpt,
        "skills_excerpt": skills_excerpt,
        "education_excerpt": education_excerpt,
        "difficulty_desc": difficulty_desc,
        "question_distribution": question_distribution,
    }


def generate_questions_node(state: InterviewState) -> Dict[str, Any]:
    """
    Node: Generate interview questions via LLM
    
    Uses structured output schema to enforce question format
    """
    logger.info("Generating interview questions")
    
    # Build context from state
    skills = state.get("skills_excerpt", "")
    experience = state.get("experience_excerpt", "")
    projects = state.get("projects_excerpt", "")
    target_role = str(state.get("target_role", "Software Engineer"))
    user_skills = state.get("user_skills", [])
    difficulty = str(state.get("difficulty", "medium"))
    distribution = state.get("question_distribution", QUESTION_DISTRIBUTIONS["medium"])
    difficulty_desc = str(state.get("difficulty_desc", DIFFICULTY_GUIDANCE["medium"]))

    if not isinstance(distribution, dict):
        distribution = QUESTION_DISTRIBUTIONS["medium"]

    total_questions = int(distribution.get("total", 10))
    breakdown = str(distribution.get("breakdown", QUESTION_DISTRIBUTIONS["medium"]["breakdown"]))
    
    prompt = build_question_generation_prompt(
        target_role=target_role,
        skills=str(skills),
        user_skills_text=", ".join(user_skills) if isinstance(user_skills, list) else "",
        experience=str(experience),
        projects=str(projects),
        difficulty=difficulty,
        difficulty_desc=difficulty_desc,
        total_questions=total_questions,
        breakdown=breakdown,
    )

    try:
        structured_llm = INTERVIEW_LLM.with_structured_output(QuestionList)
        result = structured_llm.invoke(prompt)

        question_models = result.questions if isinstance(result, QuestionList) else []
        if not question_models and isinstance(result, dict):
            validated = QuestionList.model_validate(result)
            question_models = validated.questions

        questions_payload = [q.model_dump() for q in question_models]

        return {
            "questions_generated": questions_payload,
            "is_valid": True,
            "validation_error": "",
        }

    except Exception as e:
        error_text = str(e)
        recovered_questions = recover_questions_from_error(error_text)

        if recovered_questions:
            logger.warning("Recovered questions from failed structured output payload")
            return {
                "questions_generated": recovered_questions,
                "is_valid": True,
                "validation_error": "",
            }

        logger.error(f"Question generation error: {error_text}")
        return {
            "questions_generated": [],
            "is_valid": False,
            "validation_error": f"Question generation failed: {error_text}",
            "error": f"Question generation failed: {error_text}",
        }


def validate_questions_node(state: InterviewState) -> Dict[str, Any]:
    """
    Node: Validate and truncate questions to expected count
    
    Ensures question count matches difficulty level
    Truncates if excess, marks invalid state if insufficient
    """
    logger.info("Validating generated questions")
    
    questions = state.get("questions_generated", [])
    difficulty = str(state.get("difficulty", "medium")).lower()
    expected_count = EXPECTED_QUESTION_COUNTS.get(difficulty, 10)
    
    actual_count = len(questions)
    logger.info(f"Expected {expected_count} questions, got {actual_count}")
    
    if actual_count < expected_count:
        validation_error = f"Expected at least {expected_count} questions, got {actual_count}"
        logger.warning(validation_error)
        return {
            "questions_generated": questions,
            "is_valid": False,
            "validation_error": validation_error,
        }
    
    if actual_count > expected_count:
        logger.warning(f"Truncating {actual_count} questions to {expected_count}")
        questions = questions[:expected_count]
    
    return {
        "questions_generated": questions,
        "is_valid": True,
        "validation_error": "",
    }


def build_transcript_node(state: InterviewState) -> Dict[str, Any]:
    """
    Node: Build transcript and calculate metrics for feedback
    
    Combines questions and answers into transcript format
    Counts answered vs skipped questions
    """
    logger.info("Building interview transcript and metrics")
    
    questions = state.get("questions", [])
    answers = state.get("answers", [])
    return build_transcript_and_metrics(questions=questions, answers=answers)


def generate_feedback_node(state: InterviewState) -> Dict[str, Any]:
    """
    Node: Generate comprehensive feedback report via LLM
    
    Generates structured feedback via schema and formats markdown in Python
    """
    logger.info("Generating interview feedback report")
    
    target_role = str(state.get("target_role", "Software Engineer"))
    transcript = str(state.get("transcript", "")).strip()
    total_questions = int(state.get("total_questions", len(state.get("questions", []))))
    answered = int(state.get("answered_count", 0))
    skipped = int(state.get("skipped_count", 0))

    if not transcript:
        logger.warning("Transcript missing from state in generate_feedback_node, rebuilding fallback transcript")
        questions = state.get("questions", [])
        answers = state.get("answers", [])

        fallback_data = build_transcript_and_metrics(questions=questions, answers=answers)
        transcript = str(fallback_data.get("transcript", "")).strip()
        total_questions = int(fallback_data.get("total_questions", len(questions)))
        answered = int(fallback_data.get("answered_count", 0))
        skipped = int(fallback_data.get("skipped_count", 0))

        if not transcript:
            return {
                "feedback_json": None,
                "error": "Feedback generation skipped: transcript missing and could not be rebuilt.",
            }
    
    prompt = build_feedback_generation_prompt(
        target_role=target_role,
        total_questions=total_questions,
        answered=answered,
        skipped=skipped,
        transcript=transcript,
    )

    try:
        structured_llm = INTERVIEW_LLM.with_structured_output(FeedbackOutput)
        feedback_obj = structured_llm.invoke(prompt)

        # Handle dict responses from some LLM providers
        if not isinstance(feedback_obj, FeedbackOutput) and isinstance(feedback_obj, dict):
            feedback_obj = FeedbackOutput.model_validate(feedback_obj)

        if not isinstance(feedback_obj, FeedbackOutput):
            logger.warning("Structured output did not return FeedbackOutput instance; attempting recovery")
            raise ValueError("Invalid structured output format")

        return {
            "feedback_json": feedback_obj.model_dump()
        }

    except Exception as e:
        error_text = str(e)
        recovered_feedback = recover_feedback_from_error(error_text)

        if recovered_feedback:
            logger.warning("Recovered feedback from failed structured output payload")
            return {"feedback_json": recovered_feedback.model_dump()}

        logger.error(f"Feedback generation error: {error_text}")
        return {
            "feedback_json": None,
            "error": f"Feedback generation failed: {error_text}",
        }
