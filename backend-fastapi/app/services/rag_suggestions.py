"""
RAG-backed suggestion helper.

Uses Supabase pgvector to retrieve relevant chunks. If retrieval fails or
returns nothing, falls back to LLM-based suggestions.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, List, Optional

from supabase_client import supabase
from app.agents.llm_config import GROQ_CLIENT, GROQ_DEFAULT_MODEL

try:
    from sentence_transformers import SentenceTransformer
except Exception:  # pragma: no cover - optional import for environments without the model
    SentenceTransformer = None


DEFAULT_EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"

logger = logging.getLogger(__name__)


def _extract_json(text: str) -> List[Dict[str, Any]]:
    if not text:
        return []
    match = re.search(r"\[(?:.|\n)*\]", text)
    if not match:
        return []
    try:
        data = json.loads(match.group(0))
        if isinstance(data, list):
            return [d for d in data if isinstance(d, dict)]
    except json.JSONDecodeError:
        return []
    return []


def _extract_json_object(text: str) -> Dict[str, Any]:
    if not text:
        return {}
    match = re.search(r"\{(?:.|\n)*\}", text)
    if not match:
        return {}
    try:
        data = json.loads(match.group(0))
        return data if isinstance(data, dict) else {}
    except json.JSONDecodeError:
        return {}


def _load_embedder(model_name: Optional[str] = None):
    if SentenceTransformer is None:
        return None
    return SentenceTransformer(model_name or DEFAULT_EMBEDDING_MODEL)


def _embed_query(embedder, text: str) -> List[float]:
    if not embedder:
        return []
    vec = embedder.encode([text], normalize_embeddings=True)[0]
    return vec.tolist()


def _match_chunks(query_embedding: List[float], category: Optional[str], limit: int) -> List[Dict[str, Any]]:
    if not query_embedding:
        return []
    try:
        # Requires a Postgres function named match_rag_chunks (see README/notes).
        result = supabase.rpc(
            "match_rag_chunks",
            {
                "query_embedding": query_embedding,
                "match_count": limit,
                "filter_category": category,
            },
        ).execute()
        return result.data or []
    except Exception as exc:
        logger.warning("RAG retrieval failed: %s", exc)
        return []


def _llm_rag_suggestions(
    chunks: List[Dict[str, Any]],
    resume_text: str,
    job_description: str,
) -> List[Dict[str, Any]]:
    if not chunks:
        return []

    context_lines: List[str] = []
    for i, chunk in enumerate(chunks[:6], start=1):
        title = (chunk.get("title") or "Untitled").strip()
        content = (chunk.get("content") or "").strip()
        if not content:
            continue
        snippet = content[:500].rstrip()
        context_lines.append(f"[{i}] {title}: {snippet}")

    context_block = "\n".join(context_lines)

    prompt = f"""You are a resume reviewer.
Use the following knowledge snippets to craft 3 concise, coherent improvement suggestions.
Do not copy the snippets verbatim. Summarize and tailor them to the resume.
Return ONLY a JSON array of objects with keys: title, explanation, evidence.
Set evidence to "RAG" for each item.

Knowledge snippets:
{context_block}

Resume:
{resume_text[:3500]}

Job Description (optional):
{job_description[:1500] if job_description else "(none)"}
"""
    try:
        response = GROQ_CLIENT.chat.completions.create(
            model=GROQ_DEFAULT_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=700,
        )
        content = response.choices[0].message.content.strip()
        suggestions = _extract_json(content)
        if suggestions:
            for item in suggestions:
                item.setdefault("evidence", "RAG")
            return suggestions
    except Exception:
        return []

    return []


def _llm_fallback_suggestions(resume_text: str, job_description: str) -> List[Dict[str, Any]]:
    prompt = f"""You are a resume reviewer.
Generate 3 concise, actionable improvement suggestions.
Return ONLY a JSON array of objects with keys: title, explanation.

Resume:
{resume_text[:4000]}

Job Description (optional):
{job_description[:2000] if job_description else "(none)"}
"""
    try:
        response = GROQ_CLIENT.chat.completions.create(
            model=GROQ_DEFAULT_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=600,
        )
        content = response.choices[0].message.content.strip()
        return _extract_json(content)
    except Exception:
        return []


def _llm_rag_evaluation(
    chunks: List[Dict[str, Any]],
    resume_text: str,
    job_description: str,
) -> Dict[str, Any]:
    context_lines: List[str] = []
    for i, chunk in enumerate(chunks[:8], start=1):
        title = (chunk.get("title") or "Untitled").strip()
        content = (chunk.get("content") or "").strip()
        if not content:
            continue
        snippet = content[:700].rstrip()
        context_lines.append(f"[{i}] {title}: {snippet}")

    context_block = "\n".join(context_lines)

    jd_instruction = (
        "Compare the resume against the JD and the knowledge rules to identify gaps and misalignments."
        if job_description
        else "Evaluate the resume against the knowledge rules."
    )
    prompt = f"""You are a senior resume reviewer.
Use the following knowledge snippets as scoring rules.
{jd_instruction}

Write in a neutral, impersonal tone. Do not mention the candidate's name or use second-person language.

