"""
Nodes for the study planner agent.
Integrates roadmap.sh AI for authoritative learning sequences, then enhances
with Gemini 2.0 Flash Google Search to fetch verified learning resources.

Improvements:
- Roadmap.sh as source of truth for skill sequencing
- Per-skill Gemini calls to find resources aligned with roadmap structure
- Retry with simplified prompt before falling to curated fallback
- Schedule builder that rolls up durations into a weekly timeline
"""

import json
import logging
import math
import re as _re
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed
from dotenv import load_dotenv
from typing import Optional

import requests

from .state import StudyPlannerState
from app.agents.llm_config import GEMINI_CLIENT, GEMINI_MODEL, GROQ_CLIENT, GROQ_DEFAULT_MODEL

# Setup logging
logger = logging.getLogger(__name__)

load_dotenv()

# ────────────────────────────────────────────────────────
# Roadmap.sh API Integration
# ────────────────────────────────────────────────────────
ROADMAP_SH_API = "https://roadmap.sh/api/v1"
ROADMAP_SH_BASE = "https://roadmap.sh"
ROADMAP_API_TIMEOUT = 10

# Skill-to-roadmap mapping for roadmap.sh API
SKILL_TO_ROADMAP_ID = {
    "python": "python",
    "javascript": "javascript",
    "typescript": "typescript",
    "react": "react",
    "angular": "angular",
    "vue.js": "vue",
    "vue": "vue",
    "node.js": "nodejs",
    "nodejs": "nodejs",
    "java": "java",
    "c++": "cpp",
    "cpp": "cpp",
    "rust": "rust",
    "go": "golang",
    "golang": "golang",
    "docker": "docker",
    "kubernetes": "kubernetes",
    "terraform": "terraform",
    "jenkins": "devops",
    "aws": "aws",
    "azure": "devops",
    "gcp": "devops",
    "google cloud": "devops",
    "google cloud platform": "devops",
    "sql": "sql",
    "postgresql": "postgresql-dba",
    "mysql": "sql",
    "mongodb": "mongodb",
    "git": "git-github",
    "graphql": "graphql",
    "linux": "linux",
    "devops": "devops",
    "django": "python",
    "flask": "python",
    "fastapi": "python",
    "spring": "spring-boot",
    "spring-boot": "spring-boot",
    "system design": "system-design",
    "rest api": "api-design",
    "full stack": "full-stack",
    "frontend": "frontend",
    "backend": "backend",
}

# ────────────────────────────────────────────────────────
# URL validation timeout (seconds) for HEAD requests
# ────────────────────────────────────────────────────────
URL_CHECK_TIMEOUT = 5
URL_CHECK_MAX_WORKERS = 10


def _get_roadmap_sh_id(skill: str) -> Optional[str]:
    """Get the roadmap.sh roadmap ID for a skill.

    Normalizes noisy skill labels (e.g., "Terraform6", "Azure (Cloud)")
    before lookup so links remain stable.
    """
    if not skill:
        return None

    key = skill.strip().lower()

    # direct hit first
    mapped = SKILL_TO_ROADMAP_ID.get(key)
    if mapped:
        return mapped

    # remove bracketed qualifiers: "azure (cloud)" -> "azure"
    normalized = _re.sub(r"\(.*?\)", "", key).strip()
    # keep useful chars, collapse separators
    normalized = _re.sub(r"[^a-z0-9+\-\.\s]", " ", normalized)
    normalized = _re.sub(r"\s+", " ", normalized).strip()

    # remove trailing digits per token: "terraform6" -> "terraform"
    normalized = " ".join(_re.sub(r"\d+$", "", token) for token in normalized.split())
    normalized = normalized.strip()

    # normalized hit
    mapped = SKILL_TO_ROADMAP_ID.get(normalized)
    if mapped:
        return mapped

    # compact hit: "node js" -> "nodejs"
    compact = normalized.replace(" ", "")
    mapped = SKILL_TO_ROADMAP_ID.get(compact)
    if mapped:
        return mapped

    # token-level fallback for phrases like "jenkins pipelines"
    for token in normalized.split():
        mapped = SKILL_TO_ROADMAP_ID.get(token)
        if mapped:
            return mapped

    return None


def _fetch_roadmap_sh_data(skill: str) -> Optional[dict]:
    """
    Fetch the JSON roadmap structure from roadmap.sh API.
    Returns the roadmap data or None if not found.
    """
    roadmap_id = _get_roadmap_sh_id(skill)
    if not roadmap_id:
        return None
    
    try:
        url = f"{ROADMAP_SH_API}/roadmaps/{roadmap_id}.json"
        response = requests.get(url, timeout=ROADMAP_API_TIMEOUT)
        if response.status_code == 200:
            data = response.json()
            logger.info(f"[Roadmap.sh] Fetched roadmap for {skill} (ID: {roadmap_id})")
            return data
    except Exception as e:
        logger.warning(f"[Roadmap.sh] Failed to fetch roadmap for {skill}: {e}")
    
    return None


def _get_roadmap_sh_url(skill: str) -> str:
    """Get the roadmap.sh URL for a skill."""
    roadmap_id = _get_roadmap_sh_id(skill)
    if roadmap_id:
        return f"{ROADMAP_SH_BASE}/{roadmap_id}"
    # Fallback to best practices
    return f"{ROADMAP_SH_BASE}/best-practices"


def validate_input_node(state: StudyPlannerState) -> dict:
    """Validate and sanitise the incoming request."""
    target_career = (state.get("target_career") or "").strip()
    missing_skills = state.get("missing_skills", [])

    if not target_career:
        return {"error": "target_career is required"}

    # Deduplicate & limit to 7 skills max to keep Gemini prompt reasonable
    seen = set()
    clean_skills = []
    for s in missing_skills:
        s_lower = s.strip().lower()
        if s_lower and s_lower not in seen:
            seen.add(s_lower)
            clean_skills.append(s.strip())
    clean_skills = clean_skills[:7]

    if not clean_skills:
        return {"error": "At least one missing skill is required"}

    return {
        "target_career": target_career,
        "missing_skills": clean_skills,
    }


# ────────────────────────────────────────────────────────
# Node 2: Sequence skills by prerequisite dependency
# ────────────────────────────────────────────────────────

def sequence_skills_node(state: StudyPlannerState) -> dict:
    """
    Use an LLM to order the missing skills by prerequisite dependency.
    Skills that are foundations (e.g. Python) come before skills that
    depend on them (e.g. Django, FastAPI).
    """
    if state.get("error"):
        return {}

    missing_skills = state["missing_skills"]

    # If 1 skill, no ordering needed
    if len(missing_skills) <= 1:
        return {"ordered_skills": missing_skills}

    skills_list = ", ".join(missing_skills)

    prompt = f"""You are an expert curriculum designer. Given these skills a student needs to learn:

{skills_list}

Order them from first-to-learn to last-to-learn based on prerequisite dependencies.
A foundational skill (e.g. Python, HTML, SQL) should come before any skill that builds on it (e.g. Django, React, PostgreSQL).

Rules:
- Return ONLY a JSON array of the skill names in the correct learning order.
- Use the EXACT skill names provided — do not rename, merge, or add skills.
- If two skills are independent, keep their relative order.

Example input: "Django, Python, REST API, Docker"
Example output: ["Python", "REST API", "Django", "Docker"]

Output ONLY the JSON array, nothing else."""

    try:
        response = GROQ_CLIENT.chat.completions.create(
            model=GROQ_DEFAULT_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            max_tokens=300,
        )
        content = response.choices[0].message.content
        if not content:
            logger.warning("[Study Planner] Skill ordering returned empty, using original order")
            return {"ordered_skills": missing_skills}
        raw = content.strip()

        # Extract JSON array from response
        start = raw.find("[")
        end = raw.rfind("]") + 1
        if start != -1 and end > start:
            ordered = json.loads(raw[start:end])
            # Validate: must contain exactly the same skills
            ordered_lower = {s.lower() for s in ordered}
            original_lower = {s.lower() for s in missing_skills}
            if ordered_lower == original_lower:
                # Map back to original casing
                original_map = {s.lower(): s for s in missing_skills}
                ordered_skills = [original_map[s.lower()] for s in ordered]
                logger.info(f"[Study Planner] Skills ordered: {ordered_skills}")
                return {"ordered_skills": ordered_skills, "missing_skills": ordered_skills}

        logger.warning("[Study Planner] Skill ordering response invalid, using original order")
        return {"ordered_skills": missing_skills}

    except Exception as exc:
        logger.warning(f"[Study Planner] Skill ordering failed ({exc}), using original order")
        return {"ordered_skills": missing_skills}


