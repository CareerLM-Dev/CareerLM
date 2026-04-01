from itertools import zip_longest
from typing import Any, Dict, List
import re


def _is_low_signal_answer(answer_text: str) -> bool:
    text = (answer_text or "").strip()
    if not text:
        return True

    lowered = text.lower()
    tokens = [token for token in re.split(r"\s+", lowered) if token]
    alpha_only = "".join(ch for ch in lowered if ch.isalpha())
    vowels = sum(1 for ch in alpha_only if ch in "aeiou")
    vowel_ratio = (vowels / len(alpha_only)) if alpha_only else 0

    has_single_long_token = len(tokens) == 1 and len(tokens[0]) >= 12
    has_too_few_tokens = len(tokens) <= 2 and len(text) < 20
    repeated_pattern = bool(re.search(r"(.)\1{4,}", lowered))
    random_like_alpha = len(alpha_only) >= 10 and vowel_ratio < 0.2
    very_low_diversity = len(set(tokens)) <= 1 and len(tokens) >= 3

    return any([
        has_single_long_token,
        has_too_few_tokens,
        repeated_pattern,
        random_like_alpha,
        very_low_diversity,
    ])


def _build_response_quality_summary(answered_count: int, low_signal_count: int) -> Dict[str, Any]:
    if answered_count <= 0:
        return {
            "low_signal_count": low_signal_count,
            "low_signal_ratio": 1.0,
            "quality_band": "very_low",
            "quality_note": "No meaningful answers were provided.",
        }

    ratio = low_signal_count / answered_count
    if ratio >= 0.6:
        band = "very_low"
        note = "Most answers are low-signal, extremely short, or gibberish-like."
    elif ratio >= 0.35:
        band = "low"
        note = "Several answers are low-signal and lack clear technical substance."
    elif ratio >= 0.15:
        band = "mixed"
        note = "Answer quality is mixed with some low-signal responses."
    else:
        band = "acceptable"
        note = "Most answers are sufficiently interpretable for evaluation."

    return {
        "low_signal_count": low_signal_count,
        "low_signal_ratio": round(ratio, 2),
        "quality_band": band,
        "quality_note": note,
    }


def build_transcript_and_metrics(questions: List[Any], answers: List[Any]) -> Dict[str, Any]:
    transcript_lines: List[str] = []
    answered = 0
    skipped = 0
    low_signal_count = 0

    for i, (q, a) in enumerate(zip_longest(questions or [], answers or [], fillvalue=""), 1):
        q_data = q if isinstance(q, dict) else {}
        question_category = str(q_data.get("category", "General"))
        question_text = str(q_data.get("question", "[No question provided]"))
        answer_text = str(a).strip() if isinstance(a, str) else str(a).strip()

        transcript_lines.append(f"**Q{i} [{question_category}]:** {question_text}")
        if answer_text and answer_text != "[Skipped]":
            transcript_lines.append(f"**A{i}:** {answer_text}")
            answered += 1
            if _is_low_signal_answer(answer_text):
                low_signal_count += 1
        else:
            transcript_lines.append("**A{i}:** [Skipped]".replace("{i}", str(i)))
            skipped += 1

    total_questions = len(questions or [])

    quality_summary = _build_response_quality_summary(answered, low_signal_count)

    return {
        "transcript": "\n".join(transcript_lines).strip(),
        "total_questions": total_questions,
        "answered_count": answered,
        "skipped_count": skipped,
        "response_quality": quality_summary,
        "metrics": {
            "total": total_questions,
            "answered": answered,
            "skipped": skipped,
            "low_signal": low_signal_count,
        },
    }
