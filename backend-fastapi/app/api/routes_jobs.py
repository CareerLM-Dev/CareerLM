# app/api/routes_jobs.py
"""
Job Market Matcher API routes.
  POST /search   — match user skills against stored jobs (pgvector)
  POST /refresh  — fetch new jobs from JSearch, embed & store
"""

import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query

from app.services.job_search import ingest_jobs, match_jobs_for_user
from supabase_client import supabase

router = APIRouter()
logger = logging.getLogger(__name__)


# ── Auth helper (same pattern as other route files) ──────────────────

async def get_current_user(authorization: Optional[str] = Header(None)):
    """Extract user from JWT token."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")

    token = authorization.replace("Bearer ", "")

    try:
        user = supabase.auth.get_user(token)
        if not user or not user.user:
            raise HTTPException(status_code=401, detail="Invalid token")
        return user.user
    except HTTPException:
        raise
    except Exception as e:
        error_text = str(e).lower()
        network_markers = [
            "handshake operation timed out",
            "ssl",
            "timed out",
            "connection",
            "dns",
            "temporary failure",
            "name or service not known",
            "network is unreachable",
            "connection reset",
            "connection refused",
        ]
        if any(m in error_text for m in network_markers):
            logger.warning(f"Auth provider connectivity issue: {e}")
            raise HTTPException(
                status_code=503,
                detail="Authentication service temporarily unavailable. Please retry.",
            )
        raise HTTPException(status_code=401, detail=f"Authentication failed: {e}")


# ── Endpoints ────────────────────────────────────────────────────────

@router.post("/search")
async def search_jobs(
    role_query: str = Query(default="", description="Optional role/title to bias results toward"),
    user=Depends(get_current_user),
):
    """
    Match the authenticated user's skills (from latest resume skill_gap)
    against stored job postings using pgvector cosine similarity.

    Returns top-10 jobs with matching / missing skill breakdown.
    """
    try:
        # 1. Get latest resume
        resume_result = (
            supabase.table("resumes")
            .select("resume_id")
            .eq("user_id", user.id)
            .order("latest_update", desc=True)
            .limit(1)
            .execute()
        )
        if not resume_result.data:
            raise HTTPException(
                status_code=404,
                detail="No resume found. Upload a resume first.",
            )

        # 2. Get skill_gap from latest version
        version_result = (
            supabase.table("resume_versions")
            .select("skill_gap")
            .eq("resume_id", resume_result.data[0]["resume_id"])
            .order("version_number", desc=True)
            .limit(1)
            .execute()
        )
        if not version_result.data:
            raise HTTPException(
                status_code=404, detail="No resume version found."
            )

        skill_gap = version_result.data[0].get("skill_gap", {})
        if isinstance(skill_gap, str):
            skill_gap = json.loads(skill_gap)

        user_skills: list[str] = skill_gap.get("user_skills", [])
        if not user_skills:
            raise HTTPException(
                status_code=400,
                detail="No skills found in your resume. Run skill gap analysis first.",
            )

        # 3. Vector search (biased toward role_query if provided)
        matched_jobs = match_jobs_for_user(user_skills, role_query=role_query)

        return {
            "success": True,
            "user_skills": user_skills,
            "matched_jobs": matched_jobs,
            "total": len(matched_jobs),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Job search error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/refresh")
async def refresh_jobs(
    query: str = Query(..., description="Career / role to search for"),
    location: str = Query(default="", description="Optional location filter"),
    user=Depends(get_current_user),
):
    """
    Fetch latest jobs from JSearch API for the given query,
    extract skills, embed, and store in Supabase.
    """
    try:
        count = ingest_jobs(query, location)
        return {
            "success": True,
            "ingested": count,
            "message": f"Fetched and stored {count} new job postings",
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Job refresh error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
