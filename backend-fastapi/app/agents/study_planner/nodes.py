"""
Nodes for the study planner agent.
Uses Gemini 2.0 Flash with Google Search grounding to fetch
live, verified learning resources for each missing skill.
"""

import json
import logging
import traceback
from concurrent.futures import ThreadPoolExecutor, as_completed
from dotenv import load_dotenv

import requests

from .state import StudyPlannerState
from app.agents.llm_config import GEMINI_CLIENT, GEMINI_MODEL, GROQ_CLIENT, GROQ_DEFAULT_MODEL

# Setup logging
logger = logging.getLogger(__name__)

load_dotenv()

# ────────────────────────────────────────────────────────
# URL validation timeout (seconds) for HEAD requests
# ────────────────────────────────────────────────────────
URL_CHECK_TIMEOUT = 5
URL_CHECK_MAX_WORKERS = 10


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
# Node 3: Fetch live resources via Gemini + Google Search
# ────────────────────────────────────────────────────────

def fetch_live_resources_node(state: StudyPlannerState) -> dict:
    """
    Call Gemini 2.0 Flash with Google Search grounding to get
    live learning resources for each missing skill.
    Incorporates questionnaire answers for personalisation.
    """
    if state.get("error"):
        return {}

    from google.genai import types

    if not GEMINI_CLIENT:
        return {"error": "GEMINI_API_KEY not configured"}

    gemini_client = GEMINI_CLIENT

    missing_skills = state["missing_skills"]
    target_career = state["target_career"]
    skills_query = ", ".join(missing_skills)

    # ── Build personalisation context from questionnaire ──
    qa = state.get("questionnaire_answers") or {}

    personalisation_block = ""
    if qa:
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

        if parts:
            personalisation_block = (
                "\n\nUser Profile (from onboarding questionnaire — use this to tailor resource selection, "
                "difficulty level, resource types, and estimated durations):\n"
                + "\n".join(parts)
                + "\n\nIMPORTANT personalisation rules:\n"
                "• If the user prefers VIDEO learning, make at least 2 out of 3 resources per skill video-based (YouTube, Udemy, Coursera video).\n"
                "• If the user prefers READING, make at least 2 out of 3 resources documentation or article-based.\n"
                "• If the user prefers HANDS-ON, include interactive labs, coding challenges, or project-based resources.\n"
                "• Match est_time values to the user's weekly time commitment (e.g. shorter for 5 hrs/week).\n"
                "• Adjust difficulty to match the user's goal (beginner-friendly for first-job seekers, advanced for upskill).\n"
                "• When the user has expressed interest in specific target roles, prioritise resources "
                "that are most relevant and commonly required for those roles. Frame each skill "
                "in the context of the interested role(s) so the user understands *why* it matters.\n"
            )

    prompt = f"""
Role: Professional Resource Scout & Study Architect.

Context: The user wants to become a **{target_career}** and is missing the following skills: {skills_query}.
{personalisation_block}
Task: Convert the skill gaps into a structured learning roadmap with EXACT, DIRECT resource URLs.

RESOURCE DIVERSITY RULES (MUST follow):
- For each skill, include a **roadmap_url** linking to the matching roadmap.sh page (e.g. https://roadmap.sh/python, https://roadmap.sh/docker, https://roadmap.sh/devops).
  If no exact roadmap.sh page exists for the skill, use the closest parent roadmap (e.g. https://roadmap.sh/backend for FastAPI).
- Resources MUST come from a MIX of platforms. Each skill gets exactly 3 resources; each resource MUST be from a DIFFERENT platform.
  Choose the best resource for each step from any of these (DO NOT favour any single platform):
    * YouTube channels: freeCodeCamp, Fireship, Traversy Media, Tech With Tim, The Net Ninja, etc.
    * Course platforms: Udemy, Coursera, edX, Pluralsight, LinkedIn Learning, Boot.dev, Khan Academy
    * Aggregators: Class Central (link to the specific course page it indexes, not a search page)
    * Interactive/hands-on: freeCodeCamp, Codecademy, Exercism, HackerRank, LeetCode, Kaggle, Scrimba
    * Documentation: Official docs, MDN, DevDocs, W3Schools
    * Open courseware: MIT OCW, Stanford Online
    * Books/reading: O'Reilly, dev.to, real-world blog posts
- NEVER put 2+ resources from the same platform within a single skill.
- Across the ENTIRE study plan, vary platforms — do NOT always pick the same platform for step 3.
- Pick the highest-rated, most recommended resource regardless of platform.

CRITICAL URL RULES:
- Every URL MUST be a direct link to the actual resource page, NOT a Google search link or search results page.
- Documentation URLs must point to the official docs site (e.g. https://docs.python.org, https://react.dev, https://kubernetes.io/docs).
- YouTube URLs must be direct video or playlist links (e.g. https://www.youtube.com/watch?v=... or https://www.youtube.com/playlist?list=...), NOT youtube.com/results search pages.
- Course URLs must link to the specific course page (e.g. https://www.coursera.org/learn/machine-learning, https://www.udemy.com/course/...), NOT search/browse pages.
- NEVER output google.com/search links, youtube.com/results links, or any search-results URL.

Execution Steps:
1. Search Grounding -- Use live Google Search to discover the exact page URL for each resource.
2. Verification -- Confirm every URL is a direct page link, not a search or results page.
3. Actionable Output -- For each skill, provide the roadmap.sh link + exactly three resources forming a "Start to Finish" learning path.
4. Platform Alternatives -- For EACH resource step, also provide 2-3 **alt_platforms**: alternative places the user can find an equivalent resource. Each entry needs a platform name + direct URL.

Constraint: Output strictly JSON. No conversational preamble.

JSON Schema:
{{
  "study_plan": [
    {{
      "skill": "Skill Name",
      "roadmap_url": "https://roadmap.sh/relevant-roadmap",
      "roadmap": [
        {{"step": 1, "label": "Read Basics", "type": "Documentation", "title": "Exact Doc Page Title", "url": "https://exact-docs-site.com/path", "est_time": "Duration",
          "alt_platforms": [
            {{"name": "DevDocs", "url": "https://devdocs.io/..."}},
            {{"name": "W3Schools", "url": "https://www.w3schools.com/..."}}
          ]
        }},
        {{"step": 2, "label": "Deep Dive", "type": "YouTube", "title": "Exact Video/Playlist Title", "url": "https://www.youtube.com/watch?v=XXXXX", "est_time": "Duration",
          "alt_platforms": [
            {{"name": "Udemy", "url": "https://www.udemy.com/course/..."}},
            {{"name": "Coursera", "url": "https://www.coursera.org/learn/..."}}
          ]
        }},
        {{"step": 3, "label": "Certification/Hands-on", "type": "Course", "title": "Exact Course Title", "platform": "Platform Name", "url": "https://platform.com/learn/exact-course", "est_time": "Duration",
          "alt_platforms": [
            {{"name": "edX", "url": "https://www.edx.org/learn/..."}},
            {{"name": "Class Central", "url": "https://www.classcentral.com/course/..."}}
          ]
        }}
      ]
    }}
  ]
}}
"""

    try:
        response = gemini_client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                tools=[types.Tool(google_search=types.GoogleSearch())],
                response_mime_type="application/json",
            ),
        )

        raw = response.text or ""
        logger.info(f"[Gemini Study Planner] Raw response length: {len(raw)}")
        if not raw:
            return {
                "study_plan": [],
                "skill_gap_report": [],
                "error": "Gemini returned empty response",
            }
        data = json.loads(raw)

        study_plan = data.get("study_plan", [])

        # Normalise into skill_gap_report shape the frontend expects
        skill_gap_report = []
        for item in study_plan:
            learning_path = []
            for step in item.get("roadmap", []):
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
            skill_gap_report.append({
                "skill": item.get("skill", "Unknown"),
                "roadmap_url": item.get("roadmap_url", ""),
                "learning_path": learning_path,
            })

        return {
            "study_plan": study_plan,
            "skill_gap_report": skill_gap_report,
        }

    except Exception as exc:
        traceback.print_exc()
        logger.error(f"[Gemini Study Planner] Error: {exc}")
        # Fall through to fallback node
        return {
            "study_plan": [],
            "skill_gap_report": [],
            "error": f"Gemini search failed: {exc}",
        }


