# app/services/embedding.py
"""
Embedding utility using Google Gemini text-embedding-004.
Produces 768-dim vectors for pgvector cosine similarity.
Uses the same GEMINI_API_KEY already configured for the study planner.
"""

import logging
import os

from google import genai
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

_GEMINI_KEY = os.getenv("GEMINI_API_KEY")
_client: genai.Client | None = None
_EMBEDDING_MODEL = "gemini-embedding-001"


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        if not _GEMINI_KEY:
            raise ValueError("GEMINI_API_KEY not set — needed for embeddings")
        _client = genai.Client(api_key=_GEMINI_KEY)
    return _client


# Truncate to 768 dims — pgvector indexes cap at 2000, and 768 is
# the quality sweet-spot for cosine similarity.
_OUTPUT_DIMS = 768


def embed_text(text: str) -> list[float]:
    """Embed a single text string via Gemini gemini-embedding-001 (768-dim)."""
    client = _get_client()
    result = client.models.embed_content(
        model=_EMBEDDING_MODEL,
        contents=text,
        config={"output_dimensionality": _OUTPUT_DIMS},
    )
    return list(result.embeddings[0].values)


def embed_skills(skills: list[str]) -> list[float]:
    """Embed a list of skill names into a single vector."""
    return embed_text(", ".join(skills))
