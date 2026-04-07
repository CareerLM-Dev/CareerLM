import json
from typing import Dict, List


DIFFICULTY_DEPTH = {
    "easy": "surface-level: confirm what they did, single layer of depth",
    "medium": "tradeoffs and justifications: ask what was hard, why choices were made",
    "hard": "system thinking: failure modes, scale challenges, edge cases, and decision rationale",
}


def _serialize_anchors(anchors: Dict[str, List[str]]) -> str:
    compact = {
        "stack": (anchors or {}).get("stack", [])[:8],
        "companies": (anchors or {}).get("companies", [])[:2],
        "projects": (anchors or {}).get("projects", [])[:3],
        "metrics": (anchors or {}).get("metrics", [])[:4],
        "gaps": (anchors or {}).get("gaps", [])[:4],
    }
    return json.dumps(compact, ensure_ascii=True, separators=(",", ":"))


def build_question_system_prompt(
    target_role: str,
    difficulty: str,
    difficulty_desc: str,
    anchors: Dict[str, List[str]],
) -> str:
    difficulty_key = str(difficulty or "medium").lower()
    depth = DIFFICULTY_DEPTH.get(difficulty_key, DIFFICULTY_DEPTH["medium"])
    anchors_text = _serialize_anchors(anchors)

    return (
        "You are a strict technical interviewer. "
        f"Role={target_role}. Difficulty={difficulty_key}. "
        f"Depth={depth} Guidance={difficulty_desc}. "
        f"ResumeAnchors={anchors_text}. "
        "Rules: ask only resume-grounded questions, no hallucinations, no repeats, clear open-ended phrasing, "
        "return valid JSON matching schema fields id/category/question only."
    )


def build_section_generation_prompt(
    section_key: str,
    required_count: int,
    accumulated_questions: List[Dict[str, str]],
    previous_questions: List[str],
) -> str:
    existing = [
        f"- {item.get('category', 'General')}: {item.get('question', '')}"
        for item in (accumulated_questions or [])
        if isinstance(item, dict) and item.get("question")
    ]
    prior = [f"- {q}" for q in (previous_questions or []) if isinstance(q, str) and q.strip()]

    existing_text = "\n".join(existing[:30]) or "- none"
    prior_text = "\n".join(prior[:30]) or "- none"

    return f"""Generate EXACTLY {required_count} interview questions for section '{section_key}'.

Already generated in this session:
{existing_text}

Previous session questions to avoid:
{prior_text}

Requirements:
- Return only JSON in schema QuestionList with field questions.
- Each question object must include: id, category, question.
- category must be one of: Resume Validation, Core Technical, Project Deep Dive, Behavioral, Situational.
- Do not repeat or paraphrase existing/prior questions.
- Keep each question answerable in 2-3 minutes.
"""


def build_feedback_system_prompt(
    target_role: str,
    difficulty: str,
    difficulty_desc: str,
    anchors: Dict[str, List[str]],
) -> str:
    difficulty_key = str(difficulty or "medium").lower()
    depth = DIFFICULTY_DEPTH.get(difficulty_key, DIFFICULTY_DEPTH["medium"])
    anchors_text = _serialize_anchors(anchors)
    return (
        "You are a strict technical interviewer providing evidence-based feedback. "
        f"Role={target_role}. Difficulty={difficulty_key}. Depth={depth}. Guidance={difficulty_desc}. "
        f"ResumeAnchors={anchors_text}. "
        "Use only transcript signals provided by user message; return valid JSON matching FeedbackOutput exactly."
    )


def build_question_generation_prompt(
    target_role: str,
    skills: str,
    user_skills_text: str,
    experience: str,
    projects: str,
    difficulty: str,
    difficulty_desc: str,
    total_questions: int,
    breakdown: str,
    previous_questions_text: str = "",
) -> str:
    anchors = {
        "stack": [item.strip() for item in str(skills or user_skills_text).split(",") if item.strip()][:8],
        "projects": [projects[:160]] if projects else [],
        "companies": [experience[:120]] if experience else [],
        "metrics": [],
        "gaps": [],
    }
    system_context = build_question_system_prompt(
        target_role=target_role,
        difficulty=difficulty,
        difficulty_desc=difficulty_desc,
        anchors=anchors,
    )
    previous = previous_questions_text if previous_questions_text else "- none"
    return f"""{system_context}

Task: generate EXACTLY {total_questions} questions with this distribution: {breakdown}.
Avoid these previous questions:
{previous}
Return JSON matching QuestionList.
"""


def build_feedback_generation_prompt(
    target_role: str,
    total_questions: int,
    answered: int,
    skipped: int,
    transcript: str,
    low_signal_count: int = 0,
    low_signal_ratio: float = 0.0,
    quality_band: str = "acceptable",
    quality_note: str = "",
) -> str:
    return f"""Provide direct evidence-based interview feedback as valid FeedbackOutput JSON.

Target Role: {target_role}
Stats: total={total_questions}, answered={answered}, skipped={skipped}, low_signal_count={low_signal_count}, low_signal_ratio={low_signal_ratio}, quality_band={quality_band}
Quality note: {quality_note}

Transcript signals:
{transcript}

Rules:
1) JSON only, exact schema.
2) If low_signal_ratio >= 0.35, be explicitly critical.
3) If low_signal_ratio >= 0.60, set overall_readiness to "Early Stage".
4) Use second person (You/Your).
"""