# ────────────────────────────────────────────────────────
# Node 3: Fetch live resources via Gemini — PER-SKILL calls
# ────────────────────────────────────────────────────────

# Maximum Gemini retry attempts per skill before curated fallback
_GEMINI_MAX_RETRIES = 2


def _build_personalisation_block(qa: dict) -> str:
    """Build the personalisation context block from questionnaire answers."""
    if not qa:
        return ""

    parts = []

    # Target role
    roles = qa.get("target_role", [])
    if roles:
        readable = [r.replace("_", " ").title() for r in roles]
        parts.append(f"- **Target Role(s):** {', '.join(readable)}")

    # Primary goal
    goals = qa.get("primary_goal", [])
    goal_map = {
        "get_first_job": "Land their first job — focus on fundamentals, portfolio-ready projects, and interview prep",
        "switch_careers": "Switch careers — bridge transferable skills, emphasise practical projects",
        "upskill": "Upskill in current role — intermediate/advanced resources, real-world depth",
        "freelance": "Freelance — practical, client-ready skills and portfolio pieces",
        "build_projects": "Build projects — hands-on, project-based learning",
        "interview_prep": "Interview prep — algorithmic practice, system design, mock interviews",
        "learn_technology": "Learn a new technology — structured beginner-to-advanced path",
    }
    if goals:
        goal_descs = [goal_map.get(g) or g.replace("_", " ").title() for g in goals]
        parts.append(f"- **Primary Goal(s):** {'; '.join(goal_descs)}")

    # Learning preference
    prefs = qa.get("learning_preference", [])
    pref_map = {
        "video_tutorials": "Video tutorials (prioritise YouTube playlists & video courses)",
        "hands_on": "Hands-on / project-based (prioritise interactive labs, coding challenges, build-along projects)",
        "reading": "Reading & documentation (prioritise official docs, books, written tutorials)",
        "interactive": "Interactive platforms (prioritise Codecademy, freeCodeCamp, LeetCode-style sites)",
        "mentor": "Mentorship / community (include Discord/community links, mentorship platforms)",
        "mixed": "Mixed / no strong preference",
    }
    if prefs:
        pref_descs = [pref_map.get(p) or p.replace("_", " ").title() for p in prefs]
        parts.append(f"- **Learning Style:** {'; '.join(pref_descs)}")

    # Time commitment
    time = qa.get("time_commitment", [])
    time_map = {
        "5_hours_week": "~5 hours/week — keep each step concise (micro-learning, short videos, bite-sized docs)",
        "10_hours_week": "~10 hours/week — moderate depth, one skill at a time",
        "20_hours_week": "~20 hours/week — immersive roadmap, can handle longer courses",
        "30_hours_week": "~30 hours/week — intensive bootcamp-style pace",
        "flexible": "Flexible schedule — provide estimated durations but no strict pacing",
    }
    if time:
        time_descs = [time_map.get(t) or t.replace("_", " ") for t in time]
        parts.append(f"- **Time Commitment:** {'; '.join(time_descs)}")

    if not parts:
        return ""

    return (
        "\n\nUser Profile (tailor resource choice, difficulty, and durations accordingly):\n"
        + "\n".join(parts)
        + "\n\nPersonalisation rules:\n"
        "• If the user prefers VIDEO learning, make at least 2 out of 3 resources video-based.\n"
        "• If the user prefers READING, make at least 2 out of 3 resources documentation or article-based.\n"
        "• If the user prefers HANDS-ON, include interactive labs, coding challenges, or project-based resources.\n"
        "• Match est_time values to the user's weekly time commitment.\n"
        "• Adjust difficulty to match the user's goal.\n"
    )


def _build_skill_prompt(skill: str, target_career: str, personalisation: str, roadmap_url: str) -> str:
    """
    Build a focused Gemini prompt for a SINGLE skill.
    Incorporates roadmap.sh URL as the authoritative learning guide,
    then finds 3 vetted resources to supplement it.
    """
    return f"""Role: Professional Resource Scout.

Context: The user wants to become a **{target_career}** and needs to learn **{skill}**.
{personalisation}
Task: Provide 3 curated learning resources for **{skill}** to use alongside the roadmap.sh learning guide.

Roadmap.sh Reference: {roadmap_url}
(The user should refer to this roadmap as the authoritative learning sequence. Your job is to find 3 HIGH-QUALITY resources that align with key phases of that roadmap.)

Rules:
- Roadmap URL: Use this exact URL → {roadmap_url}
- Provide exactly 3 resources, each from a DIFFERENT platform.
  Platforms: YouTube (freeCodeCamp, Fireship, Traversy Media, etc.), Udemy, Coursera, edX, freeCodeCamp, Codecademy, Exercism, Kaggle, Scrimba, official docs, MDN, etc.
- Every URL must be a DIRECT link — no google.com/search or youtube.com/results links.
- For each resource, also suggest 2 alt_platforms with name + direct URL.
- Resources should align with foundational, intermediate, and hands-on phases.

Output strictly JSON, no preamble:
{{
  "skill": "{skill}",
  "roadmap_url": "{roadmap_url}",
  "roadmap": [
    {{"step": 1, "label": "Foundations", "type": "Documentation", "title": "...", "url": "https://...", "est_time": "...",
      "alt_platforms": [{{"name": "...", "url": "https://..."}}, {{"name": "...", "url": "https://..."}}]
    }},
    {{"step": 2, "label": "Deep Dive", "type": "YouTube", "title": "...", "url": "https://...", "est_time": "...",
      "alt_platforms": [{{"name": "...", "url": "https://..."}}, {{"name": "...", "url": "https://..."}}]
    }},
    {{"step": 3, "label": "Hands-on Practice", "type": "Interactive", "title": "...", "url": "https://...", "est_time": "...",
      "alt_platforms": [{{"name": "...", "url": "https://..."}}, {{"name": "...", "url": "https://..."}}]
    }}
  ]
}}"""


def _simplified_retry_prompt(skill: str, target_career: str, roadmap_url: str) -> str:
    """
    Simplified retry prompt — no personalisation, stricter format.
    Used when the first attempt fails or returns bad JSON.
    Includes roadmap.sh URL as reference.
    """
    return f"""Find 3 learning resources for **{skill}** (career goal: {target_career}).
Reference: {roadmap_url}

Return ONLY this JSON (no extra text):
{{
  "skill": "{skill}",
  "roadmap_url": "{roadmap_url}",
  "roadmap": [
    {{"step": 1, "label": "Foundations", "type": "Documentation", "title": "...", "url": "https://...", "est_time": "2-3 hours", "alt_platforms": []}},
    {{"step": 2, "label": "Deep Dive", "type": "YouTube", "title": "...", "url": "https://...", "est_time": "4-6 hours", "alt_platforms": []}},
    {{"step": 3, "label": "Hands-on Practice", "type": "Interactive", "title": "...", "url": "https://...", "est_time": "1-2 weeks", "alt_platforms": []}}
  ]
}}"""


def _parse_skill_response(raw: str, skill: str) -> dict | None:
    """
    Parse Gemini response for a single skill.
    Returns normalised skill_gap_report entry or None on failure.
    """
    if not raw:
        return None

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        # Try to extract JSON object from surrounding text
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start == -1 or end <= start:
            return None
        try:
            data = json.loads(raw[start:end])
        except json.JSONDecodeError:
            return None

    roadmap = data.get("roadmap", [])
    if not roadmap:
        return None

    learning_path = []
    for step in roadmap:
        learning_path.append({
            "step": step.get("step"),
            "label": step.get("label", ""),
            "type": step.get("type", "Resource"),
            "title": step.get("title", ""),
            "url": step.get("url", ""),
            "platform": step.get("platform", ""),
            "est_time": step.get("est_time", ""),
            "cost": "Free",
            "alt_platforms": step.get("alt_platforms", []),
        })

    return {
        "skill": data.get("skill", skill),
        "roadmap_url": data.get("roadmap_url", ""),
        "learning_path": learning_path,
    }


