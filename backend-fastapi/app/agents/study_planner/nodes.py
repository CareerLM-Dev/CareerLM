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

# ────────────────────────────────────────────────────────
# Comprehensive skill → roadmap.sh path mapping
# Source: https://roadmap.sh (all verified live paths as of 2026)
# ────────────────────────────────────────────────────────
SKILL_TO_ROADMAP_ID: dict[str, str] = {
    # ── Role-based roadmaps ──────────────────────────────
    "frontend": "frontend",
    "frontend development": "frontend",
    "frontend developer": "frontend",
    "backend": "backend",
    "backend development": "backend",
    "backend developer": "backend",
    "full stack": "full-stack",
    "full stack development": "full-stack",
    "full-stack": "full-stack",
    "devops": "devops",
    "devsecops": "devsecops",
    "dev sec ops": "devsecops",
    "data analyst": "data-analyst",
    "data analysis": "data-analyst",
    "ai engineer": "ai-engineer",
    "artificial intelligence engineer": "ai-engineer",
    "ai and data scientist": "ai-data-scientist",
    "ai data scientist": "ai-data-scientist",
    "data scientist": "ai-data-scientist",
    "data science": "ai-data-scientist",
    "data engineer": "data-engineer",
    "data engineering": "data-engineer",
    "android": "android",
    "android development": "android",
    "machine learning": "machine-learning",
    "ml": "machine-learning",
    "postgresql": "postgresql-dba",
    "postgresql dba": "postgresql-dba",
    "ios": "ios",
    "ios development": "ios",
    "blockchain": "blockchain",
    "web3": "blockchain",
    "qa": "qa",
    "quality assurance": "qa",
    "qa engineer": "qa",
    "testing": "qa",
    "software architect": "software-architect",
    "software architecture": "software-architect",
    "cyber security": "cyber-security",
    "cybersecurity": "cyber-security",
    "security": "cyber-security",
    "ux design": "ux-design",
    "ux": "ux-design",
    "ui/ux": "ux-design",
    "technical writer": "technical-writer",
    "technical writing": "technical-writer",
    "game developer": "game-developer",
    "game development": "game-developer",
    "mlops": "mlops",
    "product manager": "product-manager",
    "product management": "product-manager",
    "engineering manager": "engineering-manager",
    "developer relations": "devrel",
    "devrel": "devrel",
    "bi analyst": "bi-analyst",
    "business intelligence": "bi-analyst",

    # ── Language & technology roadmaps ───────────────────
    "sql": "sql",
    "mysql": "sql",
    "sqlite": "sql",
    "computer science": "computer-science",
    "cs fundamentals": "computer-science",
    "data structures": "datastructures-and-algorithms",
    "algorithms": "datastructures-and-algorithms",
    "data structures and algorithms": "datastructures-and-algorithms",
    "dsa": "datastructures-and-algorithms",
    "react": "react",
    "react.js": "react",
    "reactjs": "react",
    "vue": "vue",
    "vue.js": "vue",
    "vuejs": "vue",
    "angular": "angular",
    "angularjs": "angular",
    "javascript": "javascript",
    "js": "javascript",
    "typescript": "typescript",
    "ts": "typescript",
    "node.js": "nodejs",
    "nodejs": "nodejs",
    "node": "nodejs",
    "python": "python",
    "system design": "system-design",
    "java": "java",
    "asp.net": "aspnet-core",
    "asp.net core": "aspnet-core",
    ".net": "aspnet-core",
    "dotnet": "aspnet-core",
    "c#": "aspnet-core",
    "api design": "api-design",
    "rest api": "api-design",
    "restful api": "api-design",
    "api": "api-design",
    "spring boot": "spring-boot",
    "spring": "spring-boot",
    "spring-boot": "spring-boot",
    "flutter": "flutter",
    "dart": "flutter",
    "c++": "cpp",
    "cpp": "cpp",
    "rust": "rust",
    "go": "golang",
    "golang": "golang",
    "software design": "software-design-architecture",
    "design patterns": "software-design-architecture",
    "software design and architecture": "software-design-architecture",
    "graphql": "graphql",
    "react native": "react-native",
    "react-native": "react-native",
    "design system": "design-system",
    "prompt engineering": "prompt-engineering",
    "llm": "prompt-engineering",
    "mongodb": "mongodb",
    "nosql": "mongodb",
    "linux": "linux",
    "kubernetes": "kubernetes",
    "k8s": "kubernetes",
    "docker": "docker",
    "containerization": "docker",
    "aws": "aws",
    "amazon web services": "aws",
    "terraform": "terraform",
    "infrastructure as code": "terraform",
    "iac": "terraform",
    "redis": "redis",
    "caching": "redis",
    "git": "git-github",
    "github": "git-github",
    "git and github": "git-github",
    "version control": "git-github",
    "php": "php",
    "cloudflare": "cloudflare",
    "ai agents": "ai-agents",
    "agentic ai": "ai-agents",
    "next.js": "nextjs",
    "nextjs": "nextjs",
    "next js": "nextjs",
    "kotlin": "kotlin",
    "html": "html",
    "html5": "html",
    "css": "css",
    "css3": "css",
    "swift": "swift-ui",
    "swiftui": "swift-ui",
    "swift ui": "swift-ui",
    "shell": "shell-bash",
    "bash": "shell-bash",
    "shell scripting": "shell-bash",
    "command line": "shell-bash",
    "laravel": "laravel",
    "elasticsearch": "elasticsearch",
    "wordpress": "wordpress",
    "django": "django",
    "ruby": "ruby",
    "ruby on rails": "ruby-on-rails",
    "rails": "ruby-on-rails",
    "scala": "scala",

    # ── Cloud provider aliases ────────────────────────────
    "azure": "devops",
    "gcp": "devops",
    "google cloud": "devops",
    "google cloud platform": "devops",

    # ── Framework / library aliases ───────────────────────
    "flask": "python",
    "fastapi": "python",
    "express": "nodejs",
    "express.js": "nodejs",
    "nestjs": "nodejs",
    "nest.js": "nodejs",
    "nuxt": "vue",
    "nuxt.js": "vue",
    "svelte": "frontend",
    "tailwind": "css",
    "tailwindcss": "css",
    "webpack": "frontend",
    "vite": "frontend",
    "pandas": "ai-data-scientist",
    "numpy": "ai-data-scientist",
    "scikit-learn": "machine-learning",
    "sklearn": "machine-learning",
    "tensorflow": "machine-learning",
    "pytorch": "machine-learning",
    "deep learning": "machine-learning",
    "neural networks": "machine-learning",
    "nlp": "machine-learning",
    "natural language processing": "machine-learning",
    "computer vision": "machine-learning",
    "jenkins": "devops",
    "ci/cd": "devops",
    "cicd": "devops",
    "github actions": "devops",
    "ansible": "devops",
    "nginx": "backend",
    "apache": "backend",
    "microservices": "software-design-architecture",
    "distributed systems": "software-design-architecture",
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


def _resolve_roadmap_id_via_llm(skill: str) -> str | None:
    """
    Use a lightweight GROQ call to fuzzy-match a skill to the closest
    roadmap.sh path from the authoritative list.

    Only called when the static SKILL_TO_ROADMAP_ID lookup fails.
    Returns the raw path slug (e.g. 'computer-science') or None.
    """
    # Flat list of all known slugs derived from SKILL_TO_ROADMAP_ID values
    slug_options = sorted(set(SKILL_TO_ROADMAP_ID.values()))
    slugs_str = ", ".join(slug_options)

    prompt = (
        f"Given the skill '{skill}', pick the single best-matching roadmap.sh slug "
        f"from this list: {slugs_str}.\n\n"
        "Rules:\n"
        "- Output ONLY the slug string, nothing else (e.g. 'python').\n"
        "- If no slug is a reasonable match, output: none\n"
        "- Do NOT invent slugs not in the list."
    )
    try:
        response = GROQ_CLIENT.chat.completions.create(
            model=GROQ_DEFAULT_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0,
            max_tokens=20,
        )
        raw = (response.choices[0].message.content or "").strip().lower()
        # Validate the returned slug is actually in our known set
        if raw and raw != "none" and raw in slug_options:
            logger.info(f"[Roadmap.sh] LLM resolved '{skill}' → slug '{raw}'")
            return raw
        logger.info(f"[Roadmap.sh] LLM could not resolve '{skill}' (returned: '{raw}')")
    except Exception as exc:
        logger.warning(f"[Roadmap.sh] LLM slug resolution failed for '{skill}': {exc}")
    return None


def _get_roadmap_sh_url(skill: str) -> str:
    """Get the roadmap.sh URL for a skill.

    Resolution order:
    1. Static SKILL_TO_ROADMAP_ID map (instant, zero latency)
    2. LLM fuzzy-match against all known slugs (one fast GROQ call)
    3. Fallback to /computer-science as a universally useful page
    """
    roadmap_id = _get_roadmap_sh_id(skill)
    if roadmap_id:
        return f"{ROADMAP_SH_BASE}/{roadmap_id}"

    # LLM-powered fuzzy resolution for skills not in the static map
    llm_id = _resolve_roadmap_id_via_llm(skill)
    if llm_id:
        return f"{ROADMAP_SH_BASE}/{llm_id}"

    # Final fallback: computer-science is the most broadly useful roadmap
    logger.info(f"[Roadmap.sh] No roadmap found for '{skill}', using /computer-science fallback")
    return f"{ROADMAP_SH_BASE}/computer-science"


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
    Intent-driven resource discovery and ranking pipeline.
    
    For each skill, the system now:
    1. Extracts the specific learning objective (skill + career + user goal)
    2. Searches the curated high-value resource database first
    3. Personalizes resource selection by user's learning style from questionnaire
    4. Ranks resources by relevance, depth, credibility, usability, and time fit
    5. Creates a curated learning stack (Learn + Practice + Revise)
    6. Falls back to Gemini only for skills not in the curated database
    
    This approach eliminates generic topic linking (e.g., roadmap.sh directories)
    in favor of specific, actionable, immediately usable resources.
    
    Returns:
      {
        "skill_gap_report": [
          {
            "skill": "React",
            "learning_path": [
              {
                "step": 1,
                "label": "Learn Foundations",
                "type": "tutorial_video",
                "title": "React Course - Beginner's Tutorial",
                "url": "https://...",
                "platform": "freeCodeCamp",
                "est_time": "12 hours",
                "cost": "Free",
                "difficulty": "beginner",
                "relevance_score": 0.98,
                "depth_score": 0.92,
                "credibility_score": 0.95,
                "usability_score": 0.92,
                "overall_rank": 0.94
              },
              ...
            ]
          },
          ...
        ]
      }
    """
    if state.get("error"):
        return {}

    from app.services.resource_discovery import (
        extract_learning_objective,
        find_high_value_resources,
        get_learning_stack_template,
        get_platform_credibility,
        calculate_overall_rank,
        resource_metadata_to_dict,
        ResourceMetadata,
    )

    missing_skills = state["missing_skills"]
    target_career = state["target_career"]
    
    # Extract user's learning style and profile from questionnaire
    qa = state.get("questionnaire_answers") or {}
    personalisation = _build_personalisation_block(qa)
    learning_style_val = (qa.get("learning_preference") or ["mixed"])[0]  # First preference or default
    allowed_learning_styles = ["video_tutorials", "hands_on", "reading", "interactive", "mentor", "mixed"]
    if learning_style_val not in allowed_learning_styles:
        learning_style_val = "mixed"
    learning_style = learning_style_val
    
    # Infer user's goal from questionnaire (for objective extraction)
    user_goals = qa.get("primary_goal", [])
    primary_user_goal = user_goals[0] if user_goals else "learn_technology"
    
    # Extract user's stated skill levels (if available)
    user_skill_levels = {}  # Will be populated from profile data if available
    
    logger.info(
        f"[Resource Discovery] Using learning style: {learning_style}, "
        f"user goal: {primary_user_goal}"
    )

    # Build skill recommendations using intent-driven pipeline
    skill_gap_report: list[dict] = []
    curated_count = 0
    gemini_count = 0
    docs_fallback_count = 0

    for skill in missing_skills:
        logger.info(f"[Resource Discovery] Processing skill: {skill}")
        
        # Step 1: Extract learning objective
        objective = extract_learning_objective(
            skill=skill,
            career_goal=target_career,
            user_goal=primary_user_goal,
            user_skill_levels=user_skill_levels,
            context=None,  # Could include day's task context in Quick Prep flow
        )
        logger.info(
            f"[Resource Discovery] Objective: {objective.specific_objective} "
            f"(Level: {objective.skill_level})"
        )
        
        # Step 2: Get ideal learning stack template for this skill level + learning style
        learning_stack_template = get_learning_stack_template(objective, learning_style)  # type: ignore[arg-type]
        
        # Step 3: Search for high-value curated resources
        resource_types = [step["type"] for step in learning_stack_template]
        curated_resources = find_high_value_resources(skill, resource_types, count_per_type=2)
        
        learning_path = []
        used_curated = False
        
        # Step 4: Build learning stack from curated resources
        for stack_step in learning_stack_template:
            step_num = stack_step["step"]
            step_label = stack_step["label"]
            target_type = stack_step["type"]
            
            # Find the best resource of this type
            candidates = curated_resources.get(target_type, [])
            
            if candidates:
                # Use first candidate (already prioritized in curated DB)
                title, url, platform, est_time, difficulty = candidates[0]
                used_curated = True
                
                # Calculate ranking scores
                credibility, usability = get_platform_credibility(platform)
                relevance = 0.95 if target_type == "tutorial_video" and learning_style == "video_tutorials" else 0.90
                depth = 0.88 if difficulty == "beginner" else 0.92
                time_fit = 0.85  # User can customize, so default moderate fit
                
                overall_rank = calculate_overall_rank(relevance, depth, credibility, usability, time_fit)
                
                resource_meta = ResourceMetadata(
                    step=step_num,
                    label=step_label,
                    type=target_type,
                    title=title,
                    url=url,
                    platform=platform,
                    est_time=est_time,
                    cost="Free",
                    difficulty=difficulty,
                    relevance_score=relevance,
                    depth_score=depth,
                    credibility_score=credibility,
                    usability_score=usability,
                    overall_rank=overall_rank,
                    alt_platforms=[],
                    feedback_signals={"clicks": 0, "completions": 0, "avg_rating": 0.0},
                )
                
                learning_path.append(resource_metadata_to_dict(resource_meta))
                logger.info(
                    f"[Resource Discovery] Skill '{skill}' step {step_num}: "
                    f"'{title}' (platform={platform}, rank={overall_rank:.3f})"
                )
            else:
                logger.warning(
                    f"[Resource Discovery] No curated resource found for {skill} "
                    f"type {target_type}, will use generic fallback"
                )
                # Fallback to direct docs link (avoid generic roadmap directory pages)
                docs_url = _get_doc_url(skill)
                resource_meta = ResourceMetadata(
                    step=step_num,
                    label=step_label,
                    type="documentation",
                    title=f"Official {skill} Documentation",
                    url=docs_url,
                    platform="Official Docs",
                    est_time="2-3 hours",
                    cost="Free",
                    difficulty="beginner",
                    relevance_score=0.70,
                    depth_score=0.80,
                    credibility_score=0.85,
                    usability_score=0.75,
                    overall_rank=0.77,
                )
                learning_path.append(resource_metadata_to_dict(resource_meta))
        
        if not used_curated and GEMINI_CLIENT:
            # Dynamic fallback: use Gemini search-grounded retrieval for uncovered skills
            from google.genai import types

            roadmap_url = _get_roadmap_sh_url(skill)
            gemini_result = _fetch_single_skill(
                skill,
                target_career,
                personalisation,
                roadmap_url,
                GEMINI_CLIENT,
                types,
            )
            if gemini_result and gemini_result.get("learning_path"):
                learning_path = []
                for step in gemini_result.get("learning_path", []):
                    platform = step.get("platform") or step.get("type") or "General"
                    credibility, usability = get_platform_credibility(platform)
                    relevance = 0.86
                    depth = 0.84
                    overall_rank = calculate_overall_rank(relevance, depth, credibility, usability, 0.82)
                    resource_meta = ResourceMetadata(
                        step=step.get("step") or 1,
                        label=step.get("label") or "Learn",
                        type="documentation",
                        title=step.get("title") or f"{skill} Resource",
                        url=step.get("url") or _get_doc_url(skill),
                        platform=platform,
                        est_time=step.get("est_time") or "2-3 hours",
                        cost=step.get("cost") or "Free",
                        difficulty="beginner",
                        relevance_score=relevance,
                        depth_score=depth,
                        credibility_score=credibility,
                        usability_score=usability,
                        overall_rank=overall_rank,
                        alt_platforms=step.get("alt_platforms") or [],
                        feedback_signals={"clicks": 0, "completions": 0, "avg_rating": 0.0},
                    )
                    learning_path.append(resource_metadata_to_dict(resource_meta))
                gemini_count += 1
            else:
                docs_fallback_count += 1
        elif used_curated:
            curated_count += 1
        else:
            docs_fallback_count += 1

        # Build the skill gap report entry
        skill_entry = {
            "skill": skill,
            "learning_objective": {
                "objective": objective.specific_objective,
                "expected_outcome": objective.expected_outcome,
                "skill_level": objective.skill_level,
                "prerequisites": objective.prerequisite_skills,
            },
            "learning_path": learning_path,
        }
        skill_gap_report.append(skill_entry)

    logger.info(
        f"[Resource Discovery] Completed: {curated_count} curated, "
        f"{gemini_count} Gemini-dynamic, {docs_fallback_count} docs fallback"
    )

    if skill_gap_report:
        return {
            "skill_gap_report": skill_gap_report,
            "study_plan": [
                {"skill": entry["skill"], "roadmap": entry.get("learning_path", [])}
                for entry in skill_gap_report
            ],
        }

    return {
        "skill_gap_report": [],
        "study_plan": [],
        "error": "No resources found for any skill",
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

    # Keep schedule service input strongly typed as list[dict]
    schedule_input: list[dict] = [dict(item) for item in skill_gap_report]

    schedule_summary = compute_schedule_summary(
        schedule_input,
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


# ────────────────────────────────────────────────────────
# Node Q1: Validate quick-prep plan input
# ────────────────────────────────────────────────────────

def validate_quick_plan_input_node(state: StudyPlannerState) -> dict:
    """Validate and sanitise inputs for a Quick Prep plan."""
    quick_goal = (state.get("quick_goal") or "").strip()
    deadline_days = state.get("deadline_days")
    target_career = (state.get("target_career") or "").strip()

    if not quick_goal:
        return {"error": "quick_goal is required for a Quick Prep plan"}

    if not target_career:
        return {"error": "target_career is required"}

    if deadline_days is None:
        return {"error": "deadline_days is required for a Quick Prep plan"}

    try:
        deadline_days = int(deadline_days)
    except (TypeError, ValueError):
        return {"error": "deadline_days must be an integer"}

    if deadline_days < 1:
        return {"error": "deadline_days must be at least 1"}

    if deadline_days > 31:
        return {"error": "Quick Prep plans support a maximum deadline of 31 days"}

    logger.info(
        f"[Quick Plan] Validated: goal='{quick_goal[:60]}', "
        f"deadline={deadline_days}d, career='{target_career}'"
    )
    return {
        "quick_goal": quick_goal,
        "deadline_days": deadline_days,
        "target_career": target_career,
    }


def _normalize_quick_text(value: object) -> str:
    text = str(value or "").strip().lower()
    text = _re.sub(r"[^a-z0-9+#.\-/ ]+", " ", text)
    return _re.sub(r"\s+", " ", text).strip()


def _coalesce_text(*values: object) -> str:
    parts = [str(value).strip() for value in values if value is not None and str(value).strip()]
    return " ".join(parts)


def _build_quick_context(
    quick_goal: str,
    target_career: str,
    learning_profile: Optional[dict],
) -> dict:
    profile = learning_profile or {}
    goal = str(profile.get("preparation_goal") or quick_goal or "").strip()
    topic_name = str(profile.get("topic_name") or target_career or "General Topic").strip()
    subtopic = str(profile.get("subtopic") or "").strip()
    proficiency = _normalize_quick_text(profile.get("current_proficiency") or "")
    if proficiency not in ["beginner", "intermediate", "advanced"]:
        proficiency = "beginner"
    preferred_resource_type = _normalize_quick_text(profile.get("preferred_resource_type") or "")
    available_hours = profile.get("available_study_time_hours")
    if not isinstance(available_hours, (int, float)):
        available_hours = profile.get("available_study_hours") if isinstance(profile.get("available_study_hours"), (int, float)) else None

    return {
        "topic_name": topic_name,
        "subtopic": subtopic,
        "preparation_goal": goal,
        "deadline_days": profile.get("timeline_days"),
        "current_proficiency": proficiency,
        "available_study_time_hours": available_hours,
        "preferred_resource_type": preferred_resource_type,
        "notes": str(profile.get("quick_notes") or profile.get("custom_notes") or "").strip(),
        "strict_context_isolation": bool(profile.get("strict_context_isolation", True)),
    }


def _infer_quick_bucket(topic: str, subtopic: str, quick_context: dict) -> str:
    text = _normalize_quick_text(
        _coalesce_text(
            topic,
            subtopic,
            quick_context.get("topic_name"),
            quick_context.get("subtopic"),
            quick_context.get("preparation_goal"),
        )
    )
    if any(word in text for word in ["system design", "architecture", "distributed", "microservice"]):
        return "system_design"
    if any(word in text for word in ["sql", "database", "query", "joins", "index", "postgres", "mysql"]):
        return "sql"
    if any(word in text for word in ["frontend", "react", "javascript", "typescript", "ui", "css", "web"]):
        return "frontend"
    if any(word in text for word in ["backend", "api", "rest", "node", "fastapi", "spring", "django", "express"]):
        return "backend"
    if any(word in text for word in ["algorithm", "data structure", "dsa", "coding", "problem"]):
        return "coding"
    return "general"


def _quick_resource_bundle(bucket: str, topic: str, subtopic: str, proficiency: str, preferred_resource_type: str = "") -> dict[str, dict[str, str]]:
    topic_key = _normalise_topic_key(topic or subtopic)
    focus = (subtopic or topic or "quick prep").strip()

    video_map = {
        "sql": ("SQL One-shot Revision", "https://www.youtube.com/watch?v=HXV3zeQKqGY"),
        "system_design": ("System Design One-shot", "https://www.youtube.com/watch?v=bUHFg8CZFws"),
        "frontend": ("Frontend One-shot Revision", "https://www.youtube.com/watch?v=bMknfKXIFA8"),
        "backend": ("Backend One-shot Revision", "https://www.youtube.com/watch?v=Oe421EPjeBE"),
        "coding": ("Coding Concepts One-shot", "https://www.youtube.com/watch?v=PkZNo7MFNFg"),
        "general": ("Quick Prep One-shot", "https://www.youtube.com/watch?v=_uQrJ0TkZlc"),
    }

    docs_map = {
        "sql": ("SQL Notes and Cheat Sheet", "https://www.w3schools.com/sql/"),
        "system_design": ("System Design Notes", "https://github.com/donnemartin/system-design-primer"),
        "frontend": ("Frontend Notes and Concepts", "https://react.dev/learn"),
        "backend": ("Backend API Design Notes", "https://roadmap.sh/backend"),
        "coding": ("Coding Patterns Notes", "https://neetcode.io/roadmap"),
        "general": ("Topic Quick Notes", "https://roadmap.sh/computer-science"),
    }

    practice_map = {
        "sql": ("SQL Query Practice", "https://leetcode.com/problemset/database/"),
        "system_design": ("Design Exercise", "https://github.com/donnemartin/system-design-primer#system-design-topics-start-here"),
        "frontend": ("Frontend Exercise Set", "https://www.frontendmentor.io/challenges"),
        "backend": ("Backend API Exercise", "https://exercism.org/tracks/python"),
        "coding": ("Timed Coding Practice", "https://neetcode.io/practice"),
        "general": ("Hands-on Practice", "https://exercism.org/"),
    }

    checklist_map = {
        "sql": ("SQL Revision Summary", "https://www.w3schools.com/sql/sql_quickref.asp"),
        "system_design": ("System Design Revision Summary", "https://github.com/donnemartin/system-design-primer"),
        "frontend": ("Frontend Revision Summary", "https://react.dev/learn"),
        "backend": ("Backend Revision Summary", "https://roadmap.sh/backend"),
        "coding": ("Coding Revision Summary", "https://neetcode.io/roadmap"),
        "general": ("Quick Revision Summary", "https://roadmap.sh/computer-science"),
    }

    _, video_url = video_map.get(bucket, video_map["general"])
    docs_title, docs_url = docs_map.get(bucket, docs_map["general"])
    practice_title, practice_url = practice_map.get(bucket, practice_map["general"])
    _, checklist_url = checklist_map.get(bucket, checklist_map["general"])

    if topic_key in CURATED_RESOURCES:
        topical_video = next((item for item in CURATED_RESOURCES[topic_key] if str(item.get("type", "")).lower() == "youtube"), None)
        topical_docs = next((item for item in CURATED_RESOURCES[topic_key] if str(item.get("type", "")).lower() == "documentation"), None)
        topical_practice = next((item for item in CURATED_RESOURCES[topic_key] if str(item.get("type", "")).lower() in ["interactive", "course"]), None)
        if topical_video and topical_video.get("url"):
            video_url = str(topical_video["url"])
        if topical_docs and topical_docs.get("url"):
            docs_url = str(topical_docs["url"])
        if topical_practice and topical_practice.get("url"):
            practice_url = str(topical_practice["url"])

    video_est = "45-90 minutes" if proficiency == "beginner" else "60-120 minutes"
    practice_est = "45-90 minutes" if bucket != "system_design" else "60-120 minutes"

    if preferred_resource_type in ["notes", "docs", "documentation"]:
        docs_title = f"{focus} Notes (Preferred)"
    if preferred_resource_type in ["exercise", "practice", "hands_on"]:
        practice_title = f"{focus} Practice (Preferred)"
    if preferred_resource_type in ["video", "youtube", "one_shot_video"]:
        video_est = "60-120 minutes"

    return {
        "video": {
            "title": f"{focus} - One-shot prep",
            "url": video_url,
            "est_time": video_est,
            "why_this": "High-signal one-shot overview aligned to your Quick Prep goal.",
        },
        "docs_notes": {
            "title": docs_title,
            "url": docs_url,
            "est_time": "20-40 minutes",
            "why_this": "Concise notes for rapid revision and concept recall.",
        },
        "practice": {
            "title": practice_title,
            "url": practice_url,
            "est_time": practice_est,
            "why_this": "Practical exercise mapped to today's topic and subtopic.",
        },
        "checklist_summary": {
            "title": f"{focus} Revision Summary",
            "url": checklist_url,
            "est_time": "10-20 minutes",
            "why_this": "End-of-day checklist and summary to lock in what you prepared.",
        },
    }


def _build_follow_up_recommendations(quick_context: dict, checklist: list[str], feedback_signals: Optional[dict]) -> list[str]:
    bucket = _infer_quick_bucket(
        str(quick_context.get("topic_name") or ""),
        str(quick_context.get("subtopic") or ""),
        quick_context,
    )
    recommendations = []

    if bucket == "system_design":
        recommendations.append("Do one more architecture sketch and validate trade-offs.")
    elif bucket == "sql":
        recommendations.append("Re-run the query practice and compare with an optimized solution.")
    elif bucket == "frontend":
        recommendations.append("Review state flow and component behavior before moving to the next topic.")
    elif bucket == "backend":
        recommendations.append("Revisit API contracts and error handling assumptions.")
    else:
        recommendations.append("Repeat the mini practice challenge once under a tighter time limit.")

    if checklist:
        recommendations.append(f"Use the checklist to verify: {checklist[0]}")

    signals = feedback_signals or {}
    avg_rating = signals.get("avg_rating") if isinstance(signals, dict) else None
    if isinstance(avg_rating, (int, float)) and avg_rating < 4:
        recommendations.append("Reduce scope and focus on core concepts before moving on.")

    return recommendations[:3]


# ────────────────────────────────────────────────────────
# Node Q2: Build the day-by-day Quick Prep plan via Gemini
# ────────────────────────────────────────────────────────

def _build_quick_plan_prompt(
    quick_goal: str,
    target_career: str,
    deadline_days: int,
    specific_requirements: str,
    learning_profile: Optional[dict],
    feedback_signals: Optional[dict],
    quick_context: Optional[dict],
) -> str:
    """
    Build the Gemini prompt for Quick Prep plan generation.

    The LLM returns detected_skills and day_by_day entries in a single pass,
    grounded with user context + historical feedback signals.
    """
    req_block = (
        f"\nExtra requirements from the user: {specific_requirements}"
        if specific_requirements and specific_requirements.strip()
        else ""
    )
    profile_block = json.dumps(learning_profile or {}, ensure_ascii=True, indent=2)
    feedback_block = json.dumps(feedback_signals or {}, ensure_ascii=True, indent=2)
    quick_context_block = json.dumps(quick_context or {}, ensure_ascii=True, indent=2)

    return f"""You are an expert preparation planner.

A user has the following SHORT-TERM goal:
  Goal: "{quick_goal}"
    Topic context: {target_career}
  Deadline: {deadline_days} days from today
{req_block}

Quick Prep profile (must be used to personalize daily tasks and resources):
{profile_block}

Quick Prep context boundary (must be respected):
{quick_context_block}

Historical Quick Prep feedback signals (use only when provided):
{feedback_block}

Your task is to generate a self-contained day-by-day Quick Prep plan.
Use only the Quick Prep inputs. Do not infer role, company, interview metadata, or cross-module context unless explicitly provided in quick_context.

Rules:
1. First, extract the 3-7 most important skills or topics implied by the goal.
2. Then create EXACTLY {deadline_days} day entries, one per day, numbered 1 to {deadline_days}.
3. Each day must have a clear, actionable focus and a concrete deliverable.
4. Every day must include a topic-relevant 4-part micro-learning stack with direct URLs (no search pages):
        - one_shot_video: one concise YouTube one-shot for the day's topic
        - docs_notes: concise notes or documentation for revision
        - practice: one practical exercise directly tied to the day's topic
        - checklist_summary: compact end-of-day revision summary
5. Do not reuse the same one_shot_video URL across unrelated topics.
6. Ensure resource-topic mapping is precise: SQL topics get SQL resources, React topics get React resources, system design topics get system design resources, etc.
7. Personalize depth and pace from quick_context fields: current_proficiency, available_study_time_hours, preferred_resource_type, notes, and preparation_goal.
8. Respect strict context isolation: only optimize for what the user asked in Quick Prep.
9. Respect deadline and timeline pressure; prioritize high-impact preparation outcomes for the provided goal.
10. Include at least one simulation/mixed practice day in the final quarter when deadline_days >= 7.
11. Include follow_up_recommendations for each day based on likely gaps, skipped work, or low ratings.
12. Rank each resource using: topic_alignment, clarity, credibility, recency, completion_time_fit, practical_usefulness.

Output ONLY valid JSON (no preamble, no markdown fences):
{{
  "detected_skills": ["skill1", "skill2"],
  "day_by_day": [
    {{
      "day": 1,
      "topic": "Main topic",
      "subtopic": "Narrow concept",
      "learning_objective": "Exact objective for today",
      "proficiency_level": "beginner",
      "focus": "Short topic name",
      "task": "One sentence describing what to do today",
      "resource_stack": [
        {{"type": "one_shot_video", "title": "...", "url": "https://...", "est_time": "...", "why_this": "...", "rank": {{"topic_alignment": 0.0, "clarity": 0.0, "credibility": 0.0, "recency": 0.0, "completion_time_fit": 0.0, "practical_usefulness": 0.0, "overall": 0.0}}}},
        {{"type": "docs_notes", "title": "...", "url": "https://...", "est_time": "...", "why_this": "...", "rank": {{"topic_alignment": 0.0, "clarity": 0.0, "credibility": 0.0, "recency": 0.0, "completion_time_fit": 0.0, "practical_usefulness": 0.0, "overall": 0.0}}}},
        {{"type": "practice", "title": "...", "url": "https://...", "est_time": "...", "why_this": "...", "rank": {{"topic_alignment": 0.0, "clarity": 0.0, "credibility": 0.0, "recency": 0.0, "completion_time_fit": 0.0, "practical_usefulness": 0.0, "overall": 0.0}}}},
        {{"type": "checklist_summary", "title": "...", "url": "https://...", "est_time": "10-20 minutes", "why_this": "...", "rank": {{"topic_alignment": 0.0, "clarity": 0.0, "credibility": 0.0, "recency": 0.0, "completion_time_fit": 0.0, "practical_usefulness": 0.0, "overall": 0.0}}}}
      ],
      "resource": {{"title": "Primary resource title", "url": "https://direct-url-here.com", "est_time": "X hours"}},
      "takeaway_summary": "2-3 lines on what to remember today",
      "checklist": ["bullet 1", "bullet 2", "bullet 3"],
            "follow_up_recommendations": ["next step 1", "next step 2"],
                        "quick_context": {{"topic_name": "SQL", "subtopic": "Joins", "preparation_goal": "Revise query writing"}},
      "deliverable": "What the user should have completed by end of day",
      "skill_tag": "which detected_skill this maps to"
    }}
  ]
}}"""


def _quick_proficiency_from_goal(goal_text: str, day_num: int, deadline_days: int) -> str:
        """Infer proficiency target using user goal text and progression across days."""
        text = (goal_text or "").lower()
        if any(k in text for k in ["advanced", "senior", "system design", "deep dive", "expert"]):
                base = "advanced"
        elif any(k in text for k in ["interview", "revision", "switch", "upskill"]):
                base = "intermediate"
        else:
                base = "beginner"

        # Progression ramp by timeline so late days become more applied.
        if base == "beginner" and deadline_days >= 4 and day_num > max(2, int(deadline_days * 0.6)):
                return "intermediate"
        if base == "intermediate" and deadline_days >= 7 and day_num > int(deadline_days * 0.75):
                return "advanced"
        return base


def _score_quick_resource(url: str, resource_type: str) -> dict:
    """Heuristic ranking factors for Quick Prep resources."""
    domain = (url or "").lower()
    credibility = 0.86
    recency = 0.78
    if any(d in domain for d in ["react.dev", "developer.mozilla.org", "docs.", "kubernetes.io", "python.org", "typescriptlang.org", "fastapi.tiangolo.com"]):
        credibility = max(credibility, 0.97)
    if any(d in domain for d in ["react.dev", "developer.mozilla.org", "docs.", "kubernetes.io", "python.org", "typescriptlang.org", "fastapi.tiangolo.com"]):
        credibility = 0.98
    if any(d in domain for d in ["youtube.com", "exercism.org", "leetcode.com", "hackerrank.com", "codecademy.com", "freecodecamp.org", "scrimba.com"]):
        credibility = max(credibility, 0.9)

    topic_alignment = 0.92
    clarity = 0.9 if resource_type in ["one_shot_video", "docs_notes"] else 0.86
    completion_time_fit = 0.9 if resource_type in ["checklist_summary", "docs_notes"] else 0.84
    practical_usefulness = 0.93 if resource_type == "practice" else 0.88
    overall = (
        0.28 * topic_alignment
        + 0.16 * clarity
        + 0.22 * credibility
        + 0.10 * recency
        + 0.12 * completion_time_fit
        + 0.12 * practical_usefulness
    )
    return {
        "topic_alignment": round(topic_alignment, 3),
        "clarity": round(clarity, 3),
        "credibility": round(credibility, 3),
        "recency": round(recency, 3),
        "completion_time_fit": round(completion_time_fit, 3),
        "practical_usefulness": round(practical_usefulness, 3),
        "overall": round(overall, 3),
    }


def _normalise_topic_key(text: str) -> str:
        """Normalize topic text for matching against curated resource keys."""
        t = (text or "").strip().lower()
        t = _re.sub(r"[^a-z0-9+#.\- ]+", " ", t)
        t = _re.sub(r"\s+", " ", t).strip()
        aliases = {
                "reactjs": "react",
                "react.js": "react",
                "node": "node.js",
                "nodejs": "node.js",
                "js": "javascript",
                "ts": "typescript",
                "postgres": "sql",
                "postgresql": "sql",
                "mysql": "sql",
                "sqlite": "sql",
                "system design": "system design",
                "oop": "software design",
        }
        return aliases.get(t, t)



def _pick_curated_resources(topic: str, subtopic: str) -> list[dict]:
        """Pick the best curated resource bundle for a topic/subtopic pair."""
        candidates: list[str] = []
        for raw in [topic, subtopic]:
                normalized = _normalise_topic_key(raw)
                if normalized:
                        candidates.append(normalized)
                        candidates.extend(normalized.split())

        for key in candidates:
                if key in CURATED_RESOURCES:
                        return CURATED_RESOURCES[key]

        for candidate in candidates:
                for key in CURATED_RESOURCES:
                        if candidate and (candidate in key or key in candidate):
                                return CURATED_RESOURCES[key]

        return []



def _build_default_quick_resource_stack(topic: str, subtopic: str, proficiency: str, quick_context: Optional[dict] = None) -> list[dict]:
    """Build a direct-link actionable 4-part stack optimized for the Quick Prep request."""
    quick_context = quick_context or {}
    bucket = _infer_quick_bucket(topic, subtopic, quick_context)
    preferred_resource_type = str(quick_context.get("preferred_resource_type") or "")
    bundle = _quick_resource_bundle(bucket, topic, subtopic, proficiency, preferred_resource_type)

    focus = (subtopic or topic or quick_context.get("topic_name") or "Quick Prep").strip()
    video = bundle["video"]
    docs = bundle["docs_notes"]
    practice = bundle["practice"]
    checklist = bundle["checklist_summary"]

    stack = [
        {
            "type": "one_shot_video",
            "title": video["title"],
            "url": video["url"],
            "est_time": video["est_time"],
            "why_this": video["why_this"],
            "rank": _score_quick_resource(video["url"], "one_shot_video"),
        },
        {
            "type": "docs_notes",
            "title": docs["title"],
            "url": docs["url"],
            "est_time": docs["est_time"],
            "why_this": docs["why_this"],
            "rank": _score_quick_resource(docs["url"], "docs_notes"),
        },
        {
            "type": "practice",
            "title": f"{focus} - practical exercise",
            "url": practice["url"],
            "est_time": practice["est_time"],
            "why_this": practice["why_this"],
            "rank": _score_quick_resource(practice["url"], "practice"),
        },
        {
            "type": "checklist_summary",
            "title": f"{focus} - revision summary",
            "url": checklist["url"],
            "est_time": checklist["est_time"],
            "why_this": checklist["why_this"],
            "rank": _score_quick_resource(checklist["url"], "checklist_summary"),
        },
    ]
    return stack


def _parse_quick_plan_response(
    raw: str,
    learning_profile: Optional[dict] = None,
    quick_goal: str = "",
    target_career: str = "",
    feedback_signals: Optional[dict] = None,
) -> dict | None:
    """
    Parse the Gemini JSON response for a quick plan.
    Returns dict with detected_skills and day_by_day, or None on failure.
    """
    if not raw:
        return None

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        # Strip markdown fences or surrounding text
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start == -1 or end <= start:
            return None
        try:
            data = json.loads(raw[start:end])
        except json.JSONDecodeError:
            return None

    skills = data.get("detected_skills", [])
    days = data.get("day_by_day", [])

    if not days:
        return None

    quick_context = _build_quick_context(quick_goal, target_career, learning_profile)

    # Normalise each day entry to the QuickPlanDay shape
    normalised = []
    for d in days:
        if not isinstance(d, dict):
            continue
        day_num = int(d.get("day", len(normalised) + 1) or (len(normalised) + 1))
        topic = (d.get("topic") or d.get("skill_tag") or d.get("focus") or "").strip()
        subtopic = (d.get("subtopic") or d.get("focus") or topic or "Study Session").strip()
        proficiency = (d.get("proficiency_level") or "").strip().lower()
        if proficiency not in ["beginner", "intermediate", "advanced"]:
            proficiency = _quick_proficiency_from_goal(str(d.get("task") or ""), day_num, len(days))

        stack = d.get("resource_stack")
        if not isinstance(stack, list) or len(stack) == 0:
            stack = _build_default_quick_resource_stack(topic, subtopic, proficiency, quick_context)

        # Keep exactly the expected 4 resource types in stable order.
        stack_by_type = {}
        for item in stack:
            if not isinstance(item, dict):
                continue
            item_type = str(item.get("type") or "").strip().lower()
            if item_type in ["one_shot_video", "docs_notes", "practice", "checklist_summary"]:
                if "rank" not in item:
                    item["rank"] = _score_quick_resource(str(item.get("url") or ""), item_type)
                stack_by_type[item_type] = {
                    "type": item_type,
                    "title": item.get("title") or "Learning Resource",
                    "url": item.get("url") or _get_doc_url(topic or "software-engineering"),
                    "est_time": item.get("est_time") or "20-60 minutes",
                    "why_this": item.get("why_this") or "Directly supports today's objective.",
                    "rank": item.get("rank") or _score_quick_resource(str(item.get("url") or ""), item_type),
                }

        if len(stack_by_type) < 4:
            for fallback_item in _build_default_quick_resource_stack(topic, subtopic, proficiency, quick_context):
                if fallback_item["type"] not in stack_by_type:
                    stack_by_type[fallback_item["type"]] = fallback_item

        ordered_stack = [
            stack_by_type["one_shot_video"],
            stack_by_type["docs_notes"],
            stack_by_type["practice"],
            stack_by_type["checklist_summary"],
        ]

        primary_resource_raw = d.get("resource")
        if not isinstance(primary_resource_raw, dict):
            primary_resource_raw = {}
        primary_resource = {
            "title": primary_resource_raw.get("title") or ordered_stack[0]["title"],
            "url": primary_resource_raw.get("url") or ordered_stack[0]["url"],
            "est_time": primary_resource_raw.get("est_time") or ordered_stack[0]["est_time"],
        }

        checklist_raw = d.get("checklist")
        if not isinstance(checklist_raw, list):
            checklist_raw = []
        checklist = [str(x).strip() for x in checklist_raw if str(x).strip()]
        if len(checklist) < 3:
            checklist = [
                f"Explain {subtopic} in your own words.",
                "Complete the practice resource and save your solution.",
                "Review checklist_summary notes before ending the session.",
            ]

        takeaway_summary = str(d.get("takeaway_summary") or "").strip()
        if not takeaway_summary:
            takeaway_summary = (
                f"Today you focused on {subtopic}. "
                "Use the one-shot video, complete the practice task, then finish with revision summary and checklist."
            )

        recommendations_raw = d.get("follow_up_recommendations")
        if isinstance(recommendations_raw, list):
            follow_up_recommendations = [str(x).strip() for x in recommendations_raw if str(x).strip()]
        else:
            follow_up_recommendations = []
        if not follow_up_recommendations:
            follow_up_recommendations = _build_follow_up_recommendations(quick_context, checklist, feedback_signals)

        normalised.append({
            "day": day_num,
            "topic": topic or "Core Topic",
            "subtopic": subtopic,
            "learning_objective": d.get("learning_objective") or f"Be able to apply {subtopic} in one practical task.",
            "proficiency_level": proficiency,
            "focus": d.get("focus", subtopic or "Study Session"),
            "task": d.get("task", "Focused quick prep session"),
            "resource": primary_resource,
            "resource_stack": ordered_stack,
            "takeaway_summary": takeaway_summary,
            "checklist": checklist,
            "follow_up_recommendations": follow_up_recommendations,
            "quick_context": quick_context,
            "deliverable": d.get("deliverable", "Complete today's study task"),
            "skill_tag": d.get("skill_tag") or topic,
        })

    return {
        "detected_skills": [s for s in skills if isinstance(s, str)],
        "day_by_day": normalised,
        "quick_context": quick_context,
    }


def _build_quick_plan_fallback(
    quick_goal: str,
    deadline_days: int,
    learning_profile: Optional[dict] = None,
    target_career: str = "",
    feedback_signals: Optional[dict] = None,
) -> dict:
    """
    Generate a simple generic fallback quick plan when Gemini fails.
    Phases: Learn → Practice → Review → Simulate.
    """
    days = []
    quick_context = _build_quick_context(quick_goal, target_career or str((learning_profile or {}).get("target_role") or ""), learning_profile)
    phases = ["Foundations", "Deepen Understanding", "Practice and Apply", "Review and Consolidate"]
    for day_num in range(1, deadline_days + 1):
        phase_idx = min(int((day_num - 1) / max(1, deadline_days) * len(phases)), len(phases) - 1)
        phase = phases[phase_idx]
        proficiency = _quick_proficiency_from_goal(quick_goal, day_num, deadline_days)
        topic = str(quick_context.get("topic_name") or "Quick Prep")
        subtopic = f"{phase}"
        stack = _build_default_quick_resource_stack(topic, subtopic, proficiency, quick_context)
        checklist = [
            f"Finish the {phase.lower()} work without skipping the practice task.",
            "Track missed concepts and add them to tomorrow's review.",
            "Close with a short summary and next-step note.",
        ]
        days.append({
            "day": day_num,
            "topic": topic,
            "subtopic": subtopic,
            "learning_objective": f"Complete a focused {phase.lower()} session aligned to your Quick Prep goal: '{quick_goal[:50]}'.",
            "proficiency_level": proficiency,
            "focus": f"Day {day_num}: {phase}",
            "task": f"Work through topic resources and the mini practice challenge for '{quick_goal[:50]}'.",
            "resource": {
                "title": stack[0]["title"],
                "url": stack[0]["url"],
                "est_time": stack[0]["est_time"],
            },
            "resource_stack": stack,
            "takeaway_summary": "Use the quick-prep stack to learn fast, practice immediately, and capture weak spots.",
            "checklist": checklist,
            "follow_up_recommendations": _build_follow_up_recommendations(quick_context, checklist, feedback_signals),
            "quick_context": quick_context,
            "deliverable": f"Complete {phase.lower()} tasks and record preparation gaps",
            "skill_tag": "",
        })
    return {"detected_skills": [], "day_by_day": days, "quick_context": quick_context}


def build_quick_plan_node(state: StudyPlannerState) -> dict:
    """
    Generate a day-by-day Quick Prep plan using a single Gemini Flash call
    with Google Search grounding.

    Output shape:
    - detected_skills: list of skill strings inferred from the goal
    - quick_plan_days: list of QuickPlanDay dicts (one per deadline day)
    """
    if state.get("error"):
        return {}

    if not GEMINI_CLIENT:
        return {"error": "GEMINI_API_KEY not configured"}

    from google.genai import types as gtypes

    quick_goal = state.get("quick_goal", "")
    target_career = state.get("target_career", "")
    deadline_days = state.get("deadline_days", 7)
    specific_requirements = state.get("specific_requirements", "")
    learning_profile = state.get("learning_profile") or {}
    feedback_signals = state.get("feedback_signals") or {}
    quick_context = _build_quick_context(quick_goal, target_career, learning_profile)

    prompt = _build_quick_plan_prompt(
        quick_goal,
        target_career,
        deadline_days,
        specific_requirements,
        learning_profile,
        feedback_signals,
        quick_context,
    )

    parsed = None
    for attempt in range(1, 3):
        try:
            response = GEMINI_CLIENT.models.generate_content(
                model=GEMINI_MODEL,
                contents=prompt,
                config=gtypes.GenerateContentConfig(
                    tools=[gtypes.Tool(google_search=gtypes.GoogleSearch())],
                    response_mime_type="application/json",
                ),
            )
            raw = response.text or ""
            if raw:
                parsed = _parse_quick_plan_response(raw, learning_profile, quick_goal, target_career, feedback_signals)
            if parsed:
                logger.info(
                    f"[Quick Plan] Generated {len(parsed['day_by_day'])} days "
                    f"with {len(parsed['detected_skills'])} detected skills "
                    f"(attempt {attempt})"
                )
                break
            logger.warning(f"[Quick Plan] Attempt {attempt}: bad JSON, retrying")
        except Exception as exc:
            logger.warning(f"[Quick Plan] Attempt {attempt} failed: {exc}")

    if not parsed:
        logger.warning("[Quick Plan] Both Gemini attempts failed — using fallback plan")
        parsed = _build_quick_plan_fallback(quick_goal, deadline_days, learning_profile, target_career, feedback_signals)

    return {
        "detected_skills": parsed["detected_skills"],
        "quick_plan_days": parsed["day_by_day"],
        "quick_context": parsed.get("quick_context", quick_context),
    }