# ────────────────────────────────────────────────────────
# Static resource maps
# ────────────────────────────────────────────────────────

# Well-known roadmap.sh mappings for common skills / careers
KNOWN_ROADMAPS = {
    "python": "https://roadmap.sh/python",
    "javascript": "https://roadmap.sh/javascript",
    "typescript": "https://roadmap.sh/typescript",
    "react": "https://roadmap.sh/react",
    "angular": "https://roadmap.sh/angular",
    "vue.js": "https://roadmap.sh/vue",
    "node.js": "https://roadmap.sh/nodejs",
    "java": "https://roadmap.sh/java",
    "c++": "https://roadmap.sh/cpp",
    "rust": "https://roadmap.sh/rust",
    "go": "https://roadmap.sh/golang",
    "docker": "https://roadmap.sh/docker",
    "kubernetes": "https://roadmap.sh/kubernetes",
    "aws": "https://roadmap.sh/aws",
    "sql": "https://roadmap.sh/sql",
    "postgresql": "https://roadmap.sh/postgresql-dba",
    "mongodb": "https://roadmap.sh/mongodb",
    "git": "https://roadmap.sh/git-github",
    "graphql": "https://roadmap.sh/graphql",
    "linux": "https://roadmap.sh/linux",
    "devops": "https://roadmap.sh/devops",
    "django": "https://roadmap.sh/python",
    "flask": "https://roadmap.sh/python",
    "fastapi": "https://roadmap.sh/python",
    "spring": "https://roadmap.sh/spring-boot",
    "machine learning": "https://roadmap.sh/mlops",
    "deep learning": "https://roadmap.sh/ai-data-scientist",
    "data science": "https://roadmap.sh/ai-data-scientist",
    "cybersecurity": "https://roadmap.sh/cyber-security",
    "system design": "https://roadmap.sh/system-design",
    "ci/cd": "https://roadmap.sh/devops",
    "terraform": "https://roadmap.sh/devops",
    "rest api": "https://roadmap.sh/backend",
    "full stack": "https://roadmap.sh/full-stack",
    "frontend": "https://roadmap.sh/frontend",
    "backend": "https://roadmap.sh/backend",
}


def _get_roadmap_url(skill: str) -> str:
    """Return the known roadmap.sh URL for a skill, or the best-practices page."""
    key = skill.strip().lower()
    if key in KNOWN_ROADMAPS:
        return KNOWN_ROADMAPS[key]
    return "https://roadmap.sh/best-practices"


# Well-known official documentation sites for common technologies
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
# Node 5: Fallback resources (curated, no search links)
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
        roadmap_url = _get_roadmap_url(skill)

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
