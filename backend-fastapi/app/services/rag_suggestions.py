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

Return ONLY valid JSON with exactly these keys: strengths, weaknesses, suggestions.

Format rules:
- strengths: list of {{"title": "...", "explanation": "..."}}  (what the resume does well)
- weaknesses: list of {{"title": "...", "explanation": "..."}}  (concrete gaps found)
- suggestions: list of {{"suggestion": "...", "explanation": "...", "bullet_rewrite": "..."}}  
  * suggestion  = short imperative action (e.g. "Quantify impact in project bullets")
  * explanation = why this matters based on the rules
  * bullet_rewrite = a concrete improved bullet point pulled from or inspired by the resume,
    using strong action verbs and measurable outcomes (e.g. "Led migration of X, reducing latency by 40%")

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
) -> Dict[str, List[Dict[str, Any]]]:
    if not resume_text:
        return {"strengths": [], "weaknesses": [], "suggestions": []}

    query_text = job_description.strip() or resume_text[:2000]

    embedder = _load_embedder()
    query_embedding = _embed_query(embedder, query_text) if embedder else []

    chunks = _match_chunks(query_embedding, category, limit)
    if chunks:
        evaluation = _llm_rag_evaluation(chunks, resume_text, job_description)
        strengths = evaluation.get("strengths", []) if isinstance(evaluation, dict) else []
        weaknesses = evaluation.get("weaknesses", []) if isinstance(evaluation, dict) else []
        suggestions = evaluation.get("suggestions", []) if isinstance(evaluation, dict) else []
        if strengths or weaknesses or suggestions:
            logger.info("RAG evaluation used: %d strengths, %d weaknesses", len(strengths), len(weaknesses))
            return {
                "strengths": strengths,
                "weaknesses": weaknesses,
                "suggestions": suggestions,
            }
        logger.info("RAG chunks found but evaluation failed")

    logger.info("RAG empty; falling back to LLM evaluation")
    fallback = _llm_rag_evaluation([], resume_text, job_description)
    return {
        "strengths": fallback.get("strengths", []),
        "weaknesses": fallback.get("weaknesses", []),
        "suggestions": fallback.get("suggestions", []),
    }