def _fetch_single_skill(
    skill: str,
    target_career: str,
    personalisation: str,
    roadmap_url: str,
    gemini_client,
    types_module,
) -> dict | None:
    """
    Fetch resources for ONE skill with retry logic.

    Attempt 1: Full personalised prompt with roadmap.sh reference.
    Attempt 2: Simplified prompt (fewer instructions, stricter format).
    Returns parsed result or None if both attempts fail.
    """
    prompts = [
        _build_skill_prompt(skill, target_career, personalisation, roadmap_url),
        _simplified_retry_prompt(skill, target_career, roadmap_url),
    ]

    for attempt, prompt in enumerate(prompts, 1):
        try:
            response = gemini_client.models.generate_content(
                model=GEMINI_MODEL,
                contents=prompt,
                config=types_module.GenerateContentConfig(
                    tools=[types_module.Tool(google_search=types_module.GoogleSearch())],
                    response_mime_type="application/json",
                ),
            )
            raw = response.text or ""
            if not raw:
                logger.warning(f"[Study Planner] Skill '{skill}' attempt {attempt}: empty response")
                continue

            result = _parse_skill_response(raw, skill)
            if result:
                logger.info(f"[Study Planner] Skill '{skill}' succeeded on attempt {attempt}")
                return result
            else:
                logger.warning(f"[Study Planner] Skill '{skill}' attempt {attempt}: bad JSON structure")

        except Exception as exc:
            logger.warning(f"[Study Planner] Skill '{skill}' attempt {attempt} failed: {exc}")

    logger.warning(f"[Study Planner] Skill '{skill}' exhausted all {len(prompts)} attempts")
    return None


def _get_curated_skill_entry(skill: str) -> dict:
    """
    Build a curated fallback entry for a skill.
    Used when Gemini fails both attempts.
    """
    key = skill.strip().lower()
    roadmap_url = _get_roadmap_sh_url(skill)

    if key in CURATED_RESOURCES:
        return {
            "skill": skill,
            "roadmap_url": roadmap_url,
            "learning_path": [dict(step) for step in CURATED_RESOURCES[key]],
        }

    doc_url = _get_doc_url(skill)
    return {
        "skill": skill,
        "roadmap_url": roadmap_url,
        "learning_path": [
            {"step": 1, "label": "Read Basics", "type": "Documentation",
             "title": f"Official {skill} Documentation", "url": doc_url,
             "est_time": "2-3 hours", "cost": "Free", "alt_platforms": []},
            {"step": 2, "label": "Visual Roadmap", "type": "Roadmap",
             "title": f"{skill} Learning Roadmap (roadmap.sh)", "url": roadmap_url,
             "est_time": "1 hour", "cost": "Free", "alt_platforms": []},
            {"step": 3, "label": "Hands-on Practice", "type": "Interactive",
             "title": f"{skill} Track on Exercism", "platform": "Exercism",
             "url": f"https://exercism.org/tracks/{key.replace(' ', '-')}",
             "est_time": "2-4 weeks", "cost": "Free", "alt_platforms": []},
        ],
    }


def fetch_live_resources_node(state: StudyPlannerState) -> dict:
    """
    Call Gemini 2.0 Flash with Google Search grounding to get
    live learning resources — ONE call per skill for better quality.
    
    Leverages roadmap.sh as the authoritative learning structure,
    then finds curated resources aligned with that roadmap.

    Each skill gets up to 2 attempts (full prompt → simplified retry).
    Skills that exhaust both attempts fall through to curated resources.
    """
    if state.get("error"):
        return {}

    from google.genai import types

    if not GEMINI_CLIENT:
        return {"error": "GEMINI_API_KEY not configured"}

    gemini_client = GEMINI_CLIENT
    missing_skills = state["missing_skills"]
    target_career = state["target_career"]

    # Build personalisation block once (shared across skills)
    qa = state.get("questionnaire_answers") or {}
    personalisation = _build_personalisation_block(qa)

    # Fetch each skill sequentially (Gemini rate limits make parallel risky)
    skill_gap_report: list[dict] = []
    study_plan: list[dict] = []
    gemini_successes = 0
    curated_fallbacks = 0

    for skill in missing_skills:
        # Get the roadmap.sh URL for this skill
        roadmap_url = _get_roadmap_sh_url(skill)
        logger.info(f"[Roadmap.sh] Skill '{skill}' → {roadmap_url}")
        
        result = _fetch_single_skill(skill, target_career, personalisation, roadmap_url, gemini_client, types)

        if result:
            skill_gap_report.append(result)
            study_plan.append({"skill": result["skill"], "roadmap": result.get("learning_path", [])})
            gemini_successes += 1
        else:
            # Both attempts failed — use curated fallback for this skill
            curated_entry = _get_curated_skill_entry(skill)
            skill_gap_report.append(curated_entry)
            study_plan.append({"skill": curated_entry["skill"], "roadmap": curated_entry["learning_path"]})
            curated_fallbacks += 1
            logger.info(f"[Study Planner] Skill '{skill}' fell through to curated resources")

    logger.info(
        f"[Study Planner] Completed: {gemini_successes} from Gemini, "
        f"{curated_fallbacks} from curated fallback"
    )

    # If at least some results came back, don't set error
    if skill_gap_report:
        return {
            "study_plan": study_plan,
            "skill_gap_report": skill_gap_report,
        }

    return {
        "study_plan": [],
        "skill_gap_report": [],
        "error": "All Gemini calls failed and no curated resources available",
    }


# ────────────────────────────────────────────────────────
# Static resource maps
# ────────────────────────────────────────────────────────

# Well-known official documentation sites for common technologies (fallback)
KNOWN_DOCS = {
    "python": "https://docs.python.org/3/tutorial/",
    "javascript": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide",
    "typescript": "https://www.typescriptlang.org/docs/",
    "react": "https://react.dev/learn",
    "node.js": "https://nodejs.org/en/docs/",
    "docker": "https://docs.docker.com/get-started/",
    "kubernetes": "https://kubernetes.io/docs/tutorials/",
    "aws": "https://docs.aws.amazon.com/",
    "azure": "https://learn.microsoft.com/en-us/azure/",
    "gcp": "https://cloud.google.com/docs",
    "sql": "https://www.w3schools.com/sql/",
    "postgresql": "https://www.postgresql.org/docs/current/tutorial.html",
    "mongodb": "https://www.mongodb.com/docs/manual/tutorial/",
    "git": "https://git-scm.com/doc",
    "django": "https://docs.djangoproject.com/en/stable/intro/tutorial01/",
    "flask": "https://flask.palletsprojects.com/en/latest/quickstart/",
    "fastapi": "https://fastapi.tiangolo.com/tutorial/",
    "tensorflow": "https://www.tensorflow.org/tutorials",
    "pytorch": "https://pytorch.org/tutorials/",
    "java": "https://docs.oracle.com/javase/tutorial/",
    "c++": "https://en.cppreference.com/w/cpp/language",
    "rust": "https://doc.rust-lang.org/book/",
    "go": "https://go.dev/doc/tutorial/getting-started",
    "linux": "https://linux.die.net/man/",
    "css": "https://developer.mozilla.org/en-US/docs/Web/CSS",
    "html": "https://developer.mozilla.org/en-US/docs/Web/HTML",
    "graphql": "https://graphql.org/learn/",
    "rest api": "https://restfulapi.net/",
    "ci/cd": "https://docs.github.com/en/actions",
    "terraform": "https://developer.hashicorp.com/terraform/tutorials",
    "ansible": "https://docs.ansible.com/ansible/latest/getting_started/",
    "pandas": "https://pandas.pydata.org/docs/getting_started/",
    "numpy": "https://numpy.org/doc/stable/user/quickstart.html",
    "scikit-learn": "https://scikit-learn.org/stable/tutorial/",
    "machine learning": "https://developers.google.com/machine-learning/crash-course",
    "deep learning": "https://www.deeplearning.ai/courses/",
    "nlp": "https://huggingface.co/learn/nlp-course",
    "data visualization": "https://matplotlib.org/stable/tutorials/",
    "tableau": "https://www.tableau.com/learn/training",
    "power bi": "https://learn.microsoft.com/en-us/power-bi/fundamentals/",
    "excel": "https://support.microsoft.com/en-us/excel",
    "spark": "https://spark.apache.org/docs/latest/quick-start.html",
    "hadoop": "https://hadoop.apache.org/docs/stable/",
    "nginx": "https://nginx.org/en/docs/beginners_guide.html",
    "jenkins": "https://www.jenkins.io/doc/tutorials/",
}


