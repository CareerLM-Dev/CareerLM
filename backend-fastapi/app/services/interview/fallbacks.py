from collections import OrderedDict
from typing import Any, Dict, Iterable, List, Sequence
import re


# Single target used for all difficulty levels.
# Question count is always 10; difficulty only affects question depth.
QUESTION_CATEGORY_COUNTS: OrderedDict = OrderedDict([
    ("Resume Validation", 2),
    ("Project Deep Dive", 3),
    ("Core Technical", 3),
    ("System Design", 1),
    ("Behavioral", 1),
])


def _normalize_question_text(question: str) -> str:
    base = (question or "").strip().lower()
    base = re.sub(r"\s+", " ", base)
    base = re.sub(r"[^a-z0-9 ]", "", base)
    return base


def _stringify_value(value: Any) -> str:
    if value is None:
        return ""

    if isinstance(value, str):
        return value

    if isinstance(value, dict):
        preferred_keys = ["title", "name", "role", "company", "project", "content", "description", "summary"]
        parts = []
        for key in preferred_keys:
            if key in value and value[key]:
                parts.append(str(value[key]))

        if not parts:
            parts = [str(item) for item in value.values() if item]

        return " - ".join(part.strip() for part in parts if part and str(part).strip())

    if isinstance(value, list):
        return " | ".join(_stringify_value(item) for item in value if _stringify_value(item).strip())

    return str(value)


def _extract_fragments(value: Any, max_items: int, split_commas: bool = False) -> List[str]:
    text = _stringify_value(value)
    if not text:
        return []

    normalized = text.replace("\r", "\n")
    if split_commas:
        normalized = normalized.replace(",", "\n")

    raw_parts = re.split(r"\n+|[•\u2022]|\s+-\s+|\s+\|\s+", normalized)
    fragments: List[str] = []
    seen = set()

    for part in raw_parts:
        cleaned = re.sub(r"\s+", " ", str(part)).strip(" -:\t")
        if len(cleaned) < 3:
            continue

        lowered = cleaned.lower()
        if lowered in seen:
            continue

        seen.add(lowered)
        fragments.append(cleaned)
        if len(fragments) >= max_items:
            break

    return fragments


def _skill_label(skill: str) -> str:
    cleaned = re.sub(r"\([^)]*\)", "", skill or "")
    cleaned = re.sub(r"\s+", " ", cleaned).strip(" ,.-")
    return cleaned or "your core tools"


def _trim_fact(value: str, max_length: int = 90) -> str:
    cleaned = re.sub(r"\s+", " ", value or "").strip(" ,.-")
    if len(cleaned) <= max_length:
        return cleaned

    trimmed = cleaned[: max_length + 1]
    boundary = trimmed.rfind(" ")
    if boundary > 20:
        trimmed = trimmed[:boundary]

    return trimmed.strip(" ,.-") + "..."


def _build_question_bank(target_role: str, resume_sections: Dict[str, Any]) -> Dict[str, List[str]]:
    role = (target_role or "Software Engineer").strip() or "Software Engineer"

    experience_facts = _extract_fragments(resume_sections.get("experience", ""), max_items=6)
    project_facts = _extract_fragments(resume_sections.get("projects", ""), max_items=6)
    skill_facts = [_skill_label(item) for item in _extract_fragments(resume_sections.get("skills", ""), max_items=8, split_commas=True)]
    education_facts = _extract_fragments(resume_sections.get("education", ""), max_items=3)

    resume_bank: List[str] = []
    for fact in experience_facts[:4]:
        snippet = _trim_fact(fact)
        resume_bank.extend([
            f"Your resume mentions {snippet}. What was your specific contribution, and how did you measure success?",
            f"Walk me through the most technically important work you did in {snippet}.",
        ])

    for fact in education_facts[:2]:
        snippet = _trim_fact(fact)
        resume_bank.append(
            f"How has your background in {snippet} prepared you for a {role} position?"
        )

    project_bank: List[str] = []
    for fact in project_facts[:5]:
        snippet = _trim_fact(fact)
        project_bank.extend([
            f"Pick the project {snippet} and explain its architecture, main components, and your ownership.",
            f"What technical trade-offs did you make while building {snippet}?",
            f"If you had to improve {snippet} for a production environment, what would you change first and why?",
        ])

    technical_bank: List[str] = []
    for skill in skill_facts[:6]:
        technical_bank.extend([
            f"You list {skill}. Explain a practical scenario where you used it and the trade-offs you considered.",
            f"What are the most important concepts in {skill} for a {role}?",
        ])

    system_design_bank: List[str] = []
    primary_project = _trim_fact(project_facts[0]) if project_facts else "one of your recent projects"
    primary_skill = skill_facts[0] if skill_facts else "your preferred stack"
    system_design_bank.extend([
        f"Suppose you had to redesign {primary_project} for higher scale and reliability. What components would you introduce?",
        f"How would you design a production-ready {role} system using {primary_skill} while keeping it maintainable?",
        f"If user traffic doubled for {primary_project}, how would you diagnose bottlenecks and scale the system?",
        f"Describe how you would structure APIs, storage, and monitoring for a typical {role} application.",
    ])

    behavioral_bank: List[str] = []
    behavioral_bank.extend([
        f"Tell me about a time you had to learn a new technology quickly to deliver as a {role}.",
        f"Describe a situation where you had to balance delivery speed with code quality in your work.",
        f"Tell me about a time you received technical feedback and how you applied it to improve your work.",
        f"Describe how you communicate technical blockers or trade-offs to teammates during a project.",
    ])

    if not resume_bank:
        resume_bank.extend([
            f"Which experience on your resume best demonstrates your readiness for a {role}, and why?",
            f"What accomplishment on your resume would you highlight first in a {role} interview?",
            f"Which part of your background best matches this {role}, and what evidence supports that?",
        ])

    if not project_bank:
        project_bank.extend([
            f"Describe a project that best demonstrates your fit for a {role} and explain the technical decisions you made.",
            f"Walk me through the most technically challenging project on your resume and how you approached it.",
            f"Which project on your resume had the biggest impact, and how did you implement it?",
            f"If you revisited one of your past projects today, what would you improve and why?",
        ])

    if not technical_bank:
        technical_bank.extend([
            f"What technical concepts do you consider most important for success as a {role}?",
            f"Explain a core technology you are comfortable with and how you have applied it in practice.",
            f"How do you decide which tools or frameworks are appropriate for a {role} problem?",
            f"Describe a debugging or optimization approach you would use in a typical {role} workflow.",
            f"What engineering trade-offs do you think matter most in day-to-day {role} work?",
        ])

    return {
        "Resume Validation": resume_bank,
        "Project Deep Dive": project_bank,
        "Core Technical": technical_bank,
        "System Design": system_design_bank,
        "Behavioral": behavioral_bank,
    }


