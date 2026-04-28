"""
Intent-driven resource discovery and ranking pipeline.

Transforms generic topic linking into specific, actionable resource recommendations
by understanding the exact learning objective, user skill level, preferred learning style,
and ranking resources by relevance, depth, credibility, completion time, and usability.

Pipeline:
1. Extract learning objective from skill + career + user goal + daily task context
2. Search for specific resource types: tutorial, docs, practice, cheat sheet, worked example
3. Rank resources by relevance, depth, credibility, time, usability
4. Create curated learning stack: Learn (primary) → Practice (exercise) → Revise (reference)
5. Personalize by learning style from questionnaire
6. Prepare feedback signals for continuous improvement
"""

import json
import logging
from typing import Optional, Literal
from dataclasses import dataclass, asdict

logger = logging.getLogger(__name__)


# ────────────────────────────────────────────────────────
# Resource Metadata & Ranking
# ────────────────────────────────────────────────────────

ResourceType = Literal[
    "documentation",      # Official reference / tutorial docs
    "tutorial_video",     # Beginner-friendly video walkthrough
    "tutorial_article",   # Beginner-friendly written guide
    "interactive_lab",    # Hands-on coding exercise / lab
    "coding_challenge",   # Problem to solve (LeetCode, HackerRank, Exercism)
    "project_based",      # Build-along or project template
    "cheat_sheet",        # Quick reference / syntax reference
    "worked_example",     # Real-world code example
    "interactive_course", # Codecademy, Scrimba style interactive course
    "course_video",       # Udemy, Coursera video course
    "course_article",     # Written course / structured guide
]

CredibilityTier = Literal["high", "medium", "low"]
LearningStyle = Literal[
    "video_tutorials",
    "hands_on",
    "reading",
    "interactive",
    "mentor",
    "mixed",
]


@dataclass
class ResourceMetadata:
    """Extended metadata for a single learning resource."""
    
    step: int
    label: str  # "Learn", "Practice", "Revise", etc.
    type: ResourceType  # Specific resource type for better ranking
    title: str
    url: str
    platform: str  # "YouTube", "Official Docs", "Exercism", "Udemy", etc.
    est_time: str  # "2-3 hours", "15 minutes", "1-2 weeks"
    cost: str  # "Free", "Paid: $49", "Freemium"
    difficulty: Literal["beginner", "intermediate", "advanced"] = "beginner"
    relevance_score: float = 0.95  # 0-1: how directly relevant to the learning objective
    depth_score: float = 0.85  # 0-1: how comprehensive is the coverage
    credibility_score: float = 0.90  # 0-1: how trusted is the source
    usability_score: float = 0.85  # 0-1: can user start immediately without prerequisite setup
    overall_rank: float = 0.0  # Composite score for sorting
    alt_platforms: Optional[list[dict]] = None  # Alternative sources
    feedback_signals: Optional[dict] = None  # click_count, completion_rate, user_rating
    

def calculate_overall_rank(
    relevance: float,
    depth: float,
    credibility: float,
    usability: float,
    time_fit: float = 0.9,  # How well does est_time match user's availability?
) -> float:
    """
    Calculate composite ranking score.
    
    Weights:
    - Relevance (40%): Does it directly address the learning objective?
    - Credibility (25%): Is the source trusted?
    - Usability (20%): Can the user start immediately?
    - Depth (10%): Is coverage appropriate for skill level?
    - Time Fit (5%): Does duration match user's availability?
    """
    return (
        0.40 * relevance +
        0.25 * credibility +
        0.20 * usability +
        0.10 * depth +
        0.05 * time_fit
    )


def resource_metadata_to_dict(meta: ResourceMetadata) -> dict:
    """Convert ResourceMetadata dataclass to dict for JSON serialization."""
    return {
        "step": meta.step,
        "label": meta.label,
        "type": meta.type,
        "title": meta.title,
        "url": meta.url,
        "platform": meta.platform,
        "est_time": meta.est_time,
        "cost": meta.cost,
        "difficulty": meta.difficulty,
        "relevance_score": round(meta.relevance_score, 3),
        "depth_score": round(meta.depth_score, 3),
        "credibility_score": round(meta.credibility_score, 3),
        "usability_score": round(meta.usability_score, 3),
        "overall_rank": round(meta.overall_rank, 3),
        "alt_platforms": meta.alt_platforms or [],
        "feedback_signals": meta.feedback_signals or {},
    }


# ────────────────────────────────────────────────────────
# Intent Extraction
# ────────────────────────────────────────────────────────

