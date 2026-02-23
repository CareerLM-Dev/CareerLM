import json
import re
from typing import Any, Dict, List, Optional

from .schemas import FeedbackOutput, QuestionList
from .utils import extract_balanced_json_object


def recover_questions_from_error(error_text: str) -> List[Dict[str, Any]]:
    if not error_text:
        return []

    tag_match = re.search(r"<function=QuestionList>\s*(.*?)\s*</function>", error_text, flags=re.DOTALL)
    if tag_match:
        tagged_payload = tag_match.group(1).strip()

        if tagged_payload.startswith("{") and not tagged_payload.endswith("}"):
            tagged_payload = tagged_payload + "}"

        if tagged_payload.startswith("["):
            tagged_payload = f'{{"questions": {tagged_payload}}}'

        open_braces = tagged_payload.count("{")
        close_braces = tagged_payload.count("}")
        if close_braces < open_braces:
            tagged_payload += "}" * (open_braces - close_braces)

        open_brackets = tagged_payload.count("[")
        close_brackets = tagged_payload.count("]")
        if close_brackets < open_brackets:
            tagged_payload += "]" * (open_brackets - close_brackets)

        try:
            parsed_tagged = json.loads(tagged_payload)
            validated_tagged = QuestionList.model_validate(parsed_tagged)
            return [q.model_dump() for q in validated_tagged.questions]
        except Exception:
            pass

    if "<function=QuestionList>" in error_text:
        start_idx = error_text.find("<function=QuestionList>") + len("<function=QuestionList>")
        payload_snippet = error_text[start_idx:].strip()

        if payload_snippet.startswith("{"):
            json_blob = extract_balanced_json_object(payload_snippet, 0)
            if json_blob:
                try:
                    parsed = json.loads(json_blob)
                    validated = QuestionList.model_validate(parsed)
                    return [q.model_dump() for q in validated.questions]
                except Exception:
                    pass

    candidate_starts = []
    tool_anchor = error_text.find("<function=QuestionList>")
    if tool_anchor >= 0:
        brace_after_tool = error_text.find("{", tool_anchor)
        if brace_after_tool >= 0:
            candidate_starts.append(brace_after_tool)

    questions_anchor = error_text.find('"questions"')
    if questions_anchor >= 0:
        brace_before_questions = error_text.rfind("{", 0, questions_anchor)
        if brace_before_questions >= 0:
            candidate_starts.append(brace_before_questions)

    if not candidate_starts:
        first_brace = error_text.find("{")
        if first_brace >= 0:
            candidate_starts.append(first_brace)

    for start in candidate_starts:
        json_blob = extract_balanced_json_object(error_text, start)
        if not json_blob:
            continue

        try:
            parsed = json.loads(json_blob)
            if isinstance(parsed, dict) and "questions" in parsed:
                validated = QuestionList.model_validate(parsed)
                return [q.model_dump() for q in validated.questions]
        except Exception:
            continue

    return []


def recover_feedback_from_error(error_text: str) -> Optional[FeedbackOutput]:
    if not error_text:
        return None

    tag_match = re.search(r"<function=FeedbackOutput>\s*(.*?)\s*</function>", error_text, flags=re.DOTALL)
    if tag_match:
        tagged_payload = tag_match.group(1).strip()

        if tagged_payload.startswith("{") and not tagged_payload.endswith("}"):
            tagged_payload = tagged_payload + "}"

        open_braces = tagged_payload.count("{")
        close_braces = tagged_payload.count("}")
        if close_braces < open_braces:
            tagged_payload += "}" * (open_braces - close_braces)

        open_brackets = tagged_payload.count("[")
        close_brackets = tagged_payload.count("]")
        if close_brackets < open_brackets:
            tagged_payload += "]" * (open_brackets - close_brackets)

        try:
            parsed_tagged = json.loads(tagged_payload)
            validated_feedback = FeedbackOutput.model_validate(parsed_tagged)
            return validated_feedback
        except Exception:
            pass

    if "<function=FeedbackOutput>" in error_text:
        start_idx = error_text.find("<function=FeedbackOutput>") + len("<function=FeedbackOutput>")
        payload_snippet = error_text[start_idx:].strip()

        if payload_snippet.startswith("{"):
            json_blob = extract_balanced_json_object(payload_snippet, 0)
            if json_blob:
                try:
                    parsed = json.loads(json_blob)
                    validated = FeedbackOutput.model_validate(parsed)
                    return validated
                except Exception:
                    pass

    candidate_starts = []
    summary_anchor = error_text.find('"executive_summary"')
    if summary_anchor >= 0:
        brace_before = error_text.rfind("{", 0, summary_anchor)
        if brace_before >= 0:
            candidate_starts.append(brace_before)

    if not candidate_starts:
        first_brace = error_text.find("{")
        if first_brace >= 0:
            candidate_starts.append(first_brace)

    for start in candidate_starts:
        json_blob = extract_balanced_json_object(error_text, start)
        if not json_blob:
            continue

        try:
            parsed = json.loads(json_blob)
            validated = FeedbackOutput.model_validate(parsed)
            return validated
        except Exception:
            continue

    return None
