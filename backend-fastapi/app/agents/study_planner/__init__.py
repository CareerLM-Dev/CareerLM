"""
Study Planner Agent Module

Uses LangGraph workflow orchestration with Gemini 2.0 Flash + Google Search
grounding to generate live, verified learning roadmaps for missing skills.

Features:
- Skill dependency ordering (prerequisite-aware sequencing)
- URL validation (HEAD-request verification with curated fallbacks)
- Curated fallback resources (no search links — direct URLs only)
"""

from .graph import generate_study_plan, study_planner_workflow
from .state import StudyPlannerState