@dataclass
class LearningObjective:
    """Extracted learning objective for a skill in a specific context."""
    skill: str
    career_goal: str
    user_goal: str  # From questionnaire (e.g., "get_first_job", "upskill")
    specific_objective: str  # e.g., "Master React Hooks for form state management in production apps"
    skill_level: Literal["beginner", "intermediate", "advanced"]
    expected_outcome: str  # e.g., "Build a controlled input component using useState and useCallback"
    prerequisite_skills: list[str]  # Skills that should be learned first


def extract_learning_objective(
    skill: str,
    career_goal: str,
    user_goal: str,
    user_skill_levels: Optional[dict] = None,  # { skill_name: "beginner|intermediate|advanced" }
    context: Optional[str] = None,  # Additional context like job description, project requirements
) -> LearningObjective:
    """
    Extract a specific learning objective from skill + career + context.
    
    Returns a LearningObjective with precise intent that can guide resource discovery.
    This is a simplified implementation; in production, this would use LLM for context-awareness.
    """
    
    # Determine user's skill level for this specific skill
    skill_level = user_skill_levels.get(skill, "beginner") if user_skill_levels else "beginner"
    
    # Map user goal to specific learning intent
    goal_intent_map = {
        "get_first_job": "Learn fundamentals and build portfolio-ready projects",
        "switch_careers": "Bridge transferable skills, emphasise practical projects",
        "upskill": "Deepen expertise in intermediate/advanced areas",
        "freelance": "Achieve practical, client-ready skills",
        "build_projects": "Apply knowledge to real projects immediately",
        "interview_prep": "Master algorithmic and system design concepts",
        "learn_technology": "Build structured beginner-to-advanced understanding",
    }
    
    user_intent = goal_intent_map.get(user_goal, "Learn this skill comprehensively")
    
    # Map skill to typical prerequisites
    prereq_map = {
        "react": ["javascript"],
        "vue": ["javascript"],
        "angular": ["typescript", "javascript"],
        "django": ["python"],
        "fastapi": ["python"],
        "spring boot": ["java"],
        "kubernetes": ["docker"],
        "system design": ["data structures", "algorithms"],
        "typescript": ["javascript"],
        "node.js": ["javascript"],
    }
    
    prerequisites = prereq_map.get(skill.lower(), [])
    
    # Construct specific objective
    specific_objective = f"{user_intent}. Learn {skill}."
    if context:
        specific_objective += f" Context: {context}"
    
    # Expected outcome varies by skill level
    outcome_templates = {
        "beginner": f"Understand core concepts of {skill} and create a basic project",
        "intermediate": f"Implement intermediate patterns in {skill} and solve real problems",
        "advanced": f"Master advanced aspects of {skill} and optimize production code",
    }
    expected_outcome = outcome_templates.get(skill_level, outcome_templates["beginner"])
    
    return LearningObjective(
        skill=skill,
        career_goal=career_goal,
        user_goal=user_goal,
        specific_objective=specific_objective,
        skill_level=skill_level,
        expected_outcome=expected_outcome,
        prerequisite_skills=prerequisites,
    )


# ────────────────────────────────────────────────────────
# Resource Credibility & Authority Database
# ────────────────────────────────────────────────────────

TRUSTED_PLATFORMS = {
    "Official Documentation": {"credibility": 1.0, "usability": 0.85},
    "MDN Web Docs": {"credibility": 0.98, "usability": 0.90},
    "freeCodeCamp": {"credibility": 0.95, "usability": 0.92},
    "Exercism": {"credibility": 0.93, "usability": 0.88},
    "Codecademy": {"credibility": 0.92, "usability": 0.95},
    "YouTube": {"credibility": 0.85, "usability": 0.90},  # varies by creator
    "Coursera": {"credibility": 0.93, "usability": 0.80},
    "Udemy": {"credibility": 0.80, "usability": 0.85},
    "Real Python": {"credibility": 0.96, "usability": 0.88},
    "Dev.to": {"credibility": 0.75, "usability": 0.92},
    "Stack Overflow": {"credibility": 0.85, "usability": 0.80},
    "GitHub": {"credibility": 0.90, "usability": 0.75},
    "Scrimba": {"credibility": 0.90, "usability": 0.94},
    "Kaggle": {"credibility": 0.92, "usability": 0.88},
    "LinkedIn Learning": {"credibility": 0.88, "usability": 0.85},
    "Auth0 Blog": {"credibility": 0.92, "usability": 0.90},
    "Fireship": {"credibility": 0.94, "usability": 0.88},
    "Traversy Media": {"credibility": 0.92, "usability": 0.90},
    "The Primeagen": {"credibility": 0.90, "usability": 0.85},
}