def _get_doc_url(skill: str) -> str:
    """Return the known official docs URL for a skill, or a DevDocs fallback."""
    key = skill.strip().lower()
    if key in KNOWN_DOCS:
        return KNOWN_DOCS[key]
    return f"https://devdocs.io/{key.replace(' ', '-')}/"


# ────────────────────────────────────────────────────────
# Curated fallback resources — DIRECT URLs, no search links
# Each skill maps to 3 verified, specific resource URLs
# covering: Documentation → Video → Hands-on
# ────────────────────────────────────────────────────────
CURATED_RESOURCES = {
    "python": [
        {"step": 1, "label": "Read Basics", "type": "Documentation", "title": "The Python Tutorial (Official Docs)", "url": "https://docs.python.org/3/tutorial/", "est_time": "3-4 hours", "cost": "Free",
         "alt_platforms": [{"name": "Real Python", "url": "https://realpython.com/python-first-steps/"}, {"name": "W3Schools", "url": "https://www.w3schools.com/python/"}]},
        {"step": 2, "label": "Deep Dive", "type": "YouTube", "title": "Python for Beginners – Full Course (Programming with Mosh)", "url": "https://www.youtube.com/watch?v=_uQrJ0TkZlc", "est_time": "6 hours", "cost": "Free",
         "alt_platforms": [{"name": "freeCodeCamp", "url": "https://www.youtube.com/watch?v=rfscVS0vtbw"}, {"name": "Corey Schafer", "url": "https://www.youtube.com/playlist?list=PL-osiE80TeTt2d9bfVyTiXJA-UTHn6WwU"}]},
        {"step": 3, "label": "Hands-on Practice", "type": "Interactive", "title": "Python Track on Exercism", "platform": "Exercism", "url": "https://exercism.org/tracks/python", "est_time": "2-4 weeks", "cost": "Free",
         "alt_platforms": [{"name": "Codecademy", "url": "https://www.codecademy.com/learn/learn-python-3"}, {"name": "HackerRank", "url": "https://www.hackerrank.com/domains/python"}]},
    ],
    "javascript": [
        {"step": 1, "label": "Read Basics", "type": "Documentation", "title": "JavaScript Guide (MDN Web Docs)", "url": "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide", "est_time": "3-4 hours", "cost": "Free",
         "alt_platforms": [{"name": "javascript.info", "url": "https://javascript.info/"}, {"name": "W3Schools", "url": "https://www.w3schools.com/js/"}]},
        {"step": 2, "label": "Deep Dive", "type": "YouTube", "title": "JavaScript Full Course for Beginners (freeCodeCamp)", "url": "https://www.youtube.com/watch?v=PkZNo7MFNFg", "est_time": "3.5 hours", "cost": "Free",
         "alt_platforms": [{"name": "Traversy Media", "url": "https://www.youtube.com/watch?v=hdI2bqOjy3c"}, {"name": "Fireship", "url": "https://www.youtube.com/watch?v=lkIFF4maKMU"}]},
        {"step": 3, "label": "Hands-on Practice", "type": "Interactive", "title": "JavaScript Algorithms and Data Structures (freeCodeCamp)", "platform": "freeCodeCamp", "url": "https://www.freecodecamp.org/learn/javascript-algorithms-and-data-structures/", "est_time": "2-4 weeks", "cost": "Free",
         "alt_platforms": [{"name": "Exercism", "url": "https://exercism.org/tracks/javascript"}, {"name": "Codecademy", "url": "https://www.codecademy.com/learn/introduction-to-javascript"}]},
    ],
    "react": [
        {"step": 1, "label": "Read Basics", "type": "Documentation", "title": "React Quick Start (Official Docs)", "url": "https://react.dev/learn", "est_time": "2-3 hours", "cost": "Free",
         "alt_platforms": [{"name": "W3Schools", "url": "https://www.w3schools.com/react/"}, {"name": "MDN", "url": "https://developer.mozilla.org/en-US/docs/Learn/Tools_and_testing/Client-side_JavaScript_frameworks/React_getting_started"}]},
        {"step": 2, "label": "Deep Dive", "type": "YouTube", "title": "React Course for Beginners (freeCodeCamp)", "url": "https://www.youtube.com/watch?v=bMknfKXIFA8", "est_time": "12 hours", "cost": "Free",
         "alt_platforms": [{"name": "Traversy Media", "url": "https://www.youtube.com/watch?v=LDB4uaJ87e0"}, {"name": "Net Ninja", "url": "https://www.youtube.com/playlist?list=PL4cUxeGkcC9gZD-Tvwfod2gaISzfRiP9d"}]},
        {"step": 3, "label": "Hands-on Practice", "type": "Interactive", "title": "Learn React (Scrimba)", "platform": "Scrimba", "url": "https://scrimba.com/learn/learnreact", "est_time": "2-3 weeks", "cost": "Free",
         "alt_platforms": [{"name": "Codecademy", "url": "https://www.codecademy.com/learn/react-101"}, {"name": "freeCodeCamp", "url": "https://www.freecodecamp.org/learn/front-end-development-libraries/#react"}]},
    ],
    "docker": [
        {"step": 1, "label": "Read Basics", "type": "Documentation", "title": "Docker Get Started Guide", "url": "https://docs.docker.com/get-started/", "est_time": "2 hours", "cost": "Free",
         "alt_platforms": [{"name": "Docker Labs", "url": "https://github.com/docker/labs"}, {"name": "DevDocs", "url": "https://devdocs.io/docker/"}]},
        {"step": 2, "label": "Deep Dive", "type": "YouTube", "title": "Docker Tutorial for Beginners (TechWorld with Nana)", "url": "https://www.youtube.com/watch?v=3c-iBn73dDE", "est_time": "3 hours", "cost": "Free",
         "alt_platforms": [{"name": "freeCodeCamp", "url": "https://www.youtube.com/watch?v=fqMOX6JJhGo"}, {"name": "Fireship", "url": "https://www.youtube.com/watch?v=gAkwW2tuIqE"}]},
        {"step": 3, "label": "Hands-on Practice", "type": "Interactive", "title": "Play with Docker (Docker Labs)", "platform": "Docker", "url": "https://labs.play-with-docker.com/", "est_time": "1-2 weeks", "cost": "Free",
         "alt_platforms": [{"name": "KodeKloud", "url": "https://kodekloud.com/courses/docker-for-the-absolute-beginner/"}, {"name": "Katacoda (O'Reilly)", "url": "https://www.oreilly.com/"}]},
    ],
    "sql": [
        {"step": 1, "label": "Read Basics", "type": "Documentation", "title": "SQL Tutorial (W3Schools)", "url": "https://www.w3schools.com/sql/", "est_time": "2-3 hours", "cost": "Free",
         "alt_platforms": [{"name": "SQLBolt", "url": "https://sqlbolt.com/"}, {"name": "Mode SQL Tutorial", "url": "https://mode.com/sql-tutorial/"}]},
        {"step": 2, "label": "Deep Dive", "type": "YouTube", "title": "SQL Full Course (freeCodeCamp)", "url": "https://www.youtube.com/watch?v=HXV3zeQKqGY", "est_time": "4 hours", "cost": "Free",
         "alt_platforms": [{"name": "Programming with Mosh", "url": "https://www.youtube.com/watch?v=7S_tz1z_5bA"}, {"name": "Fireship", "url": "https://www.youtube.com/watch?v=zsjvFFKOm3c"}]},
        {"step": 3, "label": "Hands-on Practice", "type": "Interactive", "title": "SQLZoo Interactive Exercises", "platform": "SQLZoo", "url": "https://sqlzoo.net/wiki/SQL_Tutorial", "est_time": "1-2 weeks", "cost": "Free",
         "alt_platforms": [{"name": "HackerRank SQL", "url": "https://www.hackerrank.com/domains/sql"}, {"name": "LeetCode Database", "url": "https://leetcode.com/problemset/database/"}]},
    ],
    "git": [
        {"step": 1, "label": "Read Basics", "type": "Documentation", "title": "Pro Git Book (Official)", "url": "https://git-scm.com/book/en/v2", "est_time": "2-3 hours", "cost": "Free",
         "alt_platforms": [{"name": "Atlassian Git Tutorial", "url": "https://www.atlassian.com/git/tutorials"}, {"name": "GitHub Docs", "url": "https://docs.github.com/en/get-started/using-git"}]},
        {"step": 2, "label": "Deep Dive", "type": "YouTube", "title": "Git and GitHub for Beginners (freeCodeCamp)", "url": "https://www.youtube.com/watch?v=RGOj5yH7evk", "est_time": "1 hour", "cost": "Free",
         "alt_platforms": [{"name": "Fireship", "url": "https://www.youtube.com/watch?v=HkdAHXoRtos"}, {"name": "Traversy Media", "url": "https://www.youtube.com/watch?v=SWYqp7iY_Tc"}]},
        {"step": 3, "label": "Hands-on Practice", "type": "Interactive", "title": "Learn Git Branching", "platform": "learngitbranching.js.org", "url": "https://learngitbranching.js.org/", "est_time": "3-5 hours", "cost": "Free",
         "alt_platforms": [{"name": "GitHub Skills", "url": "https://skills.github.com/"}, {"name": "Exercism", "url": "https://exercism.org/"}]},
    ],
    "java": [
        {"step": 1, "label": "Read Basics", "type": "Documentation", "title": "The Java Tutorials (Oracle)", "url": "https://docs.oracle.com/javase/tutorial/", "est_time": "3-4 hours", "cost": "Free",
         "alt_platforms": [{"name": "W3Schools", "url": "https://www.w3schools.com/java/"}, {"name": "Dev.java", "url": "https://dev.java/learn/"}]},
        {"step": 2, "label": "Deep Dive", "type": "YouTube", "title": "Java Full Course for Beginners (freeCodeCamp)", "url": "https://www.youtube.com/watch?v=GoXwIVyNvX0", "est_time": "10 hours", "cost": "Free",
         "alt_platforms": [{"name": "Programming with Mosh", "url": "https://www.youtube.com/watch?v=eIrMbAQSU34"}, {"name": "Bro Code", "url": "https://www.youtube.com/watch?v=xk4_1vDrzzo"}]},
        {"step": 3, "label": "Hands-on Practice", "type": "Interactive", "title": "Java Track on Exercism", "platform": "Exercism", "url": "https://exercism.org/tracks/java", "est_time": "2-4 weeks", "cost": "Free",
         "alt_platforms": [{"name": "HackerRank", "url": "https://www.hackerrank.com/domains/java"}, {"name": "Codecademy", "url": "https://www.codecademy.com/learn/learn-java"}]},
    ],
    "typescript": [
        {"step": 1, "label": "Read Basics", "type": "Documentation", "title": "TypeScript Handbook (Official)", "url": "https://www.typescriptlang.org/docs/handbook/intro.html", "est_time": "2-3 hours", "cost": "Free",
         "alt_platforms": [{"name": "TypeScript Deep Dive", "url": "https://basarat.gitbook.io/typescript/"}, {"name": "W3Schools", "url": "https://www.w3schools.com/typescript/"}]},
        {"step": 2, "label": "Deep Dive", "type": "YouTube", "title": "TypeScript Full Course (Net Ninja)", "url": "https://www.youtube.com/playlist?list=PL4cUxeGkcC9gUgr39Q_yD6v-bSyMwKPUI", "est_time": "3 hours", "cost": "Free",
         "alt_platforms": [{"name": "freeCodeCamp", "url": "https://www.youtube.com/watch?v=30LWjhZzg50"}, {"name": "Fireship", "url": "https://www.youtube.com/watch?v=zQnBQ4tB3ZA"}]},
        {"step": 3, "label": "Hands-on Practice", "type": "Interactive", "title": "TypeScript Track on Exercism", "platform": "Exercism", "url": "https://exercism.org/tracks/typescript", "est_time": "2-3 weeks", "cost": "Free",
         "alt_platforms": [{"name": "Type Challenges", "url": "https://github.com/type-challenges/type-challenges"}, {"name": "Codecademy", "url": "https://www.codecademy.com/learn/learn-typescript"}]},
    ],
    "node.js": [
        {"step": 1, "label": "Read Basics", "type": "Documentation", "title": "Introduction to Node.js (Official)", "url": "https://nodejs.org/en/learn/getting-started/introduction-to-nodejs", "est_time": "2 hours", "cost": "Free",
         "alt_platforms": [{"name": "W3Schools", "url": "https://www.w3schools.com/nodejs/"}, {"name": "MDN", "url": "https://developer.mozilla.org/en-US/docs/Learn/Server-side/Express_Nodejs"}]},
        {"step": 2, "label": "Deep Dive", "type": "YouTube", "title": "Node.js and Express.js Full Course (freeCodeCamp)", "url": "https://www.youtube.com/watch?v=Oe421EPjeBE", "est_time": "8 hours", "cost": "Free",
         "alt_platforms": [{"name": "Traversy Media", "url": "https://www.youtube.com/watch?v=fBNz5xF-Kx4"}, {"name": "Net Ninja", "url": "https://www.youtube.com/playlist?list=PL4cUxeGkcC9jsz4LDYc6kv3ymONOKxwBU"}]},
        {"step": 3, "label": "Hands-on Practice", "type": "Interactive", "title": "learnyounode (NodeSchool)", "platform": "NodeSchool", "url": "https://nodeschool.io/", "est_time": "1-2 weeks", "cost": "Free",
         "alt_platforms": [{"name": "Exercism", "url": "https://exercism.org/tracks/javascript"}, {"name": "freeCodeCamp", "url": "https://www.freecodecamp.org/learn/back-end-development-and-apis/"}]},
    ],
    "kubernetes": [
        {"step": 1, "label": "Read Basics", "type": "Documentation", "title": "Kubernetes Basics Tutorial (Official)", "url": "https://kubernetes.io/docs/tutorials/kubernetes-basics/", "est_time": "2-3 hours", "cost": "Free",
         "alt_platforms": [{"name": "Kubernetes by Example", "url": "https://kubernetesbyexample.com/"}, {"name": "DevDocs", "url": "https://devdocs.io/kubernetes/"}]},
        {"step": 2, "label": "Deep Dive", "type": "YouTube", "title": "Kubernetes Tutorial for Beginners (TechWorld with Nana)", "url": "https://www.youtube.com/watch?v=X48VuDVv0do", "est_time": "4 hours", "cost": "Free",
         "alt_platforms": [{"name": "freeCodeCamp", "url": "https://www.youtube.com/watch?v=d6WC5n9G_sM"}, {"name": "Fireship", "url": "https://www.youtube.com/watch?v=PziYflu8cB8"}]},
        {"step": 3, "label": "Hands-on Practice", "type": "Interactive", "title": "Play with Kubernetes", "platform": "Kubernetes", "url": "https://labs.play-with-k8s.com/", "est_time": "1-2 weeks", "cost": "Free",
         "alt_platforms": [{"name": "KodeKloud", "url": "https://kodekloud.com/courses/kubernetes-for-the-absolute-beginners-hands-on/"}, {"name": "Killer Shell", "url": "https://killer.sh/"}]},
    ],
    "aws": [
        {"step": 1, "label": "Read Basics", "type": "Documentation", "title": "AWS Getting Started Resource Center", "url": "https://aws.amazon.com/getting-started/", "est_time": "2-3 hours", "cost": "Free",
         "alt_platforms": [{"name": "AWS Well-Architected", "url": "https://aws.amazon.com/architecture/well-architected/"}, {"name": "AWS Skill Builder", "url": "https://skillbuilder.aws/"}]},
        {"step": 2, "label": "Deep Dive", "type": "YouTube", "title": "AWS Certified Cloud Practitioner (freeCodeCamp)", "url": "https://www.youtube.com/watch?v=SOTamWNgDKc", "est_time": "14 hours", "cost": "Free",
         "alt_platforms": [{"name": "TechWorld with Nana", "url": "https://www.youtube.com/watch?v=ZB5ONbD_SMY"}, {"name": "Stephane Maarek", "url": "https://www.youtube.com/watch?v=ulprqHHWlng"}]},
        {"step": 3, "label": "Hands-on Practice", "type": "Course", "title": "AWS Cloud Quest (AWS Skill Builder)", "platform": "AWS", "url": "https://explore.skillbuilder.aws/learn/course/external/view/elearning/11458/aws-cloud-quest-cloud-practitioner", "est_time": "2-4 weeks", "cost": "Free",
         "alt_platforms": [{"name": "A Cloud Guru", "url": "https://acloudguru.com/"}, {"name": "Coursera AWS", "url": "https://www.coursera.org/aws"}]},
    ],
    "machine learning": [
        {"step": 1, "label": "Read Basics", "type": "Documentation", "title": "Google ML Crash Course", "url": "https://developers.google.com/machine-learning/crash-course", "est_time": "4-5 hours", "cost": "Free",
         "alt_platforms": [{"name": "scikit-learn Tutorial", "url": "https://scikit-learn.org/stable/tutorial/"}, {"name": "ML Glossary", "url": "https://ml-cheatsheet.readthedocs.io/en/latest/"}]},
        {"step": 2, "label": "Deep Dive", "type": "YouTube", "title": "Machine Learning Course for Beginners (freeCodeCamp)", "url": "https://www.youtube.com/watch?v=NWONeJKn6kc", "est_time": "10 hours", "cost": "Free",
         "alt_platforms": [{"name": "StatQuest", "url": "https://www.youtube.com/playlist?list=PLblh5JKOoLUICTaGLRoHQDuF_7q2GfuJF"}, {"name": "3Blue1Brown", "url": "https://www.youtube.com/playlist?list=PLZHQObOWTQDNU6R1_67000Dx_ZCJB-3pi"}]},
        {"step": 3, "label": "Hands-on Practice", "type": "Interactive", "title": "Intro to Machine Learning (Kaggle Learn)", "platform": "Kaggle", "url": "https://www.kaggle.com/learn/intro-to-machine-learning", "est_time": "2-3 weeks", "cost": "Free",
         "alt_platforms": [{"name": "Coursera ML (Andrew Ng)", "url": "https://www.coursera.org/learn/machine-learning"}, {"name": "fast.ai", "url": "https://course.fast.ai/"}]},
    ],
    "django": [
        {"step": 1, "label": "Read Basics", "type": "Documentation", "title": "Django Official Tutorial (Part 1)", "url": "https://docs.djangoproject.com/en/stable/intro/tutorial01/", "est_time": "3 hours", "cost": "Free",
         "alt_platforms": [{"name": "Django Girls Tutorial", "url": "https://tutorial.djangogirls.org/"}, {"name": "MDN Django", "url": "https://developer.mozilla.org/en-US/docs/Learn/Server-side/Django"}]},
        {"step": 2, "label": "Deep Dive", "type": "YouTube", "title": "Python Django Full Course (freeCodeCamp)", "url": "https://www.youtube.com/watch?v=F5mRW0jo-U4", "est_time": "4 hours", "cost": "Free",
         "alt_platforms": [{"name": "Corey Schafer", "url": "https://www.youtube.com/playlist?list=PL-osiE80TeTtoQCKZ03TU5fNfx2UY6U4p"}, {"name": "Dennis Ivy", "url": "https://www.youtube.com/watch?v=PtQiiknWUcI"}]},
        {"step": 3, "label": "Hands-on Practice", "type": "Course", "title": "Django for Everybody (Coursera / Univ. Michigan)", "platform": "Coursera", "url": "https://www.coursera.org/specializations/django", "est_time": "3-4 weeks", "cost": "Free (audit)",
         "alt_platforms": [{"name": "Codecademy", "url": "https://www.codecademy.com/learn/paths/build-python-web-apps-with-django"}, {"name": "Real Python", "url": "https://realpython.com/tutorials/django/"}]},
    ],
    "fastapi": [
        {"step": 1, "label": "Read Basics", "type": "Documentation", "title": "FastAPI Official Tutorial", "url": "https://fastapi.tiangolo.com/tutorial/", "est_time": "2-3 hours", "cost": "Free",
         "alt_platforms": [{"name": "TestDriven.io", "url": "https://testdriven.io/blog/fastapi-crud/"}, {"name": "Real Python", "url": "https://realpython.com/fastapi-python-web-apis/"}]},
        {"step": 2, "label": "Deep Dive", "type": "YouTube", "title": "FastAPI Full Course (freeCodeCamp)", "url": "https://www.youtube.com/watch?v=0sOvCWFmrtA", "est_time": "6 hours", "cost": "Free",
         "alt_platforms": [{"name": "ArjanCodes", "url": "https://www.youtube.com/watch?v=SORiTsvnU28"}, {"name": "Bitfumes", "url": "https://www.youtube.com/watch?v=7t2alSnE2-I"}]},
        {"step": 3, "label": "Hands-on Practice", "type": "Course", "title": "FastAPI Beyond CRUD (freeCodeCamp)", "platform": "freeCodeCamp", "url": "https://www.youtube.com/watch?v=TO4aQ3ghFOc", "est_time": "2-3 weeks", "cost": "Free",
         "alt_platforms": [{"name": "TestDriven.io", "url": "https://testdriven.io/courses/tdd-fastapi/"}, {"name": "Udemy", "url": "https://www.udemy.com/course/completefastapi/"}]},
    ],
    "deep learning": [
        {"step": 1, "label": "Read Basics", "type": "Documentation", "title": "Deep Learning Specialization Overview (deeplearning.ai)", "url": "https://www.deeplearning.ai/courses/deep-learning-specialization/", "est_time": "2-3 hours", "cost": "Free",
         "alt_platforms": [{"name": "PyTorch Tutorials", "url": "https://pytorch.org/tutorials/"}, {"name": "TensorFlow Tutorials", "url": "https://www.tensorflow.org/tutorials"}]},
        {"step": 2, "label": "Deep Dive", "type": "YouTube", "title": "Deep Learning Crash Course (freeCodeCamp)", "url": "https://www.youtube.com/watch?v=VyWAvY2CF9c", "est_time": "6 hours", "cost": "Free",
         "alt_platforms": [{"name": "3Blue1Brown Neural Networks", "url": "https://www.youtube.com/playlist?list=PLZHQObOWTQDNU6R1_67000Dx_ZCJB-3pi"}, {"name": "Sentdex", "url": "https://www.youtube.com/playlist?list=PLQVvvaa0QuDdeMyHEYc0gxFpYwHY2Qfdh"}]},
        {"step": 3, "label": "Hands-on Practice", "type": "Interactive", "title": "Practical Deep Learning for Coders (fast.ai)", "platform": "fast.ai", "url": "https://course.fast.ai/", "est_time": "4-6 weeks", "cost": "Free",
         "alt_platforms": [{"name": "Kaggle Deep Learning", "url": "https://www.kaggle.com/learn/intro-to-deep-learning"}, {"name": "Coursera Deep Learning", "url": "https://www.coursera.org/specializations/deep-learning"}]},
    ],
    "data science": [
        {"step": 1, "label": "Read Basics", "type": "Documentation", "title": "Python Data Science Handbook (Jake VanderPlas)", "url": "https://jakevdp.github.io/PythonDataScienceHandbook/", "est_time": "4-5 hours", "cost": "Free",
         "alt_platforms": [{"name": "Kaggle Learn", "url": "https://www.kaggle.com/learn"}, {"name": "pandas Docs", "url": "https://pandas.pydata.org/docs/getting_started/"}]},
        {"step": 2, "label": "Deep Dive", "type": "YouTube", "title": "Data Science Full Course (freeCodeCamp)", "url": "https://www.youtube.com/watch?v=ua-CiDNNj30", "est_time": "12 hours", "cost": "Free",
         "alt_platforms": [{"name": "StatQuest", "url": "https://www.youtube.com/c/joshstarmer"}, {"name": "Ken Jee", "url": "https://www.youtube.com/c/KenJee1"}]},
        {"step": 3, "label": "Hands-on Practice", "type": "Interactive", "title": "Intro to Data Science (Kaggle Learn)", "platform": "Kaggle", "url": "https://www.kaggle.com/learn/pandas", "est_time": "2-3 weeks", "cost": "Free",
         "alt_platforms": [{"name": "DataCamp", "url": "https://www.datacamp.com/"}, {"name": "Coursera IBM Data Science", "url": "https://www.coursera.org/professional-certificates/ibm-data-science"}]},
    ],
    "rust": [
        {"step": 1, "label": "Read Basics", "type": "Documentation", "title": "The Rust Programming Language (The Book)", "url": "https://doc.rust-lang.org/book/", "est_time": "4-5 hours", "cost": "Free",
         "alt_platforms": [{"name": "Rust by Example", "url": "https://doc.rust-lang.org/rust-by-example/"}, {"name": "Rustlings", "url": "https://github.com/rust-lang/rustlings"}]},
        {"step": 2, "label": "Deep Dive", "type": "YouTube", "title": "Rust Programming Full Course (freeCodeCamp)", "url": "https://www.youtube.com/watch?v=BpPEoZW5IiY", "est_time": "14 hours", "cost": "Free",
         "alt_platforms": [{"name": "Let's Get Rusty", "url": "https://www.youtube.com/c/LetsGetRusty"}, {"name": "No Boilerplate", "url": "https://www.youtube.com/c/NoBoilerplate"}]},
        {"step": 3, "label": "Hands-on Practice", "type": "Interactive", "title": "Rust Track on Exercism", "platform": "Exercism", "url": "https://exercism.org/tracks/rust", "est_time": "2-4 weeks", "cost": "Free",
         "alt_platforms": [{"name": "Rustlings", "url": "https://github.com/rust-lang/rustlings"}, {"name": "Advent of Code", "url": "https://adventofcode.com/"}]},
    ],
    "go": [
        {"step": 1, "label": "Read Basics", "type": "Documentation", "title": "A Tour of Go (Official)", "url": "https://go.dev/tour/welcome/1", "est_time": "2-3 hours", "cost": "Free",
         "alt_platforms": [{"name": "Go by Example", "url": "https://gobyexample.com/"}, {"name": "Effective Go", "url": "https://go.dev/doc/effective_go"}]},
        {"step": 2, "label": "Deep Dive", "type": "YouTube", "title": "Go Programming Full Course (freeCodeCamp)", "url": "https://www.youtube.com/watch?v=un6ZyFkqFKo", "est_time": "7 hours", "cost": "Free",
         "alt_platforms": [{"name": "TechWorld with Nana", "url": "https://www.youtube.com/watch?v=yyUHQIec83I"}, {"name": "Traversy Media", "url": "https://www.youtube.com/watch?v=SqrbIlUwR0U"}]},
        {"step": 3, "label": "Hands-on Practice", "type": "Interactive", "title": "Go Track on Exercism", "platform": "Exercism", "url": "https://exercism.org/tracks/go", "est_time": "2-3 weeks", "cost": "Free",
         "alt_platforms": [{"name": "Boot.dev Go", "url": "https://www.boot.dev/courses/learn-golang"}, {"name": "Codecademy Go", "url": "https://www.codecademy.com/learn/learn-go"}]},
    ],
    "linux": [
        {"step": 1, "label": "Read Basics", "type": "Documentation", "title": "Linux Journey", "url": "https://linuxjourney.com/", "est_time": "3-4 hours", "cost": "Free",
         "alt_platforms": [{"name": "Linux Handbook", "url": "https://linuxhandbook.com/"}, {"name": "Ubuntu Wiki", "url": "https://help.ubuntu.com/"}]},
        {"step": 2, "label": "Deep Dive", "type": "YouTube", "title": "Linux for Beginners (freeCodeCamp)", "url": "https://www.youtube.com/watch?v=sWbUDq4S6Y8", "est_time": "5 hours", "cost": "Free",
         "alt_platforms": [{"name": "NetworkChuck", "url": "https://www.youtube.com/watch?v=VbEx7B_PTOE"}, {"name": "LearnLinuxTV", "url": "https://www.youtube.com/c/LearnLinuxtv"}]},
        {"step": 3, "label": "Hands-on Practice", "type": "Interactive", "title": "OverTheWire Bandit (Linux Wargame)", "platform": "OverTheWire", "url": "https://overthewire.org/wargames/bandit/", "est_time": "1-2 weeks", "cost": "Free",
         "alt_platforms": [{"name": "Linux Survival", "url": "https://linuxsurvival.com/"}, {"name": "Exercism Bash", "url": "https://exercism.org/tracks/bash"}]},
    ],
    "c++": [
        {"step": 1, "label": "Read Basics", "type": "Documentation", "title": "C++ Reference (cppreference.com)", "url": "https://en.cppreference.com/w/cpp/language", "est_time": "3-4 hours", "cost": "Free",
         "alt_platforms": [{"name": "LearnCpp", "url": "https://www.learncpp.com/"}, {"name": "W3Schools C++", "url": "https://www.w3schools.com/cpp/"}]},
        {"step": 2, "label": "Deep Dive", "type": "YouTube", "title": "C++ Full Course for Beginners (freeCodeCamp)", "url": "https://www.youtube.com/watch?v=vLnPwxZdW4Y", "est_time": "4 hours", "cost": "Free",
         "alt_platforms": [{"name": "The Cherno", "url": "https://www.youtube.com/playlist?list=PLlrATfBNZ98dudnM48yfGUldqGD0S4FFb"}, {"name": "Bro Code", "url": "https://www.youtube.com/watch?v=-TkoO8Z07hI"}]},
        {"step": 3, "label": "Hands-on Practice", "type": "Interactive", "title": "C++ Track on Exercism", "platform": "Exercism", "url": "https://exercism.org/tracks/cpp", "est_time": "2-4 weeks", "cost": "Free",
         "alt_platforms": [{"name": "HackerRank C++", "url": "https://www.hackerrank.com/domains/cpp"}, {"name": "LeetCode", "url": "https://leetcode.com/"}]},
    ],
}


