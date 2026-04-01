"""
Interview workflow nodes
Contains all business logic for question generation and feedback
"""

from typing import Dict, Any, List
import logging
import re
import json

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
from app.services.interview.utils import truncate_natural, extract_balanced_json_object

from .state import InterviewState

from app.agents.llm_config import INTERVIEW_LLM

logger = logging.getLogger(__name__)


# ===== CONSTANTS =====
# DIFFICULTY_GUIDANCE = {
#     "easy": "Use beginner-friendly, practical questions suitable for junior/entry-level developers. Avoid edge cases, trick questions, and overly deep system internals.",
#     "medium": "Use accessible foundational-to-intermediate questions with practical context. Keep scenarios realistic and avoid punishing complexity.",
#     "hard": "Use moderately advanced but still approachable questions. Prioritize clarity and real-world relevance over obscure trivia."
# }
DIFFICULTY_GUIDANCE = {
        "easy": "Focus on fundamental concepts, basic terminology, and straightforward scenarios. Questions should be answerable by entry-level candidates.",
        "medium": "Mix of fundamental and intermediate concepts. Include some problem-solving scenarios and practical applications. Suitable for mid-level candidates.",
        "hard": "Advanced concepts, complex scenarios, optimization problems, and deep technical knowledge. Challenge the candidate with edge cases and architectural decisions."
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


def normalize_question_text(question: str) -> str:
    base = (question or "").strip().lower()
    base = re.sub(r"\s+", " ", base)
    base = re.sub(r"[^a-z0-9 ]", "", base)
    return base


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
    previous_questions = state.get("previous_questions", []) or []

    previous_questions_clean = [
        q.strip() for q in previous_questions
        if isinstance(q, str) and q.strip()
    ]
    blocked_normalized = {normalize_question_text(q) for q in previous_questions_clean}
    aggregated_questions: List[Dict[str, Any]] = []
    seen_normalized = set(blocked_normalized)
    last_error_text = ""
    
    for attempt in range(3):
        remaining = max(total_questions - len(aggregated_questions), 0)
        if remaining == 0:
            break

        exclusion_for_prompt = previous_questions_clean + [
            str(item.get("question", "")).strip()
            for item in aggregated_questions
            if isinstance(item, dict) and str(item.get("question", "")).strip()
        ]
        previous_questions_text = "\n".join(
            f"- {q}" for q in exclusion_for_prompt[:150]
        )

        prompt = build_question_generation_prompt(
            target_role=target_role,
            skills=str(skills),
            user_skills_text=", ".join(user_skills) if isinstance(user_skills, list) else "",
            experience=str(experience),
            projects=str(projects),
            difficulty=difficulty,
            difficulty_desc=difficulty_desc,
            total_questions=remaining,
            breakdown=breakdown,
            previous_questions_text=previous_questions_text,
        )

        try:
            structured_llm = INTERVIEW_LLM.with_structured_output(QuestionList)
            result = structured_llm.invoke(prompt)

            question_models = result.questions if isinstance(result, QuestionList) else []
            if not question_models and isinstance(result, dict):
                validated = QuestionList.model_validate(result)
                question_models = validated.questions

            questions_payload = [q.model_dump() for q in question_models]

            unique_batch = []
            for item in questions_payload:
                question_text = str(item.get("question", "")).strip()
                normalized = normalize_question_text(question_text)
                if not normalized or normalized in seen_normalized:
                    continue
                seen_normalized.add(normalized)
                unique_batch.append(item)

            if unique_batch:
                aggregated_questions.extend(unique_batch)

        except Exception as e:
            error_text = str(e)
            last_error_text = error_text
            recovered_questions = recover_questions_from_error(error_text)

            if recovered_questions:
                logger.warning("Recovered questions from failed structured output payload")
                unique_batch = []
                for item in recovered_questions:
                    question_text = str(item.get("question", "")).strip()
                    normalized = normalize_question_text(question_text)
                    if not normalized or normalized in seen_normalized:
                        continue
                    seen_normalized.add(normalized)
                    unique_batch.append(item)

                if unique_batch:
                    aggregated_questions.extend(unique_batch)
                    continue

            logger.warning(f"Question generation attempt {attempt + 1} failed: {error_text}")

    if not aggregated_questions:
        logger.error(f"Question generation error: {last_error_text or 'No unique questions generated'}")
        return {
            "questions_generated": [],
            "is_valid": False,
            "validation_error": f"Question generation failed: {last_error_text or 'No unique questions generated'}",
            "error": f"Question generation failed: {last_error_text or 'No unique questions generated'}",
        }

    for idx, item in enumerate(aggregated_questions, start=1):
        item["id"] = idx

    return {
        "questions_generated": aggregated_questions,
        "is_valid": True,
        "validation_error": "",
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
    response_quality = state.get("response_quality") or {}
    low_signal_count = int(response_quality.get("low_signal_count", 0) or 0)
    low_signal_ratio = float(response_quality.get("low_signal_ratio", 0) or 0)
    quality_band = str(response_quality.get("quality_band", "acceptable"))
    quality_note = str(response_quality.get("quality_note", ""))

    if not transcript:
        logger.warning("Transcript missing from state in generate_feedback_node, rebuilding fallback transcript")
        questions = state.get("questions", [])
        answers = state.get("answers", [])

        fallback_data = build_transcript_and_metrics(questions=questions, answers=answers)
        transcript = str(fallback_data.get("transcript", "")).strip()
        total_questions = int(fallback_data.get("total_questions", len(questions)))
        answered = int(fallback_data.get("answered_count", 0))
        skipped = int(fallback_data.get("skipped_count", 0))
        response_quality = fallback_data.get("response_quality") or {}
        low_signal_count = int(response_quality.get("low_signal_count", 0) or 0)
        low_signal_ratio = float(response_quality.get("low_signal_ratio", 0) or 0)
        quality_band = str(response_quality.get("quality_band", "acceptable"))
        quality_note = str(response_quality.get("quality_note", ""))

        if not transcript:
            return {
                "feedback_json": None,
                "error": "Feedback generation skipped: transcript missing and could not be rebuilt.",
            }

    severe_low_quality = answered == 0 or (answered > 0 and low_signal_ratio >= 0.6)
    if severe_low_quality:
        logger.info("Returning deterministic direct feedback due to severe low-signal responses")
        return {
            "feedback_json": {
                "executive_summary": "Your responses contain very little evaluable content. Multiple answers were skipped, too short, or gibberish-like, so technical assessment is not reliable.",
                "overall_readiness": "Early Stage",
                "quantitative_metrics": {
                    "verbosity": "Very Low",
                    "confidence_tone": "Unclear",
                    "keyword_hit_rate": "Low"
                },
                "stage_performance": {
                    "resume_validation": "Needs Work",
                    "project_deep_dive": "Needs Work",
                    "core_technical": "Needs Work",
                    "behavioral": "Needs Work"
                },
                "action_plan": {
                    "stop_doing": [
                        "Stop submitting random text or single-word answers.",
                        "Stop leaving answers empty when you can provide a brief structured response."
                    ],
                    "start_doing": [
                        "Answer each question in 3 parts: context, action, outcome.",
                        "Use concrete technologies and examples from your resume in every response."
                    ],
                    "study_focus": [
                        "Revise your core project details and tech stack before the interview.",
                        "Practice concise technical explanations for common role-specific topics."
                    ],
                    "next_steps": [
                        "Retake the interview and provide complete, readable answers for all questions.",
                        "Target at least one concrete example per answer."
                    ]
                },
                "question_breakdown": [
                    {
                        "question": "Overall response quality check",
                        "user_answer_summary": f"Answered: {answered}, low-signal answers: {low_signal_count} ({int(low_signal_ratio * 100)}%).",
                        "improvement_needed": "Provide readable, relevant, and technically meaningful responses instead of gibberish or empty content.",
                        "ideal_golden_answer": "A clear answer should explain what you did, how you did it, and the measurable result."
                    }
                ]
            }
        }
    
    prompt = build_feedback_generation_prompt(
        target_role=target_role,
        total_questions=total_questions,
        answered=answered,
        skipped=skipped,
        transcript=transcript,
        low_signal_count=low_signal_count,
        low_signal_ratio=low_signal_ratio,
        quality_band=quality_band,
        quality_note=quality_note,
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

        logger.warning("Structured feedback generation failed; attempting raw JSON fallback")
        try:
            raw_result = INTERVIEW_LLM.invoke(prompt)
            raw_content = getattr(raw_result, "content", raw_result)

            if isinstance(raw_content, list):
                raw_text = "\n".join(
                    str(item.get("text", "") if isinstance(item, dict) else item)
                    for item in raw_content
                )
            else:
                raw_text = str(raw_content)

            json_blob = None
            stripped = raw_text.strip()
            if stripped.startswith("{"):
                json_blob = extract_balanced_json_object(stripped, 0) or stripped
            else:
                first_brace = raw_text.find("{")
                if first_brace >= 0:
                    json_blob = extract_balanced_json_object(raw_text, first_brace)

            if json_blob:
                parsed_feedback = json.loads(json_blob)
                validated_feedback = FeedbackOutput.model_validate(parsed_feedback)
                logger.warning("Recovered feedback via raw JSON fallback")
                return {"feedback_json": validated_feedback.model_dump()}

        except Exception as fallback_error:
            logger.warning(f"Raw JSON feedback fallback failed: {str(fallback_error)}")

        logger.warning("Falling back to deterministic feedback after all LLM parsing paths failed")

        # Final guaranteed fallback to avoid returning null feedback on provider tool-use failures.
        readiness = "Needs Practice"
        if answered == total_questions and low_signal_ratio < 0.2:
            readiness = "Interview Ready"
        elif answered >= max(1, int(total_questions * 0.7)) and low_signal_ratio < 0.4:
            readiness = "Almost Ready"

        stage_level = "Needs Work"
        if low_signal_ratio < 0.2:
            stage_level = "Solid"
        elif low_signal_ratio < 0.4:
            stage_level = "Growing"

        deterministic_feedback = {
            "executive_summary": (
                f"You answered {answered} out of {total_questions} questions. "
                "Automatic feedback fallback was used because the model returned an invalid tool-call payload. "
                "Use this report to improve answer quality and retry for richer AI feedback."
            ),
            "overall_readiness": readiness,
            "quantitative_metrics": {
                "verbosity": "Low" if low_signal_ratio >= 0.5 else "Moderate",
                "confidence_tone": "Low" if low_signal_ratio >= 0.5 else "Moderate",
                "keyword_hit_rate": "Moderate" if answered > 0 else "Low"
            },
            "stage_performance": {
                "resume_validation": stage_level,
                "project_deep_dive": stage_level,
                "core_technical": stage_level,
                "behavioral": stage_level
            },
            "action_plan": {
                "stop_doing": [
                    "Avoid vague or one-line answers without technical detail.",
                    "Avoid skipping questions when you can provide a structured attempt."
                ],
                "start_doing": [
                    "Answer each question using context, implementation, and outcome.",
                    "Reference concrete technologies and decisions from your projects."
                ],
                "study_focus": [
                    "Role-specific fundamentals and project deep-dive explanations.",
                    "Clear communication of trade-offs, constraints, and results."
                ],
                "next_steps": [
                    "Retake the mock interview with complete and specific answers.",
                    "Use STAR-style structure for behavioral and project questions."
                ]
            },
            "question_breakdown": [
                {
                    "question": "Overall interview response quality",
                    "user_answer_summary": (
                        f"Answered: {answered}/{total_questions}; "
                        f"low-signal ratio: {int(low_signal_ratio * 100)}%."
                    ),
                    "improvement_needed": "Increase specificity, technical accuracy, and completeness in each answer.",
                    "ideal_golden_answer": "A strong answer states the problem, your approach, tools used, and measurable outcome."
                }
            ]
        }

        return {"feedback_json": deterministic_feedback}