def get_platform_credibility(platform: str) -> tuple[float, float]:
    """Get credibility and usability scores for a platform."""
    scores = TRUSTED_PLATFORMS.get(platform, {})
    return scores.get("credibility", 0.7), scores.get("usability", 0.75)


# ────────────────────────────────────────────────────────
# Resource Type Specificity & Learning Path Sequencing
# ────────────────────────────────────────────────────────

def get_learning_stack_template(
    objective: LearningObjective,
    learning_style: LearningStyle,
) -> list[dict]:
    """
    Generate the ideal learning stack based on objective and learning style.
    
    Returns:
      List of resource labels and types in order:
      1. Learn (primary tutorial/docs)
      2. Practice (interactive exercise)
      3. Revise (quick reference)
    """
    
    # Determine primary learning type based on preference
    primary_type_by_style = {
        "video_tutorials": "tutorial_video",
        "hands_on": "interactive_lab",
        "reading": "documentation",
        "interactive": "interactive_course",
        "mentor": "course_video",  # mentorship often involves video courses
        "mixed": "documentation",  # balanced default
    }
    primary_type = primary_type_by_style.get(learning_style, "documentation")
    
    # Adjust stack based on user's skill level
    if objective.skill_level == "beginner":
        stack = [
            {"step": 1, "label": "Learn Foundations", "type": primary_type},
            {"step": 2, "label": "Practice Interactive", "type": "interactive_lab"},
            {"step": 3, "label": "Quick Reference", "type": "cheat_sheet"},
        ]
    elif objective.skill_level == "intermediate":
        stack = [
            {"step": 1, "label": "Learn Patterns", "type": primary_type},
            {"step": 2, "label": "Solve Challenges", "type": "coding_challenge"},
            {"step": 3, "label": "Real-World Examples", "type": "worked_example"},
        ]
    else:  # advanced
        stack = [
            {"step": 1, "label": "Deep Dive", "type": primary_type},
            {"step": 2, "label": "Advanced Challenges", "type": "coding_challenge"},
            {"step": 3, "label": "System Design / Architecture", "type": "worked_example"},
        ]
    
    return stack


# ────────────────────────────────────────────────────────
# High-Value Resource Patterns (Curated Knowledge Base)
# ────────────────────────────────────────────────────────