Return ONLY valid JSON with exactly these keys: strengths, weaknesses, improvements.

Format rules:
- strengths: list of {{"title": "...", "explanation": "..."}}  (what the resume does well)
- weaknesses: list of {{"title": "...", "explanation": "..."}}  (concrete gaps found)
- improvements: list of {{"suggestion": "...", "explanation": "..."}}

Knowledge snippets:
{context_block}

Resume:
{resume_text[:4000]}

Job Description (optional):
{job_description[:1500] if job_description else "(none)"}
"""
    try:
        response = GROQ_CLIENT.chat.completions.create(
            model=GROQ_DEFAULT_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=900,
        )
        content = response.choices[0].message.content.strip()
        data = _extract_json_object(content)
        if data:
            return data
    except Exception:
        return {}

    return {}


# Common resume action verbs used to identify achievement bullet lines
_ACTION_VERBS = re.compile(
    r"^(?:developed|built|designed|implemented|led|managed|created|improved|increased|"
    r"reduced|delivered|architected|engineered|optimised|optimized|automated|launched|"
    r"deployed|maintained|collaborated|coordinated|mentored|trained|analyzed|researched|"
    r"established|streamlined|integrated|migrated|refactored|contributed|achieved|"
    r"spearheaded|oversaw|directed|conducted|executed|generated|owned|drove|scaled|"
    r"restructured|pioneered|facilitated|evaluated|authored|resolved|diagnosed)",
    re.IGNORECASE,
)


def _extract_section_bullets(sections: Dict[str, Any], keys: Optional[List[str]] = None) -> List[Dict[str, str]]:
    """Extract bullet-point / achievement lines from relevant resume sections.

    Captures:
    - Lines prefixed with a bullet character (-, •, –, *, ▪)
    - Numbered list lines (1. …)
    - Plain sentence lines that start with a recognised action verb (covers
      resumes where bullets were stripped during PDF extraction / sanitisation)
    """
    if not sections or not isinstance(sections, dict):
        return []

    target_keys = keys or ["experience", "projects"]
    bullets: List[Dict[str, str]] = []
    for key in target_keys:
        raw = sections.get(key)
        if not isinstance(raw, str) or not raw.strip():
            logger.debug("[BULLETS] Section '%s' is empty or not a string – skipping", key)
            continue
        logger.debug("[BULLETS] Scanning section '%s' (%d chars)", key, len(raw))
        for line in raw.splitlines():
            stripped = line.strip()
            if not stripped:
                continue
            # Bullet-prefixed line
            if stripped[0] in ("-", "•", "–", "*", "▪"):
                clean = re.sub(r"^[-•–*▪]\s*", "", stripped).strip()
                if len(clean) > 12:
                    bullets.append({"section_key": key, "original_text": clean})
                continue
            # Numbered list line
            if re.match(r"^\d+\.\s+", stripped):
                clean = re.sub(r"^\d+\.\s+", "", stripped).strip()
                if len(clean) > 12:
                    bullets.append({"section_key": key, "original_text": clean})
                continue
            # Plain sentence starting with an action verb (verb at position 0)
            if _ACTION_VERBS.match(stripped) and len(stripped) > 20:
                bullets.append({"section_key": key, "original_text": stripped})
    logger.info("[BULLETS] Extracted %d bullet candidates from sections %s", len(bullets), target_keys)
    return bullets


def _llm_bullet_rewrites(
    bullets: List[Dict[str, str]],
    job_description: str,
) -> List[Dict[str, Any]]:
    if not bullets:
        return []

    # Cap to avoid token overflow / JSON truncation
    capped_bullets = bullets[:8]

    bullet_block = "\n".join(
        f"[{i}] ({b['section_key']}) {b['original_text']}" for i, b in enumerate(capped_bullets, start=1)
    )

    prompt = f"""You are a resume coach. Your job is to rewrite weak resume bullets into stronger, more specific, and measurable ones.

Return ONLY a valid JSON array. No prose, no markdown, no explanation outside the array.

Each object in the array must have exactly these keys:
  "suggestion_id": "br_<number>" matching the bullet index (e.g. "br_1", "br_2")
  "section_key": the section name from the parentheses (e.g. "experience")
  "original_text": copy the original bullet text EXACTLY as provided
  "rewrite_text": an improved, stronger version of the bullet
  "reason": a brief explanation of what was improved

Bullets to rewrite:
{bullet_block}

Job Description (optional — use this to make rewrites more targeted):
{job_description[:1200] if job_description else "(none)"}

