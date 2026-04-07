"""
Interview workflow nodes
Contains all business logic for question generation and feedback
"""

from typing import Dict, Any, List
import logging
import json

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from app.services.interview.prompts import (
    DIFFICULTY_DEPTH,
    build_feedback_generation_prompt,
    build_feedback_system_prompt,
    build_question_system_prompt,
    build_section_generation_prompt,
)
from app.services.interview.recovery import (
    recover_feedback_from_error,
    recover_questions_from_error,
)
from app.services.interview.fallbacks import get_fallback_questions
from app.services.interview.schemas import FeedbackOutput, QuestionList
from app.services.interview.transcript import build_transcript_and_metrics, serialize_transcript_for_llm
from app.services.interview.utils import truncate_natural, extract_balanced_json_object, is_duplicate
from app.services.interview.resume_parser import extract_resume_anchors

from .state import InterviewState

from app.agents.llm_config import INTERVIEW_LLM

logger = logging.getLogger(__name__)


DIFFICULTY_GUIDANCE = {
    "easy": "Fundamentals and direct implementation clarity.",
    "medium": "Balanced practical depth with design and trade-offs.",
    "hard": "Advanced architecture reasoning and optimization depth.",
}

# Always 10 questions regardless of difficulty.
# Difficulty controls depth of questions, not how many are asked.
TOTAL_QUESTIONS = 10

SECTION_PLAN = [
    ("resume_validation", 2),
    ("core_technical", 3),
    ("project_deep_dive", 2),
    ("behavioral", 2),
    ("situational", 1),
]

SECTION_TO_CATEGORY = {
    "resume_validation": "Resume Validation",
    "core_technical": "Core Technical",
    "project_deep_dive": "Project Deep Dive",
    "behavioral": "Behavioral",
    "situational": "Situational",
}


def _compress_for_history(questions: List[Dict[str, Any]]) -> str:
    lines = []
    for item in questions:
        category = str(item.get("category", "General"))
        text = str(item.get("question", "")).strip()
        compressed = text[:60] + ("..." if len(text) > 60 else "")
        lines.append(f"{category}: {compressed}")
    return "\n".join(lines) if lines else "No questions generated"


def _parse_question_result(raw_result: Any) -> List[Dict[str, Any]]:
    if isinstance(raw_result, QuestionList):
        return [q.model_dump() for q in raw_result.questions]
    if isinstance(raw_result, dict):
        validated = QuestionList.model_validate(raw_result)
        return [q.model_dump() for q in validated.questions]
    return []


def _is_category_match(section_key: str, candidate_category: str) -> bool:
    expected = SECTION_TO_CATEGORY.get(section_key, "General").lower()
    actual = (candidate_category or "").strip().lower()

    if section_key == "situational":
        return actual in {"situational", "system design"}

    return actual == expected


def _normalize_category(section_key: str, candidate_category: str) -> str:
    if _is_category_match(section_key, candidate_category):
        if section_key == "situational":
            return "Situational"
        return SECTION_TO_CATEGORY.get(section_key, "General")
    return SECTION_TO_CATEGORY.get(section_key, "General")


def prepare_context_node(state: InterviewState) -> Dict[str, Any]:
    """
    Node: Prepare and extract context from resume sections

    Extracts short resume excerpts and deterministic anchors for low-token prompts.
    """
    difficulty = str(state.get("difficulty", "medium")).lower()
    target_role = str(state.get("target_role", "Software Engineer"))
    logger.info("Preparing context for %s difficulty interview", difficulty)

    resume_sections = state.get("resume_sections", {}) or {}
    resume_text = str(state.get("resume_text", ""))

    experience_excerpt = truncate_natural(str(resume_sections.get("experience", "")), 500)
    projects_excerpt = truncate_natural(str(resume_sections.get("projects", "")), 500)
    skills_excerpt = truncate_natural(str(resume_sections.get("skills", "")), 300)
    education_excerpt = truncate_natural(str(resume_sections.get("education", "")), 300)

    difficulty_desc = DIFFICULTY_GUIDANCE.get(difficulty, DIFFICULTY_GUIDANCE["medium"])

    resume_anchors = extract_resume_anchors(resume_text=resume_text, target_role=target_role)

    return {
        "experience_excerpt": experience_excerpt,
        "projects_excerpt": projects_excerpt,
        "skills_excerpt": skills_excerpt,
        "education_excerpt": education_excerpt,
        "difficulty_desc": difficulty_desc,
        "resume_anchors": resume_anchors,
    }