HIGH_VALUE_RESOURCE_PATTERNS = {
    # Format: (skill, resource_type) -> [(title, url, platform, est_time, difficulty), ...]
    
    # JavaScript patterns
    ("javascript", "documentation"): [
        ("JavaScript Guide (MDN Web Docs)", "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide", "MDN Web Docs", "3-4 hours", "beginner"),
        ("javascript.info - The Modern JavaScript Tutorial", "https://javascript.info/", "javascript.info", "4-5 hours", "beginner"),
        ("Eloquent JavaScript Book", "https://eloquentjavascript.net/", "Online Book", "2-3 weeks", "intermediate"),
    ],
    ("javascript", "tutorial_video"): [
        ("JavaScript Full Course for Beginners (freeCodeCamp)", "https://www.youtube.com/watch?v=PkZNo7MFNFg", "freeCodeCamp", "3.5 hours", "beginner"),
        ("Complete JavaScript Course (Jonas Schmedtmann)", "https://www.udemy.com/course/the-complete-javascript-course/", "Udemy", "28-30 hours", "beginner"),
    ],
    ("javascript", "interactive_lab"): [
        ("JavaScript Algorithms and Data Structures (freeCodeCamp)", "https://www.freecodecamp.org/learn/javascript-algorithms-and-data-structures/", "freeCodeCamp", "2-3 weeks", "beginner"),
        ("Exercism JavaScript Track", "https://exercism.org/tracks/javascript", "Exercism", "2-4 weeks", "beginner"),
    ],
    
    # React patterns
    ("react", "documentation"): [
        ("React Quick Start (Official Docs)", "https://react.dev/learn", "Official Documentation", "2-3 hours", "beginner"),
        ("React Learn Docs", "https://react.dev/reference/react", "Official Documentation", "3-4 hours", "beginner"),
    ],
    ("react", "tutorial_video"): [
        ("React Course - Beginner's Tutorial (freeCodeCamp)", "https://www.youtube.com/watch?v=bMknfKXIFA8", "freeCodeCamp", "12 hours", "beginner"),
        ("React Tutorial for Beginners (Traversy Media)", "https://www.youtube.com/watch?v=LDB4uaJ87e0", "Traversy Media", "2.5 hours", "beginner"),
    ],
    ("react", "interactive_lab"): [
        ("Learn React (Scrimba)", "https://scrimba.com/learn/learnreact", "Scrimba", "2-3 weeks", "beginner"),
        ("React Exercises", "https://github.com/wesbos/React-For-Beginners", "GitHub", "1-2 weeks", "beginner"),
    ],
    ("react", "worked_example"): [
        ("React Patterns & Techniques", "https://reactpatterns.com/", "React Patterns", "1-2 hours", "intermediate"),
    ],
    
    # Python patterns
    ("python", "documentation"): [
        ("The Python Tutorial (Official)", "https://docs.python.org/3/tutorial/", "Official Documentation", "3-4 hours", "beginner"),
        ("Real Python Tutorials", "https://realpython.com/", "Real Python", "Varies", "all"),
    ],
    ("python", "tutorial_video"): [
        ("Python for Beginners (Programming with Mosh)", "https://www.youtube.com/watch?v=_uQrJ0TkZlc", "YouTube", "6 hours", "beginner"),
        ("freeCodeCamp Python Course", "https://www.youtube.com/watch?v=rfscVS0vtbw", "freeCodeCamp", "4 hours", "beginner"),
    ],
    ("python", "interactive_lab"): [
        ("Python Track (Exercism)", "https://exercism.org/tracks/python", "Exercism", "2-4 weeks", "beginner"),
        ("Python for Everybody", "https://www.py4e.com/", "Online Course", "1-2 weeks", "beginner"),
    ],
    
    # TypeScript patterns
    ("typescript", "documentation"): [
        ("TypeScript Handbook (Official)", "https://www.typescriptlang.org/docs/handbook/intro.html", "Official Documentation", "2-3 hours", "beginner"),
        ("TypeScript Deep Dive (Basarat)", "https://basarat.gitbook.io/typescript/", "GitBook", "3-4 hours", "intermediate"),
    ],
    ("typescript", "tutorial_video"): [
        ("TypeScript Course (Net Ninja)", "https://www.youtube.com/playlist?list=PL4cUxeGkcC9gUgr39Q_yD6v-bSyMwKPUI", "YouTube", "3 hours", "beginner"),
        ("TypeScript Tutorial (Fireship)", "https://www.youtube.com/watch?v=ahCwqrQWDMs", "YouTube", "10 minutes", "quick"),
    ],
    
    # Docker patterns
    ("docker", "documentation"): [
        ("Docker Get Started Guide", "https://docs.docker.com/get-started/", "Official Documentation", "2 hours", "beginner"),
        ("Docker Best Practices", "https://docs.docker.com/develop/dev-best-practices/", "Official Documentation", "1 hour", "intermediate"),
    ],
    ("docker", "tutorial_video"): [
        ("Docker Tutorial for Beginners (TechWorld with Nana)", "https://www.youtube.com/watch?v=3c-iBn73dDE", "YouTube", "3 hours", "beginner"),
        ("Docker in 100 Seconds (Fireship)", "https://www.youtube.com/watch?v=Gjt64CqbmR4", "YouTube", "2 minutes", "quick"),
    ],
    ("docker", "interactive_lab"): [
        ("Play with Docker", "https://labs.play-with-docker.com/", "Docker Labs", "1-2 weeks", "beginner"),
    ],
    
    # SQL patterns
    ("sql", "documentation"): [
        ("SQL Tutorial (W3Schools)", "https://www.w3schools.com/sql/", "W3Schools", "2-3 hours", "beginner"),
        ("SQL Syntax Reference (SQLZoo)", "https://sqlzoo.net/", "SQLZoo", "2-3 hours", "beginner"),
    ],
    ("sql", "tutorial_video"): [
        ("SQL Full Course (freeCodeCamp)", "https://www.youtube.com/watch?v=HXV3zeQKqGY", "freeCodeCamp", "4 hours", "beginner"),
    ],
    ("sql", "coding_challenge"): [
        ("SQLZoo Interactive Exercises", "https://sqlzoo.net/wiki/SQL_Tutorial", "SQLZoo", "1-2 weeks", "beginner"),
        ("LeetCode Database Problems", "https://leetcode.com/problemset/database/", "LeetCode", "2-4 weeks", "intermediate"),
    ],
    
    # Git patterns
    ("git", "documentation"): [
        ("Pro Git Book (Official)", "https://git-scm.com/book/en/v2", "Official Book", "2-3 hours", "beginner"),
        ("Atlassian Git Tutorial", "https://www.atlassian.com/git/tutorials", "Atlassian", "2-3 hours", "beginner"),
    ],
    ("git", "tutorial_video"): [
        ("Git and GitHub for Beginners (freeCodeCamp)", "https://www.youtube.com/watch?v=RGOj5yH7evk", "freeCodeCamp", "1 hour", "beginner"),
    ],
    ("git", "interactive_lab"): [
        ("Learn Git Branching", "https://learngitbranching.js.org/", "Interactive Game", "3-5 hours", "beginner"),
    ],
}


