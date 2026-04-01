# app/services/job_search.py
"""
Job Market service:
  1. Fetch postings from JSearch (RapidAPI)
  2. Extract required skills via LLM
  3. Embed skills with sentence-transformers
  4. Store in Supabase (pgvector)
  5. Match user skills against stored jobs
"""

import json
import logging
import os
from typing import Optional

import requests

from app.agents.llm_config import GROQ_CLIENT, GROQ_DEFAULT_MODEL
from app.services.embedding import embed_text
from supabase_client import supabase

logger = logging.getLogger(__name__)

JSEARCH_API_KEY = os.getenv("JSEARCH_API_KEY")
JSEARCH_HOST = "jsearch.p.rapidapi.com"


# ------------------------------------------------------------------ #
# 1.  Fetch from JSearch API                                          #
# ------------------------------------------------------------------ #

def fetch_jobs_from_api(
    query: str,
    location: str = "",
    num_pages: int = 1,
) -> list[dict]:
    """Call JSearch (RapidAPI) and return raw job dicts."""
    if not JSEARCH_API_KEY:
        raise ValueError(
            "JSEARCH_API_KEY not configured. "
            "Get a free key at https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch "
            "and add it to your .env file."
        )

    search_query = f"{query} in {location}" if location else query

    resp = requests.get(
        f"https://{JSEARCH_HOST}/search",
        headers={
            "x-rapidapi-key": JSEARCH_API_KEY,
            "x-rapidapi-host": JSEARCH_HOST,
        },
        params={
            "query": search_query,
            "page": "1",
            "num_pages": str(num_pages),
        },
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json().get("data", [])


# ------------------------------------------------------------------ #
# 2.  Extract skills from a job description via LLM                    #
# ------------------------------------------------------------------ #

def _extract_skills_from_description(description: str) -> list[str]:
    """Use Groq LLM to pull required skills out of a job description."""
    try:
        prompt = (
            "Extract the required technical skills, tools, and frameworks "
            "from this job description. Return ONLY a JSON array of skill "
            "names — no explanation, no markdown.\n"
            'Example: ["Python", "React", "AWS", "Docker", "PostgreSQL"]\n\n'
            f"Job Description:\n{description[:3000]}"
        )
        response = GROQ_CLIENT.chat.completions.create(
            model=GROQ_DEFAULT_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
            max_tokens=500,
        )
        text = (response.choices[0].message.content or "").strip()
        start = text.find("[")
        end = text.rfind("]") + 1
        if start != -1 and end > start:
            skills = json.loads(text[start:end])
            return [s.strip() for s in skills if isinstance(s, str) and s.strip()]
    except Exception as e:
        logger.warning(f"Skill extraction failed: {e}")
    return []


# ------------------------------------------------------------------ #
# 3.  Ingest jobs (fetch → extract → embed → store)                   #
# ------------------------------------------------------------------ #

def ingest_jobs(query: str, location: str = "") -> int:
    """
    Full ingestion pipeline.

    Returns:
        Number of newly stored jobs.
    """
    raw_jobs = fetch_jobs_from_api(query, location)
    ingested = 0

    for job in raw_jobs:
        external_id = job.get("job_id")
        if not external_id:
            continue

        # Skip duplicates
        try:
            existing = (
                supabase.table("job_postings")
                .select("id")
                .eq("external_id", external_id)
                .limit(1)
                .execute()
            )
            if existing.data:
                continue
        except Exception:
            pass

        title = job.get("job_title", "Unknown")
        company = job.get("employer_name", "")
        description = job.get("job_description") or ""

        # Location
        loc_parts = [
            p
            for p in [
                job.get("job_city", ""),
                job.get("job_state", ""),
                job.get("job_country", ""),
            ]
            if p
        ]
        location_str = ", ".join(loc_parts)

        # Salary
        min_sal = job.get("job_min_salary")
        max_sal = job.get("job_max_salary")
        salary = ""
        if min_sal and max_sal:
            salary = f"${int(min_sal):,} - ${int(max_sal):,}"
        elif min_sal:
            salary = f"${int(min_sal):,}+"

        # Skills extraction
        required_skills = _extract_skills_from_description(description)

        # Embedding (title + skills for best semantic match)
        embed_input = (
            f"{title}. Skills: {', '.join(required_skills)}"
            if required_skills
            else title
        )
        embedding = embed_text(embed_input)

        # Store
        try:
            supabase.table("job_postings").insert(
                {
                    "title": title,
                    "company": company,
                    "location": location_str,
                    "description": description[:5000],
                    "required_skills": required_skills,
                    "salary_range": salary,
                    "job_url": job.get("job_apply_link", ""),
                    "source": "jsearch",
                    "external_id": external_id,
                    "embedding": embedding,
                }
            ).execute()
            ingested += 1
        except Exception as e:
            logger.warning(f"Failed to store job {external_id}: {e}")

    logger.info(f"Ingested {ingested}/{len(raw_jobs)} jobs for query '{query}'")
    return ingested


# ------------------------------------------------------------------ #
# 4.  Match user skills against stored jobs (pgvector)                 #
# ------------------------------------------------------------------ #

def match_jobs_for_user(
    user_skills: list[str],
    role_query: str = "",
    match_count: int = 10,
    match_threshold: float = 0.3,
) -> list[dict]:
    """
    Embed the user's skills (optionally combined with a role query),
    run pgvector cosine similarity, and annotate each result with
    matching / missing skills.
    """
    if not user_skills:
        return []

    # Combine role query with skills for more targeted vector search
    embed_input = ", ".join(user_skills)
    if role_query:
        embed_input = f"{role_query}. Skills: {embed_input}"
    query_embedding = embed_text(embed_input)

    try:
        # Fetch extra results when role_query is given so we can re-rank
        fetch_count = match_count * 3 if role_query else match_count

        result = supabase.rpc(
            "match_jobs",
            {
                "query_embedding": query_embedding,
                "match_threshold": match_threshold,
                "match_count": fetch_count,
            },
        ).execute()

        if not result.data:
            return []

        user_skills_lower = {s.lower() for s in user_skills}
        role_query_lower = role_query.lower().strip() if role_query else ""
        matched_jobs: list[dict] = []

        for job in result.data:
            job_skills = job.get("required_skills", [])
            if isinstance(job_skills, str):
                job_skills = json.loads(job_skills)

            matching = [s for s in job_skills if s.lower() in user_skills_lower]
            missing = [s for s in job_skills if s.lower() not in user_skills_lower]
            match_pct = (
                (len(matching) / len(job_skills) * 100) if job_skills else 0
            )

            # Title relevance boost: if the job title contains the role query,
            # boost the similarity score so it sorts higher
            title_lower = (job.get("title") or "").lower()
            title_boost = 0.0
            if role_query_lower and role_query_lower in title_lower:
                title_boost = 0.15

            matched_jobs.append(
                {
                    "id": job["id"],
                    "title": job["title"],
                    "company": job.get("company", ""),
                    "location": job.get("location", ""),
                    "description": (job.get("description") or "")[:500],
                    "salary_range": job.get("salary_range", ""),
                    "job_url": job.get("job_url", ""),
                    "source": job.get("source", ""),
                    "similarity": round(
                        min(job.get("similarity", 0) + title_boost, 1.0) * 100, 1
                    ),
                    "required_skills": job_skills,
                    "matching_skills": matching,
                    "missing_skills": missing,
                    "match_percentage": round(match_pct, 1),
                }
            )

        # Re-rank by boosted similarity and trim to requested count
        matched_jobs.sort(key=lambda j: j["similarity"], reverse=True)
        return matched_jobs[:match_count]

    except Exception as e:
        logger.error(f"Job matching failed: {e}")
        return []