# ────────────────────────────────────────────────────────
# Node 4: Validate URLs via HEAD requests
# ────────────────────────────────────────────────────────

def _check_url(url: str) -> tuple[str, bool]:
    """
    Check if a URL is reachable via HEAD request.
    Returns (url, is_alive).
    """
    if not url or not url.startswith("http"):
        return url, False
    try:
        resp = requests.head(
            url,
            timeout=URL_CHECK_TIMEOUT,
            allow_redirects=True,
            headers={"User-Agent": "Mozilla/5.0 (CareerLM StudyPlanner URL Checker)"},
        )
        # Accept 2xx and 3xx; some sites return 405 for HEAD, try GET
        if resp.status_code < 400:
            return url, True
        if resp.status_code == 405:
            resp = requests.get(
                url,
                timeout=URL_CHECK_TIMEOUT,
                allow_redirects=True,
                headers={"User-Agent": "Mozilla/5.0 (CareerLM StudyPlanner URL Checker)"},
                stream=True,  # Don't download body
            )
            return url, resp.status_code < 400
        return url, False
    except (requests.RequestException, Exception):
        return url, False


def _get_curated_fallback_url(skill: str, step_index: int) -> dict | None:
    """
    Get a curated fallback resource for a specific skill and step.
    Returns the curated step dict or None if no curated resource exists.
    """
    key = skill.strip().lower()
    curated = CURATED_RESOURCES.get(key)
    if curated and step_index < len(curated):
        return curated[step_index]
    return None