def find_high_value_resources(
    skill: str,
    resource_types: list[ResourceType],
    count_per_type: int = 2,
) -> dict[ResourceType, list[tuple]]:
    """
    Find high-value, curated resources for a skill and resource types.
    
    Returns:
      {resource_type: [(title, url, platform, est_time, difficulty), ...]}
    """
    results = {}
    
    for rtype in resource_types:
        key = (skill.lower(), rtype)
        if key in HIGH_VALUE_RESOURCE_PATTERNS:
            results[rtype] = HIGH_VALUE_RESOURCE_PATTERNS[key][:count_per_type]
        else:
            results[rtype] = []
    
    return results


# ────────────────────────────────────────────────────────
# Personalization by Learning Style
# ────────────────────────────────────────────────────────

def prioritize_resources_by_learning_style(
    resources_by_type: dict[ResourceType, list],
    learning_style: LearningStyle,
    user_skill_level: str,
) -> list[tuple]:
    """
    Sort and prioritize resources based on user's learning style and skill level.
    
    Returns:
      Sorted list of (title, url, platform, est_time, difficulty) tuples
    """
    
    # Define priority rankings for each learning style
    style_priorities = {
        "video_tutorials": {
            "tutorial_video": 1,
            "course_video": 2,
            "worked_example": 3,
            "documentation": 4,
            "interactive_lab": 5,
        },
        "hands_on": {
            "interactive_lab": 1,
            "coding_challenge": 2,
            "project_based": 3,
            "tutorial_video": 4,
            "documentation": 5,
        },
        "reading": {
            "documentation": 1,
            "tutorial_article": 2,
            "cheat_sheet": 3,
            "course_article": 4,
            "tutorial_video": 5,
        },
        "interactive": {
            "interactive_course": 1,
            "interactive_lab": 2,
            "coding_challenge": 3,
            "tutorial_video": 4,
            "documentation": 5,
        },
        "mentor": {
            "course_video": 1,
            "tutorial_video": 2,
            "interactive_course": 3,
            "worked_example": 4,
            "documentation": 5,
        },
        "mixed": {
            "documentation": 1,
            "tutorial_video": 2,
            "interactive_lab": 3,
            "coding_challenge": 4,
            "worked_example": 5,
        },
    }
    
    priorities = style_priorities.get(learning_style, style_priorities["mixed"])
    
    # Flatten all resources with priority scores
    flattened = []
    for rtype, resources in resources_by_type.items():
        priority = priorities.get(rtype, 10)  # Higher = lower priority
        for resource in resources:
            flattened.append((priority, resource))
    
    # Sort by priority (lower score = higher priority)
    flattened.sort(key=lambda x: x[0])
    
    # Return just the resources (strip priority)
    return [resource for _, resource in flattened]


# ────────────────────────────────────────────────────────
# Feedback Signals for Continuous Improvement
# ────────────────────────────────────────────────────────

@dataclass
class ResourceFeedback:
    """Feedback signals for a resource used by a user."""
    user_id: str
    skill: str
    resource_url: str
    clicked: bool = False
    completed: bool = False
    usefulness_rating: Optional[float] = None  # 1-5 star rating
    time_spent_minutes: Optional[int] = None
    feedback_timestamp: Optional[str] = None


def should_deprioritize_resource(feedback: list[ResourceFeedback]) -> bool:
    """
    Determine if a resource should be deprioritized based on aggregated feedback.
    
    Returns True if:
    - Low click-through rate (< 20%)
    - Low completion rate (< 40%)
    - Low average rating (< 2.5 stars)
    """
    if not feedback:
        return False
    
    clicked = sum(1 for f in feedback if f.clicked)
    completed = sum(1 for f in feedback if f.completed)
    ratings = [f.usefulness_rating for f in feedback if f.usefulness_rating]
    
    click_rate = clicked / len(feedback) if feedback else 0
    completion_rate = completed / len(feedback) if feedback else 0
    avg_rating = sum(ratings) / len(ratings) if ratings else 3.0
    
    return click_rate < 0.20 or completion_rate < 0.40 or avg_rating < 2.5


logger.info("[Resource Discovery] Initialized intent-driven resource discovery pipeline")