def generate_questions_node(state: InterviewState) -> Dict[str, Any]:
    """
    Node: Generate interview questions section-by-section via multi-turn messages.
    """
    logger.info("Generating interview questions via sequential section calls")

    target_role = str(state.get("target_role", "Software Engineer"))
    difficulty = str(state.get("difficulty", "medium")).lower()
    difficulty_desc = str(state.get("difficulty_desc", DIFFICULTY_GUIDANCE["medium"]))
    total_questions = TOTAL_QUESTIONS

    resume_text = str(state.get("resume_text", ""))
    resume_sections = state.get("resume_sections", {}) or {}
    resume_anchors = state.get("resume_anchors") or extract_resume_anchors(resume_text=resume_text, target_role=target_role)

    previous_questions = state.get("previous_questions", []) or []
    previous_questions_clean = [q.strip() for q in previous_questions if isinstance(q, str) and q.strip()]

    section_plan = SECTION_PLAN
    accumulated_questions: List[Dict[str, Any]] = []
    last_error_text = ""

    system_prompt = build_question_system_prompt(
        target_role=target_role,
        difficulty=difficulty,
        difficulty_desc=difficulty_desc,
        anchors=resume_anchors,
    )
    messages: List[Any] = [SystemMessage(content=system_prompt)]

    for section_key, required_count in section_plan:
        if len(accumulated_questions) >= total_questions:
            break

        remaining_capacity = total_questions - len(accumulated_questions)
        required = min(required_count, remaining_capacity)
        if required <= 0:
            continue

        section_prompt = build_section_generation_prompt(
            section_key=section_key,
            required_count=required,
            accumulated_questions=accumulated_questions,
            previous_questions=previous_questions_clean,
        )

        section_questions: List[Dict[str, Any]] = []
        try:
            structured_llm = INTERVIEW_LLM.with_structured_output(QuestionList)
            result = structured_llm.invoke(messages + [HumanMessage(content=section_prompt)])
            parsed = _parse_question_result(result)

            for item in parsed:
                question_text = str(item.get("question", "")).strip()
                if not question_text:
                    continue

                comparison_pool = previous_questions_clean + [str(x.get("question", "")) for x in accumulated_questions] + [str(x.get("question", "")) for x in section_questions]
                if is_duplicate(question_text, comparison_pool, threshold=0.75):
                    continue

                section_questions.append(
                    {
                        "category": _normalize_category(section_key, str(item.get("category", ""))),
                        "question": question_text,
                    }
                )
                if len(section_questions) >= required:
                    break

        except Exception as e:
            last_error_text = str(e)
            recovered = recover_questions_from_error(last_error_text)
            if recovered:
                logger.warning("Recovered section questions from malformed structured output")
                for item in recovered:
                    question_text = str(item.get("question", "")).strip()
                    if not question_text:
                        continue

                    comparison_pool = previous_questions_clean + [str(x.get("question", "")) for x in accumulated_questions] + [str(x.get("question", "")) for x in section_questions]
                    if is_duplicate(question_text, comparison_pool, threshold=0.75):
                        continue

                    section_questions.append(
                        {
                            "category": _normalize_category(section_key, str(item.get("category", ""))),
                            "question": question_text,
                        }
                    )
                    if len(section_questions) >= required:
                        break
            else:
                logger.warning("Section generation failed for %s: %s", section_key, last_error_text)

        if len(section_questions) < required:
            deficit = required - len(section_questions)
            fallback_candidates = get_fallback_questions(
                target_role=target_role,
                difficulty=difficulty,
                resume_sections=resume_sections,
                existing_questions=accumulated_questions + section_questions,
                blocked_questions=previous_questions_clean,
            )

            for item in fallback_candidates:
                if len(section_questions) >= required:
                    break

                candidate_text = str(item.get("question", "")).strip()
                candidate_category = str(item.get("category", ""))
                if not candidate_text:
                    continue

                if not _is_category_match(section_key, candidate_category):
                    continue

                comparison_pool = previous_questions_clean + [str(x.get("question", "")) for x in accumulated_questions] + [str(x.get("question", "")) for x in section_questions]
                if is_duplicate(candidate_text, comparison_pool, threshold=0.75):
                    continue

                section_questions.append(
                    {
                        "category": _normalize_category(section_key, candidate_category),
                        "question": candidate_text,
                    }
                )

            if len(section_questions) < required and deficit > 0:
                logger.warning("Section %s still missing %s questions after fallback", section_key, required - len(section_questions))

        accumulated_questions.extend(section_questions)

        messages.append(HumanMessage(content=f"Section {section_key} generated."))
        messages.append(AIMessage(content=_compress_for_history(section_questions)))

    if len(accumulated_questions) < total_questions:
        deficit = total_questions - len(accumulated_questions)
        fallback_candidates = get_fallback_questions(
            target_role=target_role,
            difficulty=difficulty,
            resume_sections=resume_sections,
            existing_questions=accumulated_questions,
            blocked_questions=previous_questions_clean,
        )

        for item in fallback_candidates:
            if len(accumulated_questions) >= total_questions:
                break

            candidate_text = str(item.get("question", "")).strip()
            if not candidate_text:
                continue

            comparison_pool = previous_questions_clean + [str(x.get("question", "")) for x in accumulated_questions]
            if is_duplicate(candidate_text, comparison_pool, threshold=0.75):
                continue

            accumulated_questions.append(
                {
                    "category": str(item.get("category", "General")).strip() or "General",
                    "question": candidate_text,
                }
            )

        logger.warning("Global fallback added %s questions", max(len(accumulated_questions) - (total_questions - deficit), 0))

    if not accumulated_questions:
        logger.error("Question generation error: %s", last_error_text or "No unique questions generated")
        return {
            "questions_generated": [],
            "is_valid": False,
            "validation_error": f"Question generation failed: {last_error_text or 'No unique questions generated'}",
            "error": f"Question generation failed: {last_error_text or 'No unique questions generated'}",
        }

    for idx, item in enumerate(accumulated_questions, start=1):
        item["id"] = idx

    return {
        "questions_generated": accumulated_questions,
        "resume_anchors": resume_anchors,
        "is_valid": True,
        "validation_error": "",
    }