Output (JSON array only):"""
    try:
        response = GROQ_CLIENT.chat.completions.create(
            model=GROQ_DEFAULT_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=1500,
        )
        content = response.choices[0].message.content.strip()
        logger.debug("[BULLET_REWRITE] LLM raw response: %s", content[:500])
        data = _extract_json(content)
        if not data:
            logger.warning("[BULLET_REWRITE] LLM returned no parseable JSON")
            return []

        by_index = {f"br_{i+1}": b for i, b in enumerate(capped_bullets)}
        cleaned = []
        for pos, item in enumerate(data):
            suggestion_id = item.get("suggestion_id")
            # Primary: exact id match (e.g. "br_1")
            source = by_index.get(suggestion_id)
            # Fallback: if LLM ignored the id format, match by position
            if source is None and pos < len(capped_bullets):
                source = capped_bullets[pos]
                suggestion_id = f"br_{pos + 1}"
                logger.debug(
                    "[BULLET_REWRITE] suggestion_id '%s' not found; using positional fallback br_%d",
                    item.get("suggestion_id"), pos + 1,
                )
            if source is None:
                logger.debug("[BULLET_REWRITE] Skipping item with unresolvable suggestion_id: %s", suggestion_id)
                continue
            rewrite = item.get("rewrite_text") or ""
            if not rewrite:
                logger.debug("[BULLET_REWRITE] Empty rewrite_text for %s – skipping", suggestion_id)
                continue
            cleaned.append({
                "suggestion_id": suggestion_id,
                "section_key": source["section_key"],
                "original_text": source["original_text"],
                "rewrite_text": rewrite,
                "reason": item.get("reason") or "",
            })
        logger.info("[BULLET_REWRITE] Generated %d rewrites from %d bullets", len(cleaned), len(capped_bullets))
        return cleaned
    except Exception as exc:
        logger.exception("[BULLET_REWRITE] Unexpected error: %s", exc)
        return []


def get_resume_rag_suggestions(
    resume_text: str,
    job_description: str = "",
    category: Optional[str] = "resume",
    limit: int = 6,
) -> List[Dict[str, Any]]:
    if not resume_text:
        return []

    query_text = job_description.strip() or resume_text[:2000]

    embedder = _load_embedder()
    query_embedding = _embed_query(embedder, query_text) if embedder else []

    chunks = _match_chunks(query_embedding, category, limit)
    if chunks:
        suggestions = _llm_rag_suggestions(chunks, resume_text, job_description)
        if suggestions:
            logger.info("RAG suggestions used: %d", len(suggestions))
            return suggestions
        logger.info("RAG chunks found but LLM synthesis failed")

    # Fallback to LLM if retrieval fails or returns nothing
    logger.info("RAG empty; falling back to LLM suggestions")
    return _llm_fallback_suggestions(resume_text, job_description)


def get_resume_rag_evaluation(
    resume_text: str,
    job_description: str = "",
    category: Optional[str] = "resume",
    limit: int = 8,
    parsed_sections: Optional[Dict[str, Any]] = None,
) -> Dict[str, List[Dict[str, Any]]]:
    if not resume_text:
        return {"strengths": [], "weaknesses": [], "suggestions": []}

    def _merge_suggestions(
        improvements: List[Dict[str, Any]],
        bullet_rewrites: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        merged: List[Dict[str, Any]] = []

        for idx, item in enumerate(improvements or [], start=1):
            merged.append({
                "suggestion_id": f"impr_{idx}",
                "section_key": "",
                "original_text": "",
                "rewrite_text": "",
                "suggestion": item.get("suggestion") or "",
                "explanation": item.get("explanation") or "",
                "bullet_rewrite": "",
            })

        for item in bullet_rewrites or []:
            merged.append({
                "suggestion_id": item.get("suggestion_id") or "",
                "section_key": item.get("section_key") or "",
                "original_text": item.get("original_text") or "",
                "rewrite_text": item.get("rewrite_text") or "",
                "suggestion": "",
                "explanation": item.get("reason") or "",
                "bullet_rewrite": item.get("rewrite_text") or "",
            })

        return merged

    query_text = job_description.strip() or resume_text[:2000]

    embedder = _load_embedder()
    query_embedding = _embed_query(embedder, query_text) if embedder else []

    chunks = _match_chunks(query_embedding, category, limit)
    if chunks:
        evaluation = _llm_rag_evaluation(chunks, resume_text, job_description)
        strengths = evaluation.get("strengths", []) if isinstance(evaluation, dict) else []
        weaknesses = evaluation.get("weaknesses", []) if isinstance(evaluation, dict) else []
        improvements = evaluation.get("improvements", []) if isinstance(evaluation, dict) else []
        bullets = _extract_section_bullets(parsed_sections or {})
        bullet_rewrites = _llm_bullet_rewrites(bullets, job_description)
        if strengths or weaknesses or improvements or bullet_rewrites:
            logger.info("RAG evaluation used: %d strengths, %d weaknesses", len(strengths), len(weaknesses))
            return {
                "strengths": strengths,
                "weaknesses": weaknesses,
                "suggestions": _merge_suggestions(improvements, bullet_rewrites),
            }
        logger.info("RAG chunks found but evaluation failed")

    logger.info("RAG empty; falling back to LLM evaluation")
    fallback = _llm_rag_evaluation([], resume_text, job_description)
    bullets = _extract_section_bullets(parsed_sections or {})
    bullet_rewrites = _llm_bullet_rewrites(bullets, job_description)
    return {
        "strengths": fallback.get("strengths", []),
        "weaknesses": fallback.get("weaknesses", []),
        "suggestions": _merge_suggestions(fallback.get("improvements", []), bullet_rewrites),
    }
