"""
Nodes for the study planner agent.
Uses Gemini 2.0 Flash with Google Search grounding to fetch
live, verified learning resources for each missing skill.
"""

import os
import json
import logging
import traceback
from dotenv import load_dotenv
from .state import StudyPlannerState

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
    """
    if state.get("error"):
        return {}

    from google import genai
    from google.genai import types

    gemini_key = os.getenv("GEMINI_API_KEY")
    if not gemini_key:
        return {"error": "GEMINI_API_KEY not configured"}

    gemini_client = genai.Client(api_key=gemini_key)

    missing_skills = state["missing_skills"]
    target_career = state["target_career"]
    skills_query = ", ".join(missing_skills)

    prompt = f"""
Role: Professional Resource Scout & Study Architect.

Context: The user wants to become a **{target_career}** and is missing the following skills: {skills_query}.

Task: Convert the skill gaps into a structured learning roadmap.

Execution Steps:
1. Search Grounding – Use live Google Search to find active 2024/2025 links for
   YouTube playlists, free platform courses (Udemy/Coursera), and official
   technical documentation.
2. Verification – Verify that the YouTube links are "Playlists" or "Full Courses"
   (minimum 2+ hours of content).
3. Actionable Output – For each skill, provide exactly three resources that
   represent a "Start to Finish" journey.

Constraint: Output strictly JSON. No conversational preamble.

JSON Schema:
{{
  "study_plan": [
    {{
      "skill": "Skill Name",
      "roadmap": [
        {{"step": 1, "label": "Read Basics", "type": "Documentation", "title": "Doc Title", "url": "verified_link", "est_time": "Duration"}},
        {{"step": 2, "label": "Deep Dive", "type": "YouTube", "title": "Playlist Name", "url": "verified_link", "est_time": "Duration"}},
        {{"step": 3, "label": "Certification/Hands-on", "type": "Course", "title": "Course Name", "platform": "Platform Name", "url": "verified_link", "est_time": "Duration"}}
      ]
    }}
  ]
}}
"""

    try:
        response = gemini_client.models.generate_content(
            model="gemini-2.0-flash",
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


def fallback_resources_node(state: StudyPlannerState) -> dict:
    """
    If the previous node failed or returned empty results,
    generate Google-search-link fallback resources.
    """
    # If we already have valid data, skip fallback
    if state.get("skill_gap_report") and not state.get("error"):
        return {}

    missing_skills = state.get("missing_skills", [])
    skill_gap_report = []
    for skill in missing_skills:
        skill_gap_report.append({
            "skill": skill,
            "learning_path": [
                {
                    "step": 1,
                    "label": "Read Basics",
                    "type": "Documentation",
                    "title": f"Official {skill} Documentation",
                    "url": f"https://www.google.com/search?q={skill.replace(' ', '+')}+official+documentation",
                    "est_time": "2-3 hours",
                    "cost": "Free",
                },
                {
                    "step": 2,
                    "label": "Deep Dive",
                    "type": "YouTube",
                    "title": f"{skill} Full Course - YouTube",
                    "url": f"https://www.youtube.com/results?search_query={skill.replace(' ', '+')}+full+course+2025",
                    "est_time": "4-6 hours",
                    "cost": "Free",
                },
                {
                    "step": 3,
                    "label": "Hands-on Practice",
                    "type": "Course",
                    "title": f"{skill} Course on Coursera",
                    "platform": "Coursera",
                    "url": f"https://www.coursera.org/search?query={skill.replace(' ', '+')}",
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