def _existing_category_counts(existing_questions: Sequence[Dict[str, Any]]) -> Dict[str, int]:
    counts: Dict[str, int] = {}
    for item in existing_questions:
        category = str(item.get("category", "")).strip()
        if not category:
            continue
        counts[category] = counts.get(category, 0) + 1
    return counts


def _append_candidates(
    output: List[Dict[str, Any]],
    category: str,
    candidates: Iterable[str],
    required_count: int,
    seen_normalized: set,
    category_counts: Dict[str, int],
) -> None:
    for candidate in candidates:
        normalized = _normalize_question_text(candidate)
        if not normalized or normalized in seen_normalized:
            continue

        output.append({
            "category": category,
            "question": candidate,
        })
        seen_normalized.add(normalized)
        category_counts[category] = category_counts.get(category, 0) + 1

        if category_counts[category] >= required_count:
            return


def build_fallback_questions(
    target_role: str,
    difficulty: str,
    resume_sections: Dict[str, Any],
    existing_questions: Sequence[Dict[str, Any]],
    blocked_questions: Sequence[str],
) -> List[Dict[str, Any]]:
    difficulty_key = str(difficulty or "medium").lower()
    category_targets = QUESTION_CATEGORY_COUNTS
    question_bank = _build_question_bank(target_role=target_role, resume_sections=resume_sections or {})

    current_seen = {
        _normalize_question_text(str(item.get("question", "")))
        for item in existing_questions
        if isinstance(item, dict) and str(item.get("question", "")).strip()
    }
    blocked_seen = {
        _normalize_question_text(question)
        for question in blocked_questions
        if isinstance(question, str) and question.strip()
    }

    category_counts = _existing_category_counts(existing_questions)
    generated: List[Dict[str, Any]] = []

    for allow_previous_reuse in (False, True):
        seen_normalized = set(current_seen)
        if not allow_previous_reuse:
            seen_normalized.update(blocked_seen)
        seen_normalized.update(
            _normalize_question_text(str(item.get("question", "")))
            for item in generated
            if isinstance(item, dict)
        )

        start_length = len(generated)

        for category, required_count in category_targets.items():
            if category_counts.get(category, 0) >= required_count:
                continue

            _append_candidates(
                output=generated,
                category=category,
                candidates=question_bank.get(category, []),
                required_count=required_count,
                seen_normalized=seen_normalized,
                category_counts=category_counts,
            )

        if all(category_counts.get(category, 0) >= required_count for category, required_count in category_targets.items()):
            break

        if len(generated) == start_length and allow_previous_reuse:
            break

    return generated


def get_fallback_questions(
    target_role: str,
    difficulty: str,
    resume_sections: Dict[str, Any],
    existing_questions: Sequence[Dict[str, Any]],
    blocked_questions: Sequence[str],
) -> List[Dict[str, Any]]:
    """Compatibility wrapper used by interview nodes for deficit-only fallback fills."""
    return build_fallback_questions(
        target_role=target_role,
        difficulty=difficulty,
        resume_sections=resume_sections,
        existing_questions=existing_questions,
        blocked_questions=blocked_questions,
    )