def validate_urls_node(state: StudyPlannerState) -> dict:
    """
    Validate every URL in skill_gap_report. Dead links are replaced
    with curated fallback URLs or known documentation links.
    """
    if state.get("error") or not state.get("skill_gap_report"):
        return {}

    skill_gap_report: list = state.get("skill_gap_report") or []  # type: ignore[assignment]

    # Collect all URLs to check in parallel
    urls_to_check: list[str] = []
    url_locations: list[tuple[int, int, str]] = []  # (skill_idx, step_idx, field)

    for s_idx, skill_entry in enumerate(skill_gap_report):
        for st_idx, step in enumerate(skill_entry.get("learning_path", [])):
            url = step.get("url", "")
            if url:
                urls_to_check.append(url)
                url_locations.append((s_idx, st_idx, "url"))
            for alt_idx, alt in enumerate(step.get("alt_platforms", [])):
                alt_url = alt.get("url", "") if isinstance(alt, dict) else ""
                if alt_url:
                    urls_to_check.append(alt_url)
                    url_locations.append((s_idx, st_idx, f"alt_{alt_idx}"))

    if not urls_to_check:
        return {"urls_validated": True}

    # Check all URLs in parallel
    url_status: dict[str, bool] = {}
    with ThreadPoolExecutor(max_workers=URL_CHECK_MAX_WORKERS) as executor:
        futures = {executor.submit(_check_url, url): url for url in set(urls_to_check)}
        for future in as_completed(futures):
            url, is_alive = future.result()
            url_status[url] = is_alive

    dead_count = sum(1 for alive in url_status.values() if not alive)
    total = len(url_status)
    logger.info(f"[URL Validator] {total - dead_count}/{total} URLs alive, {dead_count} dead")

    # Replace dead primary URLs with curated fallbacks
    updated_report = []
    for s_idx, skill_entry in enumerate(skill_gap_report):
        skill_name = skill_entry.get("skill", "")
        updated_path = []

        for st_idx, step in enumerate(skill_entry.get("learning_path", [])):
            step = dict(step)  # Make a mutable copy
            primary_url = step.get("url", "")

            if primary_url and not url_status.get(str(primary_url), False):
                # Primary URL is dead — try curated fallback
                curated = _get_curated_fallback_url(skill_name, st_idx)
                if curated:
                    logger.info(f"[URL Validator] Replacing dead URL for '{skill_name}' step {st_idx + 1}: {primary_url} → {curated['url']}")
                    step["url"] = curated["url"]
                    step["title"] = curated["title"]
                    if curated.get("platform"):
                        step["platform"] = curated["platform"]
                else:
                    # No curated fallback — try known docs as last resort
                    doc_url = _get_doc_url(skill_name)
                    logger.info(f"[URL Validator] Replacing dead URL for '{skill_name}' step {st_idx + 1} with docs: {primary_url} → {doc_url}")
                    step["url"] = doc_url
                    step["title"] = f"Official {skill_name} Documentation"

            # Filter out dead alt_platform URLs (just remove them, don't replace)
            alt_list = step.get("alt_platforms", [])
            if alt_list and isinstance(alt_list, list):
                step["alt_platforms"] = [
                    alt for alt in alt_list
                    if isinstance(alt, dict) and url_status.get(str(alt.get("url", "")), True)
                ]

            updated_path.append(step)

        updated_entry = dict(skill_entry)
        updated_entry["learning_path"] = updated_path
        updated_report.append(updated_entry)

    return {
        "skill_gap_report": updated_report,
        "urls_validated": True,
    }