def validate_questions_node(state: InterviewState) -> Dict[str, Any]:
    """
    Node: Validate and truncate questions to expected count

    Ensures question count matches difficulty level.
    """
    logger.info("Validating generated questions")

    questions = state.get("questions_generated", [])
    expected_count = TOTAL_QUESTIONS

    actual_count = len(questions)
    logger.info("Expected %s questions, got %s", expected_count, actual_count)

    if actual_count < expected_count:
        validation_error = f"Expected at least {expected_count} questions, got {actual_count}"
        logger.warning(validation_error)
        return {
            "questions_generated": questions,
            "is_valid": False,
            "validation_error": validation_error,
        }

    if actual_count > expected_count:
        logger.warning("Truncating %s questions to %s", actual_count, expected_count)
        questions = questions[:expected_count]

    return {
        "questions_generated": questions,
        "is_valid": True,
        "validation_error": "",
    }


def build_transcript_node(state: InterviewState) -> Dict[str, Any]:
    """
    Node: Build transcript and calculate metrics for feedback.
    """
    logger.info("Building interview transcript and metrics")

    questions = state.get("questions", [])
    answers = state.get("answers", [])
    resume_text = str(state.get("resume_text", ""))
    target_role = str(state.get("target_role", "Software Engineer"))
    anchors = state.get("resume_anchors") or extract_resume_anchors(resume_text=resume_text, target_role=target_role)

    data = build_transcript_and_metrics(questions=questions, answers=answers, anchors=anchors)
    data["resume_anchors"] = anchors
    return data


def generate_feedback_node(state: InterviewState) -> Dict[str, Any]:
    """
    Node: Generate comprehensive feedback report via LLM.

    Keeps fallback order unchanged while switching to compact transcript signals.
    """
    logger.info("Generating interview feedback report")

    target_role = str(state.get("target_role", "Software Engineer"))
    difficulty = str(state.get("difficulty", "medium")).lower()
    difficulty_desc = DIFFICULTY_GUIDANCE.get(difficulty, DIFFICULTY_GUIDANCE["medium"])

    transcript = str(state.get("transcript", "")).strip()
    transcript_entries = state.get("transcript_entries", []) or []
    total_questions = int(state.get("total_questions", len(state.get("questions", []))))
    answered = int(state.get("answered_count", 0))
    skipped = int(state.get("skipped_count", 0))
    response_quality = state.get("response_quality") or {}
    low_signal_count = int(response_quality.get("low_signal_count", 0) or 0)
    low_signal_ratio = float(response_quality.get("low_signal_ratio", 0) or 0)
    quality_band = str(response_quality.get("quality_band", "acceptable"))
    quality_note = str(response_quality.get("quality_note", ""))

    resume_text = str(state.get("resume_text", ""))
    resume_anchors = state.get("resume_anchors") or extract_resume_anchors(resume_text=resume_text, target_role=target_role)

    if not transcript:
        logger.warning("Transcript missing from state in generate_feedback_node, rebuilding fallback transcript")
        questions = state.get("questions", [])
        answers = state.get("answers", [])

        fallback_data = build_transcript_and_metrics(questions=questions, answers=answers, anchors=resume_anchors)
        transcript = str(fallback_data.get("transcript", "")).strip()
        transcript_entries = fallback_data.get("transcript_entries", []) or []
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

    serialized_transcript = serialize_transcript_for_llm(transcript_entries, target_role=target_role)

    feedback_prompt = build_feedback_generation_prompt(
        target_role=target_role,
        total_questions=total_questions,
        answered=answered,
        skipped=skipped,
        transcript=serialized_transcript,
        low_signal_count=low_signal_count,
        low_signal_ratio=low_signal_ratio,
        quality_band=quality_band,
        quality_note=quality_note,
    )

    system_prompt = build_feedback_system_prompt(
        target_role=target_role,
        difficulty=difficulty,
        difficulty_desc=difficulty_desc,
        anchors=resume_anchors,
    )
    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=feedback_prompt),
    ]

    try:
        structured_llm = INTERVIEW_LLM.with_structured_output(FeedbackOutput)
        feedback_obj = structured_llm.invoke(messages)

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
            raw_result = INTERVIEW_LLM.invoke(messages)
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
            logger.warning("Raw JSON feedback fallback failed: %s", str(fallback_error))

        logger.warning("Falling back to deterministic feedback after all LLM parsing paths failed")

        readiness = "Needs Practice"
        if answered == total_questions and low_signal_ratio < 0.2:
            readiness = "Interview Ready"
        elif answered >= max(1, int(total_questions * 0.7)) and low_signal_ratio < 0.4:
            readiness = "Nearly Ready"

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

