"""
Nodes for the study planner agent.
Uses Gemini 2.0 Flash with Google Search grounding to fetch
live, verified learning resources for each missing skill.
"""

import json
import logging
import traceback
from dotenv import load_dotenv
from .state import StudyPlannerState
from app.agents.llm_config import GEMINI_CLIENT, GEMINI_MODEL

# Setup logging
logger = logging.getLogger(__name__)

load_dotenv()


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
            goal_descs = [goal_map.get(g, g.replace("_", " ").title()) for g in goals]
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
            pref_descs = [pref_map.get(p, p.replace("_", " ").title()) for p in prefs]
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
            time_descs = [time_map.get(t, t.replace("_", " ")) for t in time]
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
            )

    prompt = f"""
Role: Professional Resource Scout & Study Architect.

Context: The user wants to become a **{target_career}** and is missing the following skills: {skills_query}.
{personalisation_block}
Task: Convert the skill gaps into a structured learning roadmap with EXACT, DIRECT resource URLs.

CRITICAL URL RULES:
- Every URL MUST be a direct link to the actual resource page, NOT a Google search link or search results page.
- Documentation URLs must point to the official docs site (e.g. https://docs.python.org, https://react.dev, https://kubernetes.io/docs).
- YouTube URLs must be direct video or playlist links (e.g. https://www.youtube.com/watch?v=... or https://www.youtube.com/playlist?list=...), NOT youtube.com/results search pages.
- Course URLs must link to the specific course page (e.g. https://www.coursera.org/learn/machine-learning, https://www.udemy.com/course/...), NOT search/browse pages.
- NEVER output google.com/search links, youtube.com/results links, or any search-results URL.

Execution Steps:
1. Search Grounding – Use live Google Search to discover the exact page URL for each resource.
2. Verification – Confirm every URL is a direct page link, not a search or results page.
3. Actionable Output – For each skill, provide exactly three resources forming a "Start to Finish" learning path.

Constraint: Output strictly JSON. No conversational preamble.

JSON Schema:
{{
  "study_plan": [
    {{
      "skill": "Skill Name",
      "roadmap": [
        {{"step": 1, "label": "Read Basics", "type": "Documentation", "title": "Exact Doc Page Title", "url": "https://exact-docs-site.com/path", "est_time": "Duration"}},
        {{"step": 2, "label": "Deep Dive", "type": "YouTube", "title": "Exact Video/Playlist Title", "url": "https://www.youtube.com/watch?v=XXXXX", "est_time": "Duration"}},
        {{"step": 3, "label": "Certification/Hands-on", "type": "Course", "title": "Exact Course Title", "platform": "Platform Name", "url": "https://platform.com/learn/exact-course", "est_time": "Duration"}}
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

        raw = response.text
        logger.info(f"[Gemini Study Planner] Raw response length: {len(raw)}")
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
                })
            skill_gap_report.append({
                "skill": item.get("skill", "Unknown"),
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
    # DevDocs covers many technologies with direct pages
    return f"https://devdocs.io/{key.replace(' ', '-')}/"


def fallback_resources_node(state: StudyPlannerState) -> dict:
    """
    If the previous node failed or returned empty results,
    generate fallback resources using known direct URLs.
    """
    # If we already have valid data, skip fallback
    if state.get("skill_gap_report") and not state.get("error"):
        return {}

    missing_skills = state.get("missing_skills", [])
    skill_gap_report = []
    for skill in missing_skills:
        doc_url = _get_doc_url(skill)
        slug = skill.replace(" ", "+")

        skill_gap_report.append({
            "skill": skill,
            "learning_path": [
                {
                    "step": 1,
                    "label": "Read Basics",
                    "type": "Documentation",
                    "title": f"Official {skill} Documentation",
                    "url": doc_url,
                    "est_time": "2-3 hours",
                    "cost": "Free",
                },
                {
                    "step": 2,
                    "label": "Deep Dive",
                    "type": "YouTube",
                    "title": f"{skill} – freeCodeCamp Full Course",
                    "url": f"https://www.youtube.com/@freecodecamp/search?query={slug}",
                    "est_time": "4-6 hours",
                    "cost": "Free",
                },
                {
                    "step": 3,
                    "label": "Hands-on Practice",
                    "type": "Course",
                    "title": f"{skill} Course on Coursera",
                    "platform": "Coursera",
                    "url": f"https://www.coursera.org/courses?query={slug}",
                    "est_time": "2-4 weeks",
                    "cost": "Free",
                },
            ],
        })

    return {
        "study_plan": [],
        "skill_gap_report": skill_gap_report,
        "error": None,  # Clear the error since we recovered
    }