# ────────────────────────────────────────────────────────
# Node 5: Build schedule summary
# ────────────────────────────────────────────────────────

# Maps questionnaire time_commitment keys → numeric hours per week
_TIME_COMMITMENT_HOURS = {
    "5_hours_week": 5,
    "10_hours_week": 10,
    "20_hours_week": 20,
    "30_hours_week": 30,
    "flexible": 10,  # sensible default
}

_DEFAULT_HOURS_PER_WEEK = 10


def _parse_est_time_to_hours(est_time: str) -> float:
    """
    Convert an est_time string like '3-4 hours', '2 weeks', '6 hours',
    '1-2 weeks', '10 hours' into a single float of hours.

    Heuristics:
    - 'X hours' or 'X-Y hours' → average hours
    - 'X weeks' or 'X-Y weeks' → average weeks × 10 hrs/week
    - 'X months' → months × 40 hrs
    - Falls back to 3 hours if unparseable.
    """
    if not est_time:
        return 3.0

    text = est_time.strip().lower()

    # Match patterns like "3-4 hours", "6 hours", "1.5 hours"
    hours_match = _re.search(r'(\d+(?:\.\d+)?)\s*[-–to]+\s*(\d+(?:\.\d+)?)\s*hour', text)
    if hours_match:
        return (float(hours_match.group(1)) + float(hours_match.group(2))) / 2

    single_hours = _re.search(r'(\d+(?:\.\d+)?)\s*hour', text)
    if single_hours:
        return float(single_hours.group(1))

    # Match patterns like "2-4 weeks", "1 week"
    weeks_match = _re.search(r'(\d+(?:\.\d+)?)\s*[-–to]+\s*(\d+(?:\.\d+)?)\s*week', text)
    if weeks_match:
        avg_weeks = (float(weeks_match.group(1)) + float(weeks_match.group(2))) / 2
        return avg_weeks * 10  # assume ~10 hrs/week for a "week" of study

    single_weeks = _re.search(r'(\d+(?:\.\d+)?)\s*week', text)
    if single_weeks:
        return float(single_weeks.group(1)) * 10

    # Match months
    months_match = _re.search(r'(\d+(?:\.\d+)?)\s*month', text)
    if months_match:
        return float(months_match.group(1)) * 40

    return 3.0  # default


