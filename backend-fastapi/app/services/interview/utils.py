import re


def truncate_natural(text: str, max_chars: int) -> str:
    if not text:
        return ""

    cleaned = str(text).strip()
    if len(cleaned) <= max_chars:
        return cleaned

    candidate = cleaned[: max_chars + 1]

    sentence_endings = [candidate.rfind(". "), candidate.rfind("? "), candidate.rfind("! "), candidate.rfind("\n\n")]
    best_sentence_idx = max(sentence_endings)

    if best_sentence_idx >= int(max_chars * 0.6):
        return candidate[: best_sentence_idx + 1].strip()

    word_boundary = candidate.rfind(" ")
    if word_boundary > 0:
        return f"{candidate[:word_boundary].strip()}..."

    return f"{candidate[:max_chars].strip()}..."


def extract_balanced_json_object(text: str, start_index: int) -> str:
    depth = 0
    in_string = False
    escape_next = False
    json_start = -1

    for idx in range(start_index, len(text)):
        ch = text[idx]

        if escape_next:
            escape_next = False
            continue

        if ch == "\\":
            escape_next = True
            continue

        if ch == '"':
            in_string = not in_string
            continue

        if in_string:
            continue

        if ch == "{":
            if depth == 0:
                json_start = idx
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0 and json_start >= 0:
                return text[json_start : idx + 1]

    return ""


STOPWORDS = {
    "a", "an", "the", "in", "on", "to", "for", "of", "and",
    "how", "what", "tell", "me", "about", "your", "you", "describe", "explain",
}


def _normalized_tokens(text: str) -> set:
    base = (text or "").lower()
    words = [w for w in re.findall(r"[a-z0-9]+", base) if w and w not in STOPWORDS]
    return set(words)


def is_duplicate(new_question: str, existing_questions: list[str], threshold: float = 0.75) -> bool:
    candidate_tokens = _normalized_tokens(new_question)
    if not candidate_tokens:
        return True

    for existing in existing_questions or []:
        existing_tokens = _normalized_tokens(existing)
        if not existing_tokens:
            continue

        union = candidate_tokens | existing_tokens
        if not union:
            continue

        overlap = len(candidate_tokens & existing_tokens) / len(union)
        if overlap >= threshold:
            return True

    return False
