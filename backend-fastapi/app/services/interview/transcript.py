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


def _tokenize(text: str) -> List[str]:
    return [t for t in re.findall(r"[a-z0-9]+", (text or "").lower()) if t]


def _ownership(answer_text: str) -> str:
    tokens = _tokenize(answer_text)
    if not tokens:
        return "weak"

    i_count = sum(1 for t in tokens if t in {"i", "my", "mine"})
    we_count = sum(1 for t in tokens if t in {"we", "our", "ours", "team"})

    if i_count > we_count and i_count >= 1:
        return "strong"
    if we_count > i_count:
        return "shared"
    return "weak"


def _star_signals(answer_text: str) -> Dict[str, bool]:
    lowered = (answer_text or "").lower()
    return {
        "S": any(k in lowered for k in ["situation", "context", "background", "problem"]),
        "T": any(k in lowered for k in ["task", "goal", "objective", "responsibility"]),
        "A": any(k in lowered for k in ["i did", "i built", "i implemented", "action", "approach"]),
        "R": any(k in lowered for k in ["result", "impact", "%", "improved", "reduced", "increased"]),
    }


def _first_words(text: str, max_words: int) -> str:
    words = (text or "").split()
    if len(words) <= max_words:
        return " ".join(words)
    return " ".join(words[:max_words])


def _signal_entry(
    idx: int,
    question: Dict[str, Any],
    answer_text: str,
    anchor_stack: List[str],
) -> Dict[str, Any]:
    category = str(question.get("category", "General"))
    question_text = str(question.get("question", "[No question provided]"))
    word_count = len(_tokenize(answer_text))
    is_skipped = word_count < 15 or answer_text.strip() in {"", "[Skipped]"}
    has_metrics = bool(re.search(r"\d+\s*(%|x|users|ms|days|weeks)", answer_text or "", flags=re.IGNORECASE))

    answer_tokens = set(_tokenize(answer_text))
    stack_hits: List[str] = []
    for skill in anchor_stack or []:
        skill_tokens = set(_tokenize(skill))
        if skill_tokens and skill_tokens.issubset(answer_tokens):
            stack_hits.append(skill)

    star = _star_signals(answer_text) if category.lower() == "behavioral" else None
    summary = _first_words(answer_text, 40)

    return {
        "id": idx,
        "category": category,
        "question": question_text,
        "word_count": word_count,
        "is_skipped": is_skipped,
        "has_metrics": has_metrics,
        "ownership": _ownership(answer_text),
        "keywords_used": stack_hits[:6],
        "star": star,
        "summary": summary,
    }


def build_transcript_and_metrics(
    questions: List[Any],
    answers: List[Any],
    anchors: Dict[str, Any] = None,
) -> Dict[str, Any]:
    transcript_lines: List[str] = []
    answered = 0
    skipped = 0
    low_signal_count = 0
    entries: List[Dict[str, Any]] = []
    anchor_stack = list((anchors or {}).get("stack", []))

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

        entries.append(
            _signal_entry(
                idx=i,
                question=q_data,
                answer_text=answer_text,
                anchor_stack=anchor_stack,
            )
        )

    total_questions = len(questions or [])

    quality_summary = _build_response_quality_summary(answered, low_signal_count)

    return {
        "transcript": "\n".join(transcript_lines).strip(),
        "transcript_entries": entries,
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


def serialize_transcript_for_llm(entries: List[Dict[str, Any]], target_role: str) -> str:
    lines = [f"ROLE={target_role}"]
    for item in entries or []:
        star_value = item.get("star")
        if isinstance(star_value, dict):
            star_text = f"S={int(star_value.get('S', False))},T={int(star_value.get('T', False))},A={int(star_value.get('A', False))},R={int(star_value.get('R', False))}"
        else:
            star_text = "NA"

        keywords = ",".join(item.get("keywords_used", [])[:4]) or "none"
        summary = str(item.get("summary", "")).strip()

        lines.append(
            " | ".join([
                f"Q{item.get('id', 0)}",
                f"cat={item.get('category', 'General')}",
                f"wc={item.get('word_count', 0)}",
                f"skip={int(bool(item.get('is_skipped', False)))}",
                f"metric={int(bool(item.get('has_metrics', False)))}",
                f"owner={item.get('ownership', 'weak')}",
                f"kw={keywords}",
                f"star={star_text}",
                f"sum={summary}",
            ])
        )

    return "\n".join(lines)