def build_schedule_node(state: StudyPlannerState) -> dict:
    """
    Build the schedule summary from the shared calendar scheduling service.
    This keeps the graph output consistent with the API/cache payloads.
    """
    skill_gap_report = state.get("skill_gap_report") or []
    if not skill_gap_report:
        return {}
    from app.services.google_calendar import compute_schedule_summary

    schedule_summary = compute_schedule_summary(
        skill_gap_report,
        state.get("questionnaire_answers"),
    )
    logger.info(
        f"[Study Planner] Schedule: {schedule_summary['total_hours']} total hours, "
        f"~{math.ceil(schedule_summary['total_weeks'])} weeks at "
        f"{schedule_summary['hours_per_week']} hrs/week"
    )
    return {"schedule_summary": schedule_summary}


# ────────────────────────────────────────────────────────
# Node 6: Fallback resources (curated, no search links)
# ────────────────────────────────────────────────────────

def fallback_resources_node(state: StudyPlannerState) -> dict:
    """
    If Gemini failed or returned empty results, generate fallback
    resources using curated direct URLs. No search links.
    """
    # If we already have valid data, skip fallback
    if state.get("skill_gap_report") and not state.get("error"):
        return {}

    missing_skills = state.get("missing_skills", [])
    skill_gap_report = []

    for skill in missing_skills:
        key = skill.strip().lower()
        roadmap_url = _get_roadmap_sh_url(skill)

        # Use curated resources if available
        if key in CURATED_RESOURCES:
            skill_gap_report.append({
                "skill": skill,
                "roadmap_url": roadmap_url,
                "learning_path": [dict(step) for step in CURATED_RESOURCES[key]],
            })
        else:
            # For uncurated skills, use known docs + roadmap.sh (still no search links)
            doc_url = _get_doc_url(skill)
            skill_gap_report.append({
                "skill": skill,
                "roadmap_url": roadmap_url,
                "learning_path": [
                    {
                        "step": 1,
                        "label": "Read Basics",
                        "type": "Documentation",
                        "title": f"Official {skill} Documentation",
                        "url": doc_url,
                        "est_time": "2-3 hours",
                        "cost": "Free",
                        "alt_platforms": [],
                    },
                    {
                        "step": 2,
                        "label": "Visual Roadmap",
                        "type": "Roadmap",
                        "title": f"{skill} Learning Roadmap (roadmap.sh)",
                        "url": roadmap_url,
                        "est_time": "1 hour",
                        "cost": "Free",
                        "alt_platforms": [],
                    },
                    {
                        "step": 3,
                        "label": "Hands-on Practice",
                        "type": "Interactive",
                        "title": f"{skill} Track on Exercism",
                        "platform": "Exercism",
                        "url": f"https://exercism.org/tracks/{key.replace(' ', '-')}",
                        "est_time": "2-4 weeks",
                        "cost": "Free",
                        "alt_platforms": [],
                    },
                ],
            })

    return {
        "study_plan": [],
        "skill_gap_report": skill_gap_report,
        "error": None,  # Clear the error since we recovered
    }
