from itertools import zip_longest
from typing import Any, Dict, List


def build_transcript_and_metrics(questions: List[Any], answers: List[Any]) -> Dict[str, Any]:
    transcript_lines: List[str] = []
    answered = 0
    skipped = 0

    for i, (q, a) in enumerate(zip_longest(questions or [], answers or [], fillvalue=""), 1):
        q_data = q if isinstance(q, dict) else {}
        question_category = str(q_data.get("category", "General"))
        question_text = str(q_data.get("question", "[No question provided]"))
        answer_text = str(a).strip() if isinstance(a, str) else str(a).strip()

        transcript_lines.append(f"**Q{i} [{question_category}]:** {question_text}")
        if answer_text and answer_text != "[Skipped]":
            transcript_lines.append(f"**A{i}:** {answer_text}")
            answered += 1
        else:
            transcript_lines.append("**A{i}:** [Skipped]".replace("{i}", str(i)))
            skipped += 1

    total_questions = len(questions or [])

    return {
        "transcript": "\n".join(transcript_lines).strip(),
        "total_questions": total_questions,
        "answered_count": answered,
        "skipped_count": skipped,
        "metrics": {
            "total": total_questions,
            "answered": answered,
            "skipped": skipped,
        },
    }
