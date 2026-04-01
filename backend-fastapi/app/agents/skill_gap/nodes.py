"""
Nodes for the skill gap analyzer agent.
Implements individual steps in the skill gap analysis workflow.
Uses LLM-based extraction and matching instead of hardcoded regex + TF-IDF.
"""

import re
import json
import os
import logging
from enum import Enum
from datetime import datetime
from dotenv import load_dotenv
from .state import SkillGapState, CareerMatch
from app.agents.llm_config import GROQ_CLIENT as client, GROQ_SKILLGAP_MODEL

# Setup logging
logger = logging.getLogger(__name__)

load_dotenv()

CLUSTER_CONFIDENCE_THRESHOLD = 0.65
LOW_PROFICIENCY_THRESHOLD = 1


class GapBucket(str, Enum):
    CRITICAL_BLOCKER = "critical_blocker"
    PARTIAL_GAP = "partial_gap"
    OPPORTUNITY = "opportunity"
    RESUME_GAP = "resume_gap"

# ────────────────────────────────────────────────────────
# Skill Learning Time Estimates (in days)
# Quick Fix: < 7 days, Short: 7-30 days, Medium: 30-90 days, Long: 90+ days
# ────────────────────────────────────────────────────────
SKILL_LEARNING_TIME = {
    # Quick Fix Skills (< 1 week - 1-7 days)
    "Git": 3,
    "Markdown": 1,
    "JSON": 2,
    "YAML": 2,
    "REST API": 5,
    "Postman": 3,
    "Swagger": 3,
    "VS Code": 2,
    "GitHub": 4,
    "GitLab": 4,
    "npm": 3,
    "pip": 2,
    "cURL": 2,
    "SSH": 3,
    "Figma": 5,
    "Wireframing": 4,
    "Bootstrap": 6,
    "Tailwind CSS": 5,
    "JIRA": 4,
    "Confluence": 3,
    "Trello": 2,
    "Slack": 1,
    "Excel": 6,
    "PowerPoint": 4,
    "Google Analytics": 5,
    
    # Short-term Skills (1-4 weeks - 7-30 days)
    "HTML": 10,
    "CSS": 14,
    "JavaScript": 21,
    "TypeScript": 14,
    "SQL": 14,
    "MongoDB": 14,
    "PostgreSQL": 14,
    "MySQL": 14,
    "Redis": 10,
    "Docker": 14,
    "Docker Compose": 7,
    "GraphQL": 14,
    "FastAPI": 10,
    "Flask": 10,
    "Express.js": 12,
    "Jest": 7,
    "Pytest": 7,
    "JUnit": 7,
    "Selenium": 10,
    "Beautiful Soup": 7,
    "jQuery": 10,
    "Material-UI": 8,
    "Chakra UI": 8,
    "Sass": 7,
    "Less": 7,
    "Webpack": 10,
    "Vite": 7,
    "ESLint": 5,
    "Prettier": 3,
    "Bash Scripting": 14,
    "Shell Scripting": 14,
    "Linux": 21,
    "Ubuntu": 14,
    "Nginx": 10,
    "Apache": 10,
    "Heroku": 7,
    "Netlify": 5,
    "Vercel": 5,
    "Firebase": 14,
    "Supabase": 10,
    
    # Medium-term Skills (1-3 months - 30-90 days)
    "Python": 45,
    "Java": 60,
    "C++": 60,
    "C#": 45,
    "Go": 40,
    "Golang": 40,
    "Rust": 75,
    "Swift": 50,
    "Kotlin": 45,
    "Ruby": 40,
    "PHP": 40,
    "R": 45,
    "React": 45,
    "React Native": 50,
    "Angular": 50,
    "Vue.js": 40,
    "Next.js": 35,
    "Nuxt.js": 35,
    "Svelte": 30,
    "Node.js": 40,
    "Django": 45,
    "Spring": 60,
    "Spring Boot": 50,
    "ASP.NET": 55,
    ".NET": 60,
    "Laravel": 40,
    "Ruby on Rails": 50,
    "Kubernetes": 60,
    "AWS": 60,
    "Azure": 60,
    "GCP": 60,
    "Google Cloud": 60,
    "Google Cloud Platform": 60,
    "Terraform": 45,
    "Ansible": 40,
    "Jenkins": 35,
    "GitLab CI/CD": 30,
    "GitHub Actions": 25,
    "CircleCI": 25,
    "CI/CD": 40,
    "Microservices": 60,
    "System Design": 75,
    "Data Structures": 60,
    "Algorithms": 75,
    "OOP": 50,
    "Design Patterns": 60,
    "TDD": 40,
    "BDD": 35,
    "Agile": 30,
    "Scrum": 25,
    "Kanban": 20,
    "DevOps": 75,
    "Cloud Architecture": 70,
    "Serverless": 40,
    "Lambda": 30,
    "EC2": 25,
    "S3": 15,
    "DynamoDB": 25,
    "CloudFormation": 40,
    "CDK": 35,
    "Pandas": 35,
    "NumPy": 30,
    "Matplotlib": 25,
    "Seaborn": 20,
    "Scikit-learn": 45,
    
    # Long-term Skills (3+ months - 90+ days)
    "Machine Learning": 120,
    "Deep Learning": 150,
    "TensorFlow": 90,
    "PyTorch": 90,
    "Keras": 60,
    "NLP": 100,
    "Natural Language Processing": 100,
    "Computer Vision": 110,
    "MLOps": 80,
    "Data Science": 120,
    "Statistics": 90,
    "Mathematics": 180,
    "AI": 150,
    "Artificial Intelligence": 150,
    "Blockchain": 100,
    "Solidity": 75,
    "Smart Contracts": 90,
    "Cybersecurity": 120,
    "Penetration Testing": 90,
    "Ethical Hacking": 100,
    "Security": 90,
    "Network Security": 90,
    "Cloud Security": 80,
    "Game Development": 120,
    "Unity": 90,
    "Unreal Engine": 110,
    "3D Modeling": 120,
    "Blender": 90,
    "UI/UX Design": 90,
    "Product Management": 120,
    "Product Strategy": 100,
    "Business Analysis": 90,
    "Data Engineering": 100,
    "Big Data": 100,
    "Spark": 75,
    "Hadoop": 80,
    "Kafka": 60,
    "Elasticsearch": 50,
    "ELK Stack": 60,
}


def get_skill_learning_metadata(skill: str) -> dict:
    """
    Get learning time estimate and quick_fix flag for a skill.
    
    Args:
        skill: The skill name
        
    Returns:
        Dict with:
        - learning_days: Estimated days to learn (int)
        - learning_time_label: Human-readable label (str)
        - is_quick_fix: True if skill can be learned in < 7 days (bool)
    """
    # Normalize skill name for lookup (handle case variations)
    days = SKILL_LEARNING_TIME.get(skill, None)
    
    # Try case-insensitive lookup if exact match fails
    if days is None:
        skill_lower = skill.lower()
        for key, value in SKILL_LEARNING_TIME.items():
            if key.lower() == skill_lower:
                days = value
                break
    
    # Default to 30 days if not found (medium-term skill)
    if days is None:
        days = 30
    
    # Determine label and quick_fix flag
    if days <= 7:
        label = f"{days} day{'s' if days != 1 else ''}"
        is_quick_fix = True
    elif days <= 14:
        label = f"{days} days (~{days // 7} week{'s' if days > 7 else ''})"
        is_quick_fix = False
    elif days <= 30:
        label = f"{days} days (~{days // 7} weeks)"
        is_quick_fix = False
    elif days <= 90:
        label = f"~{days // 30} month{'s' if days > 30 else ''}"
        is_quick_fix = False
    else:
        label = f"~{days // 30} months"
        is_quick_fix = False
    
    return {
        "learning_days": days,
        "learning_time_label": label,
        "is_quick_fix": is_quick_fix,
    }


# Predefined career clusters with required skills
CAREER_CLUSTERS = {
    "Software Engineer": {
        "skills": [
            "Python", "Java", "JavaScript", "C++", "TypeScript", "React", "Node.js",
            "Django", "Flask", "FastAPI", "REST API", "GraphQL", "SQL", "MongoDB",
            "PostgreSQL", "Git", "Docker", "Kubernetes", "AWS", "Azure", "GCP",
            "CI/CD", "Agile", "Scrum", "Testing", "Debugging", "Problem Solving",
            "Data Structures", "Algorithms", "System Design", "OOP"
        ],
        "keywords": ["software", "developer", "programming", "coding", "engineering"]
    },
    "Data Scientist": {
        "skills": [
            "Python", "R", "Machine Learning", "Deep Learning", "TensorFlow", "PyTorch",
            "Scikit-learn", "Pandas", "NumPy", "SQL", "Statistics", "Mathematics",
            "Data Visualization", "Tableau", "Power BI", "A/B Testing", "NLP",
            "Computer Vision", "Feature Engineering", "Model Deployment", "MLOps",
            "Jupyter", "Data Mining", "Big Data", "Spark", "Hadoop"
        ],
        "keywords": ["data", "analytics", "machine learning", "AI", "statistics"]
    },
    "Data Analyst": {
        "skills": [
            "SQL", "Excel", "Python", "R", "Tableau", "Power BI", "Statistics",
            "Data Visualization", "Business Intelligence", "ETL", "Data Cleaning",
            "Data Mining", "Dashboard Creation", "Reporting", "Forecasting",
            "A/B Testing", "Google Analytics", "Looker", "Pandas", "NumPy"
        ],
        "keywords": ["analyst", "analytics", "reporting", "business intelligence", "insights"]
    },
    "DevOps Engineer": {
        "skills": [
            "Docker", "Kubernetes", "Jenkins", "CI/CD", "AWS", "Azure", "GCP",
            "Terraform", "Ansible", "Git", "Linux", "Shell Scripting", "Python",
            "Monitoring", "Grafana", "Prometheus", "ELK Stack", "Nginx", "Load Balancing",
            "Security", "Networking", "Infrastructure as Code", "Microservices"
        ],
        "keywords": ["devops", "infrastructure", "deployment", "automation", "cloud"]
    },
    "Full Stack Developer": {
        "skills": [
            "JavaScript", "TypeScript", "React", "Angular", "Vue.js", "Node.js",
            "Express.js", "HTML", "CSS", "REST API", "GraphQL", "MongoDB", "PostgreSQL",
            "MySQL", "Git", "Docker", "AWS", "Authentication", "Testing", "Redux",
            "Next.js", "Tailwind CSS", "Bootstrap", "Responsive Design"
        ],
        "keywords": ["full stack", "frontend", "backend", "web development"]
    },
    "Machine Learning Engineer": {
        "skills": [
            "Python", "Machine Learning", "Deep Learning", "TensorFlow", "PyTorch",
            "Scikit-learn", "MLOps", "Model Deployment", "Docker", "Kubernetes",
            "AWS", "Feature Engineering", "Data Preprocessing", "Model Optimization",
            "APIs", "Git", "CI/CD", "Monitoring", "Mathematics", "Statistics",
            "Computer Vision", "NLP", "Neural Networks"
        ],
        "keywords": ["machine learning", "ML engineer", "AI", "model deployment"]
    },
    "Product Manager": {
        "skills": [
            "Product Strategy", "Roadmapping", "User Research", "Wireframing",
            "A/B Testing", "Analytics", "SQL", "Agile", "Scrum", "JIRA",
            "Communication", "Stakeholder Management", "Market Research",
            "Competitive Analysis", "User Stories", "Product Development",
            "Prioritization", "Data Analysis", "UX/UI", "Leadership"
        ],
        "keywords": ["product", "management", "strategy", "roadmap", "user experience"]
    },
    "UI/UX Designer": {
        "skills": [
            "Figma", "Adobe XD", "Sketch", "Wireframing", "Prototyping",
            "User Research", "Usability Testing", "Design Systems", "Typography",
            "Color Theory", "Responsive Design", "Mobile Design", "Web Design",
            "HTML", "CSS", "User Flows", "Information Architecture",
            "Accessibility", "Visual Design", "Adobe Creative Suite"
        ],
        "keywords": ["design", "UX", "UI", "user experience", "interface"]
    },
    "Cloud Architect": {
        "skills": [
            "AWS", "Azure", "GCP", "Cloud Architecture", "Microservices",
            "Kubernetes", "Docker", "Serverless", "Lambda", "EC2", "S3",
            "Security", "Networking", "Load Balancing", "High Availability",
            "Disaster Recovery", "Cost Optimization", "Infrastructure as Code",
            "Terraform", "CloudFormation", "Monitoring"
        ],
        "keywords": ["cloud", "architect", "infrastructure", "scalability"]
    },
    "Cybersecurity Analyst": {
        "skills": [
            "Security", "Network Security", "Penetration Testing", "Vulnerability Assessment",
            "SIEM", "Firewall", "Intrusion Detection", "Encryption", "Risk Assessment",
            "Compliance", "ISO 27001", "NIST", "Ethical Hacking", "Malware Analysis",
            "Security Auditing", "Python", "Linux", "Windows Security", "Cloud Security"
        ],
        "keywords": ["security", "cybersecurity", "penetration", "threat", "protection"]
    },
    "Business Analyst": {
        "skills": [
            "Requirements Gathering", "Business Process Modeling", "SQL", "Excel",
            "Data Analysis", "Documentation", "Stakeholder Management", "JIRA",
            "Agile", "Scrum", "Wireframing", "Use Cases", "User Stories",
            "Business Intelligence", "Power BI", "Tableau", "Communication",
            "Problem Solving", "Process Improvement"
        ],
        "keywords": ["business", "analyst", "requirements", "process", "stakeholder"]
    },
    "Mobile Developer": {
        "skills": [
            "React Native", "Flutter", "Swift", "Kotlin", "Java", "iOS", "Android",
            "Mobile UI/UX", "REST API", "Firebase", "Push Notifications",
            "App Store", "Google Play", "Git", "Testing", "Debugging",
            "Performance Optimization", "Mobile Security", "Responsive Design"
        ],
        "keywords": ["mobile", "iOS", "android", "app development"]
    }
}


def _normalize_role(value: str | None) -> str:
    if not value:
        return ""
    return re.sub(r"\s+", " ", value.replace("_", " ").replace("-", " ")).strip().lower()


def _to_title_role(value: str) -> str:
    if not value:
        return ""
    return " ".join(part.capitalize() for part in _normalize_role(value).split())


_SKILL_ALIAS_MAP = {
    "js": "javascript",
    "javascript": "javascript",
    "reactjs": "react",
    "react": "react",
    "nextjs": "nextjs",
    "next": "nextjs",
    "nodejs": "nodejs",
    "node": "nodejs",
    "ts": "typescript",
    "typescript": "typescript",
    "csharp": "csharp",
    "cplusplus": "cplusplus",
}


def _normalize_skill(value: str | None) -> str:
    """Normalize skill strings to canonical equivalents for robust matching."""
    if not value:
        return ""

    txt = value.lower().strip()
    txt = txt.replace("c++", "cplusplus")
    txt = txt.replace("c#", "csharp")
    txt = txt.replace(".js", "js")
    txt = re.sub(r"[^a-z0-9\s]", " ", txt)
    txt = re.sub(r"\s+", " ", txt).strip()
    if not txt:
        return ""

    compact = txt.replace(" ", "")
    if compact in _SKILL_ALIAS_MAP:
        return _SKILL_ALIAS_MAP[compact]

    # Keep multi-word skills like "machine learning" stable.
    return txt


def _resolve_target_role(questionnaire_answers: dict | None) -> str | None:
    qa = questionnaire_answers or {}
    raw = qa.get("target_role") or qa.get("target_roles") or []
    if isinstance(raw, str):
        raw_roles = [raw]
    elif isinstance(raw, list):
        raw_roles = [r for r in raw if isinstance(r, str)]
    else:
        raw_roles = []

    normalized = [_normalize_role(r) for r in raw_roles if _normalize_role(r)]
    for role in normalized:
        if role != "undecided":
            return _to_title_role(role)
    return None


def _get_reference_skills_for_career(career_name: str) -> list[str]:
    """Return canonical skills for a career using normalized-name matching."""
    if not career_name:
        return []

    direct = CAREER_CLUSTERS.get(career_name, {}).get("skills")
    if isinstance(direct, list) and direct:
        return [s for s in direct if isinstance(s, str)]

    target_norm = _normalize_role(career_name)
    for canonical_name, data in CAREER_CLUSTERS.items():
        if _normalize_role(canonical_name) == target_norm:
            skills = data.get("skills")
            if isinstance(skills, list):
                return [s for s in skills if isinstance(s, str)]
            return []
    return []


_PRIMARY_LANGUAGE_SKILLS = {
    "python",
    "java",
    "javascript",
    "typescript",
    "cplusplus",
    "csharp",
    "go",
    "ruby",
    "php",
    "swift",
    "kotlin",
    "r",
}

_LANGUAGE_FAMILIES = [
    {"javascript", "typescript"},
    {"python"},
    {"java"},
    {"cplusplus"},
    {"csharp"},
    {"go"},
    {"ruby"},
    {"php"},
    {"swift"},
    {"kotlin"},
    {"r"},
]


def _is_language_outlier_for_profile(skill: str, user_norm: set[str]) -> bool:
    """Suppress unrelated primary-language gaps to keep recommendations realistic."""
    norm = _normalize_skill(skill)
    if norm not in _PRIMARY_LANGUAGE_SKILLS:
        return False

    user_langs = user_norm.intersection(_PRIMARY_LANGUAGE_SKILLS)
    if not user_langs:
        return False

    if norm in user_langs:
        return False

    for family in _LANGUAGE_FAMILIES:
        if norm in family and user_langs.intersection(family):
            return False

    return True


def _safe_json_load(value: str) -> dict | list | None:
    try:
        data = json.loads(value)
        if isinstance(data, (dict, list)):
            return data
    except Exception:
        return None
    return None


def _extract_json_payload(raw: str) -> dict | list | None:
    """Best-effort extraction for JSON responses wrapped with prose/code fences."""
    if not raw:
        return None

    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)

    parsed = _safe_json_load(cleaned)
    if parsed is not None:
        return parsed

    array_match = re.search(r"\[[\s\S]*\]", cleaned)
    if array_match:
        parsed = _safe_json_load(array_match.group(0))
        if parsed is not None:
            return parsed

    object_match = re.search(r"\{[\s\S]*\}", cleaned)
    if object_match:
        parsed = _safe_json_load(object_match.group(0))
        if parsed is not None:
            return parsed

    return None


def _default_score_summary(match: CareerMatch) -> str:
    matched_count = int(match.get("matched_skills_count", 0) or 0)
    total_required = int(match.get("total_required_skills", 0) or 0)
    missing_count = len(match.get("missing_skills", []) or [])
    improve_count = len(match.get("needs_improvement_skills", []) or [])
    score = round(float(match.get("probability", 0) or 0), 1)
    return (
        f"This role scores {score}% because you already match {matched_count} of {total_required} core skills. "
        f"There are {missing_count} major gaps and {improve_count} skills that need deeper proficiency."
    )


def _extract_timeline_weeks(questionnaire_answers: dict | None) -> int | None:
    qa = questionnaire_answers or {}
    timeline = qa.get("timeline_weeks") or qa.get("timeline") or qa.get("readiness_timeline")

    if isinstance(timeline, int):
        return max(1, timeline)
    if isinstance(timeline, str):
        m = re.search(r"(\d+)", timeline)
        if m:
            return max(1, int(m.group(1)))
    if isinstance(timeline, list) and timeline:
        for item in timeline:
            if isinstance(item, int):
                return max(1, item)
            if isinstance(item, str):
                m = re.search(r"(\d+)", item)
                if m:
                    return max(1, int(m.group(1)))
    return None


def _extract_user_profile(questionnaire_answers: dict | None) -> dict:
    qa = questionnaire_answers or {}
    profile = qa.get("user_profile")
    return profile if isinstance(profile, dict) else {}


def _to_skill_set(values: list | str | None) -> set[str]:
    if isinstance(values, str):
        raw = re.split(r"[,\n;/|]", values)
    elif isinstance(values, list):
        raw = [v for v in values if isinstance(v, str)]
    else:
        raw = []
    return {_normalize_skill(v) for v in raw if _normalize_skill(v)}


def _build_proficiency_map(state: SkillGapState, questionnaire_answers: dict | None) -> dict[str, int]:
    proficiency: dict[str, int] = {}

    # 1) Explicit self-rating from questionnaire/profile if available
    qa = questionnaire_answers or {}
    explicit_sources = [
        qa.get("skill_self_ratings"),
        _extract_user_profile(questionnaire_answers).get("skill_proficiency"),
    ]
    for source in explicit_sources:
        if isinstance(source, dict):
            for skill, rating in source.items():
                key = _normalize_skill(skill)
                try:
                    score = int(rating)
                    proficiency[key] = max(1, min(3, score))
                except Exception:
                    continue

    # 2) Confidence-derived fallback for extracted skills
    for item in state.get("skill_confidence_details", []) or []:
        skill = _normalize_skill(item.get("skill"))
        if not skill or skill in proficiency:
            continue
        level = item.get("level")
        if level == "high_confidence":
            proficiency[skill] = 3
        elif level == "medium_confidence":
            proficiency[skill] = 2
        else:
            proficiency[skill] = 1

    return proficiency


def _is_resume_gap_candidate(skill: str, user_profile: dict, user_skills: list[str]) -> bool:
    norm_skill = _normalize_skill(skill)
    if not norm_skill:
        return False

    expertise = _to_skill_set(user_profile.get("expertise"))
    interests = _to_skill_set(user_profile.get("areas_of_interest"))
    known = {_normalize_skill(s) for s in user_skills}

    if norm_skill in expertise or norm_skill in interests:
        return True

    # Heuristic: keyword overlap with known skills suggests articulation gap.
    skill_tokens = set(norm_skill.split())
    for k in known:
        overlap = skill_tokens.intersection(set(k.split()))
        if overlap and (len(overlap) / max(1, len(skill_tokens))) >= 0.5:
            return True
    return False


def _bucketize_gaps(
    required_skills: list[str],
    preferred_skills: list[str],
    user_skills: list[str],
    proficiency_map: dict[str, int],
    user_profile: dict,
) -> dict[str, list[dict]]:
    user_skill_set = {_normalize_skill(s) for s in user_skills}

    buckets: dict[str, list[dict]] = {
        GapBucket.CRITICAL_BLOCKER.value: [],
        GapBucket.PARTIAL_GAP.value: [],
        GapBucket.OPPORTUNITY.value: [],
        GapBucket.RESUME_GAP.value: [],
    }

    def push(bucket: GapBucket, skill: str, required: bool, proficiency: int = 0):
        buckets[bucket.value].append(
            {
                "skill": skill,
                "required": required,
                "proficiency": proficiency,
                **get_skill_learning_metadata(skill),
            }
        )

    for skill in required_skills:
        norm = _normalize_skill(skill)
        prof = proficiency_map.get(norm, 0)
        if norm not in user_skill_set:
            if _is_resume_gap_candidate(skill, user_profile, user_skills):
                push(GapBucket.RESUME_GAP, skill, required=True, proficiency=prof)
            else:
                push(GapBucket.CRITICAL_BLOCKER, skill, required=True, proficiency=prof)
        elif prof <= LOW_PROFICIENCY_THRESHOLD:
            push(GapBucket.PARTIAL_GAP, skill, required=True, proficiency=prof)

    required_norm = {_normalize_skill(s) for s in required_skills}
    for skill in preferred_skills:
        norm = _normalize_skill(skill)
        if not norm or norm in required_norm:
            continue
        prof = proficiency_map.get(norm, 0)
        if norm not in user_skill_set:
            if _is_resume_gap_candidate(skill, user_profile, user_skills):
                push(GapBucket.RESUME_GAP, skill, required=False, proficiency=prof)
            else:
                push(GapBucket.OPPORTUNITY, skill, required=False, proficiency=prof)

    return buckets


def _apply_timeline_scope(
    buckets: dict[str, list[dict]],
    timeline_weeks: int | None,
) -> tuple[dict[str, list[dict]], list[dict], str | None]:
    if not timeline_weeks:
        return buckets, [], None

    max_days = timeline_weeks * 7
    out_of_scope: list[dict] = []
    for bucket_key in [GapBucket.CRITICAL_BLOCKER.value, GapBucket.PARTIAL_GAP.value, GapBucket.OPPORTUNITY.value]:
        kept = []
        for item in buckets.get(bucket_key, []):
            if item.get("learning_days", 0) > max_days:
                entry = {**item, "original_bucket": bucket_key, "reason": f"outside_{timeline_weeks}_week_window"}
                out_of_scope.append(entry)
            else:
                kept.append(item)
        buckets[bucket_key] = kept

    note = None
    if out_of_scope:
        note = (
            f"These {len(out_of_scope)} skills are outside your {timeline_weeks}-week window "
            "and have been deprioritized for now."
        )

    return buckets, out_of_scope, note


def _flatten_planner_skills(buckets: dict[str, list[dict]]) -> list[str]:
    ordered = []
    for key in [GapBucket.CRITICAL_BLOCKER.value, GapBucket.PARTIAL_GAP.value, GapBucket.OPPORTUNITY.value]:
        for item in buckets.get(key, []):
            ordered.append(item["skill"])
    seen = set()
    result = []
    for skill in ordered:
        norm = _normalize_skill(skill)
        if norm not in seen:
            seen.add(norm)
            result.append(skill)
    return result


def _build_gap_reason(
    career_name: str,
    skill: str,
    bucket: str,
    matched_skills: list[str],
    required: bool,
    evidence_item: dict | None = None,
) -> str:
    """Generate a concise, evidence-grounded rationale for why a skill matters."""
    matched_preview = ", ".join(matched_skills[:3]) if matched_skills else "your current skills"
    evidence_item = evidence_item if isinstance(evidence_item, dict) else {}
    evidence_list = evidence_item.get("evidence") if isinstance(evidence_item.get("evidence"), list) else []
    confidence_level = str(evidence_item.get("level") or "").strip()

    evidence_text = ""
    if evidence_list:
        evidence_text = f" Evidence seen: {', '.join(evidence_list[:3])}."
    elif confidence_level:
        evidence_text = f" Current evidence confidence: {confidence_level.replace('_', ' ')}."
    else:
        evidence_text = " No clear evidence was found in skills/projects/experience for this skill."

    if bucket == GapBucket.CRITICAL_BLOCKER.value:
        return (
            f"{skill} is a core requirement for {career_name}. This is a hard gap right now and will likely block interviews "
            f"or day-1 tasks for this role.{evidence_text}"
        )

    if bucket == GapBucket.PARTIAL_GAP.value:
        return (
            f"{skill} appears in your profile but depth is not yet strong enough for {career_name}. "
            f"This is an improvement gap, not a complete miss. Build stronger proof through project/work usage.{evidence_text}"
        )

    if bucket == GapBucket.OPPORTUNITY.value:
        return (
            f"{skill} is not a strict blocker, but teams hiring for {career_name} often prefer it for stronger shortlisting "
            f"and broader ownership. Your current strengths ({matched_preview}) still carry weight.{evidence_text}"
        )

    # resume_gap
    req_text = "required" if required else "preferred"
    return (
        f"{skill} may be present but is not clearly evidenced in your resume/profile. It is {req_text} for {career_name}, "
        f"so improve how this skill is demonstrated before assuming relearning is needed.{evidence_text}"
    )


def _analyze_career_path(
    career_name: str,
    required_skills: list[str],
    preferred_skills: list[str],
    user_skills: list[str],
    proficiency_map: dict[str, int],
    user_profile: dict,
    timeline_weeks: int | None,
) -> tuple[CareerMatch, dict[str, list[dict]], list[dict], str | None]:
    buckets = _bucketize_gaps(
        required_skills=required_skills,
        preferred_skills=preferred_skills,
        user_skills=user_skills,
        proficiency_map=proficiency_map,
        user_profile=user_profile,
    )
    buckets, out_of_scope_skills, timeline_note = _apply_timeline_scope(
        buckets=buckets,
        timeline_weeks=timeline_weeks,
    )

    planner_skills = _flatten_planner_skills(buckets)
    user_norm = {_normalize_skill(s) for s in user_skills}
    matched_skills = [
        s for s in (required_skills + preferred_skills)
        if _normalize_skill(s) in user_norm
    ]

    needs_improvement = []
    for item in buckets.get(GapBucket.PARTIAL_GAP.value, []):
        needs_improvement.append(item["skill"])

    hard_missing = []
    for key in [GapBucket.CRITICAL_BLOCKER.value, GapBucket.OPPORTUNITY.value]:
        for item in buckets.get(key, []):
            hard_missing.append(item["skill"])

    # Stable dedupe with canonical normalization
    seen_missing = set()
    missing_skills = []
    for skill in hard_missing:
        norm = _normalize_skill(skill)
        if norm and norm not in seen_missing:
            seen_missing.add(norm)
            missing_skills.append(skill)

    seen_improve = set()
    needs_improvement_skills = []
    for skill in needs_improvement:
        norm = _normalize_skill(skill)
        if norm and norm not in seen_improve:
            seen_improve.add(norm)
            needs_improvement_skills.append(skill)

    total_required = max(1, len(required_skills))
    total_preferred = len(preferred_skills)

    critical_required = len([
        item for item in buckets[GapBucket.CRITICAL_BLOCKER.value]
        if item.get("required", False)
    ])
    partial_required = len([
        item for item in buckets[GapBucket.PARTIAL_GAP.value]
        if item.get("required", False)
    ])
    partial_preferred = len([
        item for item in buckets[GapBucket.PARTIAL_GAP.value]
        if not item.get("required", False)
    ])

    resolved_required = max(0, total_required - critical_required - partial_required)
    required_component = ((resolved_required + (0.6 * partial_required)) / total_required) * 100

    if total_preferred > 0:
        preferred_norm = {_normalize_skill(s) for s in preferred_skills}
        matched_preferred = len([
            s for s in user_skills
            if _normalize_skill(s) in preferred_norm
        ])
        preferred_component = ((matched_preferred + (0.6 * partial_preferred)) / total_preferred) * 100
    else:
        preferred_component = 100.0

    # Less strict blended score: prioritize required coverage but grant partial credit.
    skill_match = round((0.75 * required_component) + (0.25 * preferred_component), 2)
    skill_match = max(0.0, min(100.0, skill_match))

    missing_metadata = []
    for bucket_key in [
        GapBucket.CRITICAL_BLOCKER.value,
        GapBucket.PARTIAL_GAP.value,
        GapBucket.OPPORTUNITY.value,
        GapBucket.RESUME_GAP.value,
    ]:
        for item in buckets.get(bucket_key, []):
            skill = item.get("skill")
            missing_metadata.append(
                {
                    "skill": skill,
                    "bucket": bucket_key,
                    "required": item.get("required", False),
                    "proficiency": item.get("proficiency", 0),
                    **get_skill_learning_metadata(skill),
                    "reason": _build_gap_reason(
                        career_name=career_name,
                        skill=skill,
                        bucket=bucket_key,
                        matched_skills=matched_skills,
                        required=bool(item.get("required", False)),
                    ),
                }
            )

    match: CareerMatch = {
        "career": career_name,
        "probability": skill_match,
        "skill_match_percentage": skill_match,
        "matched_skills": matched_skills,
        "missing_skills": missing_skills,
        "needs_improvement_skills": needs_improvement_skills,
        "missing_skills_metadata": missing_metadata,
        "total_required_skills": len(required_skills),
        "matched_skills_count": len(matched_skills),
    }

    return match, buckets, out_of_scope_skills, timeline_note


# ── Tech Stack Definitions ──
# Each stack lists technologies that are specific to it.
# Skills NOT listed in any stack are considered "universal" and always included.
TECH_STACKS = {
    "Python": [
        "Python", "Django", "Flask", "FastAPI", "Pandas", "NumPy",
        "Jupyter", "Scikit-learn", "TensorFlow", "PyTorch",
    ],
    "JavaScript / TypeScript": [
        "JavaScript", "TypeScript", "React", "Angular", "Vue.js",
        "Node.js", "Express.js", "Next.js", "Redux",
    ],
    "Java": ["Java"],
    "C++": ["C++"],
    "Swift / iOS": ["Swift", "iOS"],
    "Kotlin / Android": ["Kotlin", "Android"],
    "React Native": ["React Native"],
    "Flutter": ["Flutter"],
    "R": ["R"],
}

# For some careers, the generic filter doesn't work well (e.g. Full Stack needs
# both frontend + backend).  Provide explicit skill sets per stack instead.
CAREER_STACK_OVERRIDES: dict[str, dict[str, list[str]]] = {
    "Full Stack Developer": {
        "Python": [
            "Python", "Django", "Flask", "JavaScript", "React", "HTML", "CSS",
            "REST API", "GraphQL", "PostgreSQL", "MongoDB", "Git", "Docker",
            "AWS", "Authentication", "Testing", "Tailwind CSS", "Responsive Design",
        ],
        "JavaScript / TypeScript": [
            "JavaScript", "TypeScript", "React", "Node.js", "Express.js",
            "Next.js", "HTML", "CSS", "REST API", "GraphQL", "MongoDB",
            "PostgreSQL", "Git", "Docker", "AWS", "Authentication", "Testing",
            "Redux", "Tailwind CSS", "Responsive Design",
        ],
        "Java": [
            "Java", "JavaScript", "React", "HTML", "CSS",
            "REST API", "GraphQL", "PostgreSQL", "MongoDB", "Git", "Docker",
            "AWS", "Authentication", "Testing", "Responsive Design",
        ],
    },
    "Mobile Developer": {
        "Swift / iOS": [
            "Swift", "iOS", "Mobile UI/UX", "REST API", "Firebase",
            "Push Notifications", "App Store", "Git", "Testing", "Debugging",
            "Performance Optimization", "Mobile Security",
        ],
        "Kotlin / Android": [
            "Kotlin", "Android", "Mobile UI/UX", "REST API", "Firebase",
            "Push Notifications", "Google Play", "Git", "Testing", "Debugging",
            "Performance Optimization", "Mobile Security",
        ],
        "React Native": [
            "React Native", "JavaScript", "TypeScript", "Mobile UI/UX", "REST API",
            "Firebase", "Push Notifications", "App Store", "Google Play", "Git",
            "Testing", "Debugging", "Performance Optimization", "Mobile Security",
        ],
        "Flutter": [
            "Flutter", "Mobile UI/UX", "REST API", "Firebase",
            "Push Notifications", "App Store", "Google Play", "Git",
            "Testing", "Debugging", "Performance Optimization", "Mobile Security",
        ],
    },
}


def detect_primary_stacks(user_skills: list[str]) -> list[dict]:
    """Return detected tech stacks sorted by number of matched technologies."""
    normalized_skills = {_normalize_skill(s) for s in user_skills}
    results = []
    for stack_name, stack_techs in TECH_STACKS.items():
        matched = [t for t in stack_techs if _normalize_skill(t) in normalized_skills]
        if matched:
            results.append({
                "stack": stack_name,
                "matched": matched,
                "confidence": round(len(matched) / len(stack_techs), 2),
            })
    results.sort(key=lambda x: x["confidence"], reverse=True)
    return results


def _resolve_effective_tech_stack(
    preferred_tech_stack: str | None,
    user_skills: list[str],
) -> tuple[str | None, str | None]:
    """
    Returns:
      effective_stack: stack used for filtering suggestions
      inferred_stack: stack inferred from resume (for transparency/debug)
    """
    if preferred_tech_stack and preferred_tech_stack != "no_preference":
        return preferred_tech_stack, None

    detected = detect_primary_stacks(user_skills)
    if not detected:
        return None, None

    top = detected[0]
    # Avoid overfitting on weak signals.
    if len(top.get("matched", [])) >= 2 or top.get("confidence", 0) >= 0.3:
        inferred = top.get("stack")
        return inferred, inferred

    return None, None


def get_career_skills_for_stack(career: str, stack: str) -> list[str]:
    """
    Return the skill set for *career* filtered through *stack*.

    Uses CAREER_STACK_OVERRIDES when available; otherwise applies the generic
    filter: keep universal skills + skills belonging to the selected stack,
    drop skills belonging to other stacks.
    """
    # Explicit override?
    if career in CAREER_STACK_OVERRIDES and stack in CAREER_STACK_OVERRIDES[career]:
        return CAREER_STACK_OVERRIDES[career][stack]

    career_skills = CAREER_CLUSTERS.get(career, {}).get("skills", [])
    if not career_skills:
        return []

    # Build set of ALL stack-specific techs (lowercase)
    all_stack_techs_lower: set[str] = set()
    for techs in TECH_STACKS.values():
        all_stack_techs_lower.update(_normalize_skill(t) for t in techs)

    # Selected stack's techs (lowercase)
    selected_lower = {_normalize_skill(t) for t in TECH_STACKS.get(stack, [])}

    filtered = []
    for skill in career_skills:
        sl = _normalize_skill(skill)
        if sl not in all_stack_techs_lower:
            # Universal / stack-agnostic -> always include
            filtered.append(skill)
        elif sl in selected_lower:
            # Belongs to the selected stack -> include
            filtered.append(skill)
        # else: belongs to another stack -> exclude
    return filtered


def _skills_from_profile(user_profile: dict | None) -> dict[str, str | list[str]]:
    """Extract profile-backed evidence blocks used by skill extraction."""
    up = user_profile if isinstance(user_profile, dict) else {}
    return {
        "skills": up.get("skills") if isinstance(up.get("skills"), list) else [],
        "projects": up.get("projects") if isinstance(up.get("projects"), str) else "",
        "experience": up.get("experience") if isinstance(up.get("experience"), str) else "",
        "expertise": up.get("expertise") if isinstance(up.get("expertise"), str) else "",
        "areas_of_interest": up.get("areas_of_interest") if isinstance(up.get("areas_of_interest"), str) else "",
    }


def _normalize_extracted_skill_tokens(skills: list[str]) -> list[str]:
    """Split category-prefixed entries and dedupe to reduce noisy extraction output."""
    tokens: list[str] = []
    for raw in skills:
        if not isinstance(raw, str):
            continue
        value = raw.strip()
        if not value:
            continue

        # Handle profile lines like "Languages: Python" / "Backend: Django, FastAPI"
        if ":" in value and len(value) <= 120:
            left, right = value.split(":", 1)
            category = left.strip().lower()
            if category in {"languages", "backend", "frontend", "ml/ai", "databases", "tools", "technical skills", "skills"}:
                value = right.strip()

        parts = re.split(r"[,/|;]\s*", value)
        for p in parts:
            skill = p.strip()
            if not skill:
                continue
            # Keep known compact skills like C, R, C++ while removing obvious labels.
            if skill.lower() in {"technical skills", "projects", "experience", "education"}:
                continue
            tokens.append(skill)

    seen: set[str] = set()
    unique: list[str] = []
    for s in tokens:
        key = _normalize_skill(s)
        if not key or key in seen:
            continue
        seen.add(key)
        unique.append(s)
    return unique


def extract_skills_from_resume(
    skills_text: str | None = None,
    projects_text: str | None = None,
    resume_text: str | None = None,
    profile_context: dict | None = None,
) -> list[str]:
    """
    Extract skills using the dedicated skills section and project tech-stacks.

    Priority:
      1. ``skills_text`` + ``projects_text`` (structured sections from resume)
      2. Falls back to ``resume_text`` only when sections are unavailable.

    Falls back to regex matching against CAREER_CLUSTERS if the LLM call fails.
    """
    # Build a focused input for the LLM
    profile_blocks = _skills_from_profile(profile_context)

    if skills_text or projects_text:
        input_block = ""
        if skills_text:
            input_block += f"=== SKILLS SECTION ===\n{skills_text}\n\n"
        if projects_text:
            input_block += f"=== PROJECTS SECTION ===\n{projects_text}\n"
        if profile_blocks.get("skills"):
            input_block += f"\n=== USER PROFILE SKILLS ===\n{json.dumps(profile_blocks.get('skills', []), ensure_ascii=False)}\n"
        if profile_blocks.get("projects"):
            input_block += f"\n=== USER PROFILE PROJECTS ===\n{profile_blocks.get('projects')}\n"
        if profile_blocks.get("experience"):
            input_block += f"\n=== USER PROFILE EXPERIENCE ===\n{profile_blocks.get('experience')}\n"
        if profile_blocks.get("expertise"):
            input_block += f"\n=== USER PROFILE EXPERTISE ===\n{profile_blocks.get('expertise')}\n"
    elif resume_text:
        input_block = resume_text[:6000]
        if profile_blocks.get("skills"):
            input_block += f"\n\n=== USER PROFILE SKILLS ===\n{json.dumps(profile_blocks.get('skills', []), ensure_ascii=False)}\n"
        if profile_blocks.get("projects"):
            input_block += f"\n=== USER PROFILE PROJECTS ===\n{profile_blocks.get('projects')}\n"
        if profile_blocks.get("experience"):
            input_block += f"\n=== USER PROFILE EXPERIENCE ===\n{profile_blocks.get('experience')}\n"
        if profile_blocks.get("expertise"):
            input_block += f"\n=== USER PROFILE EXPERTISE ===\n{profile_blocks.get('expertise')}\n"
    else:
        return []

    try:
        prompt = (
            "Extract every technical skill, tool, framework, programming language, "
            "methodology, and platform from the text below.\n\n"
            "Rules:\n"
            "- Return ONLY a JSON array of strings.\n"
            "- Use the canonical / most-common capitalisation (e.g. 'JavaScript' not 'javascript').\n"
            "- Include soft skills only if they are clearly tech-adjacent (e.g. 'Agile', 'Scrum').\n"
            "- Do NOT include job titles, company names, organization names, or degrees.\n"
            "- Do NOT include project names — only the technologies used in those projects.\n"
            "- Keep each item short (one skill per entry, no descriptions).\n"
            "- Prioritize explicit evidence from SKILLS/PROJECTS/EXPERIENCE/EXPERTISE blocks over assumptions.\n"
            "- Do NOT infer tools/skills that are not explicitly present in the provided text.\n"
            "- For single-letter or very short skill names (e.g. 'R', 'C'), only extract them "
            "if they CLEARLY refer to the programming language (e.g. 'R programming', "
            "'statistical analysis in R', 'R Studio', 'C language'). Do NOT extract 'R' from "
            "'R&D', 'HR', or other abbreviations where R is not the programming language.\n\n"
            f"{input_block}"
        )

        completion = client.chat.completions.create(
            model=GROQ_SKILLGAP_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a precise resume-skill extractor. "
                        "Respond ONLY with a JSON array of strings. No commentary."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.0,
        )

        raw = (completion.choices[0].message.content or "").strip()
        if not raw:
            raise ValueError("LLM returned empty response")
        # Strip markdown fences if present
        if raw.startswith("```"):
            raw = re.sub(r"^```(?:json)?\s*", "", raw)
            raw = re.sub(r"\s*```$", "", raw)

        skills = json.loads(raw)
        if isinstance(skills, list):
            unique = _normalize_extracted_skill_tokens([s for s in skills if isinstance(s, str)])

            # Merge explicit user_profile skills (if any) to stabilize extraction.
            if profile_blocks.get("skills"):
                unique = _normalize_extracted_skill_tokens(unique + [str(s) for s in profile_blocks.get("skills", [])])

            logger.info(f"LLM extracted {len(unique)} skills from resume")
            return unique

    except Exception as e:
        logger.warning(f"LLM skill extraction failed, falling back to regex: {e}")

    # ── Fallback: regex matching against CAREER_CLUSTERS ──
    fallback_text = skills_text or projects_text or resume_text or ""
    fallback = _regex_extract_skills(fallback_text)
    if profile_blocks.get("skills"):
        fallback = _normalize_extracted_skill_tokens(fallback + [str(s) for s in profile_blocks.get("skills", [])])
    return fallback


# Short skill names (≤2 chars) that need stricter matching context
# to avoid false positives (e.g. "R" matching in "R&D", "HR", etc.)
_SHORT_SKILL_CONTEXT = {
    "r": [
        r"\br\s+(programming|language|studio|script|markdown|package|cran|tidyverse|ggplot|dplyr|shiny)",
        r"(programming|language|statistical|statistics|data\s+analysis|analysis|modeling|visualization)\s+(in|with|using)\s+r\b",
        r"\br\s*[,;/|]\s*(python|julia|matlab|sas|spss|stata)",
        r"(python|julia|matlab|sas|spss|stata)\s*[,;/|]\s*r\b",
        r"\brstudio\b",
        r"\bcran\b",
    ],
    "c": [
        r"\bc\s+(programming|language)",
        r"(programming|language)\s+(in|with)\s+c\b",
        r"\bc\s*[,;/|]\s*(c\+\+|java|python|assembly)",
        r"(c\+\+|assembly)\s*[,;/|]\s*c\b",
        r"\bc/c\+\+",
    ],
}


def _regex_extract_skills(resume_text: str) -> list[str]:
    """Fallback regex-based skill extraction using CAREER_CLUSTERS."""
    resume_lower = resume_text.lower()
    found_skills: set[str] = set()

    all_skills: set[str] = set()
    for cluster_data in CAREER_CLUSTERS.values():
        all_skills.update(cluster_data["skills"])

    for skill in all_skills:
        skill_lower = skill.lower()

        # Short skills (≤2 chars) need contextual matching to avoid false positives
        if len(skill_lower) <= 2 and skill_lower in _SHORT_SKILL_CONTEXT:
            context_patterns = _SHORT_SKILL_CONTEXT[skill_lower]
            if any(re.search(p, resume_lower) for p in context_patterns):
                found_skills.add(skill)
            continue

        pattern = r"(?<![a-zA-Z])" + re.escape(skill_lower) + r"(?![a-zA-Z])"
        if re.search(pattern, resume_lower):
            found_skills.add(skill)

    return list(found_skills)


def _build_career_reference(preferred_tech_stack: str | None = None) -> str:
    """
    Build a compact text summary of CAREER_CLUSTERS for the LLM prompt.
    If preferred_tech_stack is provided, filters skills to match the stack.
    """
    lines = []
    for career, data in CAREER_CLUSTERS.items():
        # Filter skills by tech stack if preference is provided
        if preferred_tech_stack and preferred_tech_stack != "no_preference":
            skills = get_career_skills_for_stack(career, preferred_tech_stack)
            if not skills:  # No specific override, use default filter
                skills = data["skills"]
        else:
            skills = data["skills"]
        
        skills_str = ", ".join(skills)
        lines.append(f"- {career}: {skills_str}")
    return "\n".join(lines)


def _contains_skill(text: str, skill: str) -> bool:
    if not text or not skill:
        return False
    pattern = r"(?<![a-zA-Z])" + re.escape(skill.lower()) + r"(?![a-zA-Z])"
    return re.search(pattern, text.lower()) is not None


ACTION_VERB_PATTERN = (
    r"implemented|built|developed|designed|deployed|optimized|led|created|"
    r"production|experience\s+with|worked\s+on|delivered|maintained|"
    r"architected|engineered|automated|integrated|migrated|launched"
)


def _skill_snippets(text: str, skill: str, window: int = 70) -> list[str]:
    if not text or not skill:
        return []

    snippets: list[str] = []
    lower = text.lower()
    skill_pattern = r"(?<![a-zA-Z])" + re.escape(skill.lower()) + r"(?![a-zA-Z])"

    for m in re.finditer(skill_pattern, lower):
        start = max(0, m.start() - window)
        end = min(len(lower), m.end() + window)
        snippets.append(lower[start:end])

    return snippets


def _score_skill_confidence(
    skill: str,
    skills_text: str,
    projects_text: str,
    experience_text: str,
    resume_text: str,
) -> tuple[int, list[str]]:
    score = 0
    evidence: list[str] = []

    in_skills = _contains_skill(skills_text, skill)
    in_projects = _contains_skill(projects_text, skill)
    in_experience = _contains_skill(experience_text, skill)
    in_resume = _contains_skill(resume_text, skill)

    if in_experience:
        score += 4
        evidence.append("mentioned in experience section")
    if in_projects:
        score += 3
        evidence.append("mentioned in projects section")
    if in_skills:
        score += 1
        evidence.append("listed in skills section")

    snippets = (
        _skill_snippets(experience_text, skill)
        + _skill_snippets(projects_text, skill)
        + _skill_snippets(resume_text, skill)
    )

    has_action_verb = any(re.search(ACTION_VERB_PATTERN, s) for s in snippets)
    if has_action_verb:
        score += 2
        evidence.append("action-verb evidence near skill")

    has_quant_impact = any(
        re.search(r"\b\d+\s*%|\b\d+\s*(x|k|m|\+)\b|reduced|increased|improved", s)
        for s in snippets
    )
    if has_quant_impact:
        score += 2
        evidence.append("quantified impact near skill")

    current_year = datetime.utcnow().year
    years_near_skill: list[int] = []
    for s in snippets:
        years_near_skill.extend(int(y) for y in re.findall(r"\b(20\d{2})\b", s))

    if years_near_skill:
        latest = max(years_near_skill)
        if latest >= current_year - 2:
            score += 2
            evidence.append(f"recent exposure ({latest})")
        elif latest <= current_year - 6:
            score -= 1
            evidence.append(f"older exposure ({latest})")

    if in_skills and not in_projects and not in_experience:
        score -= 1
    if in_resume and not in_skills and not in_projects and not in_experience:
        evidence.append("detected in resume text only")

    return score, evidence


def _classify_skill_confidence(
    user_skills: list[str],
    skills_text: str | None,
    projects_text: str | None,
    experience_text: str | None,
    resume_text: str | None,
) -> tuple[dict[str, list[str]], list[dict]]:
    levels = {
        "high_confidence": [],
        "medium_confidence": [],
        "low_confidence": [],
    }
    details: list[dict] = []

    skills_text_l = (skills_text or "").lower()
    projects_text_l = (projects_text or "").lower()
    experience_text_l = (experience_text or "").lower()
    resume_text_l = (resume_text or "").lower()

    for skill in user_skills:
        score, evidence = _score_skill_confidence(
            skill=skill,
            skills_text=skills_text_l,
            projects_text=projects_text_l,
            experience_text=experience_text_l,
            resume_text=resume_text_l,
        )

        if score >= 6:
            level = "high_confidence"
        elif score >= 3:
            level = "medium_confidence"
        else:
            level = "low_confidence"

        levels[level].append(skill)
        details.append(
            {
                "skill": skill,
                "level": level,
                "score": score,
                "evidence": evidence,
            }
        )

    return levels, details


def extract_skills_node(state: SkillGapState) -> SkillGapState:
    """
    Node: Extract skills from the skills section + project stack.
    Falls back to full resume text when sections aren't available.
    """
    try:
        questionnaire_answers = state.get("questionnaire_answers") or {}
        user_profile = questionnaire_answers.get("user_profile") if isinstance(questionnaire_answers, dict) else None

        user_skills = extract_skills_from_resume(
            skills_text=state.get("skills_text"),
            projects_text=state.get("projects_text"),
            resume_text=state.get("resume_text"),
            profile_context=user_profile,
        )
        confidence_levels, confidence_details = _classify_skill_confidence(
            user_skills=user_skills,
            skills_text=state.get("skills_text"),
            projects_text=state.get("projects_text"),
            experience_text=state.get("experience_text"),
            resume_text=state.get("resume_text"),
        )
        normalized_skills = []
        for item in confidence_details:
            level = item.get("level")
            proficiency = 3 if level == "high_confidence" else (2 if level == "medium_confidence" else 1)
            normalized_skills.append(
                {
                    "skill": item.get("skill", ""),
                    "normalized": _normalize_role(item.get("skill", "")),
                    "proficiency": proficiency,
                    "confidence_level": level,
                }
            )
        logger.info(f"Extracted {len(user_skills)} skills from resume")

        return {
            **state,
            "user_skills": user_skills,
            "normalized_skills": normalized_skills,
            "total_skills_found": len(user_skills),
            "skill_confidence_levels": confidence_levels,
            "skill_confidence_details": confidence_details,
        }
    except Exception as e:
        logger.error(f"Error extracting skills: {str(e)}")
        return {
            **state,
            "error": f"Error extracting skills: {str(e)}",
            "user_skills": [],
            "normalized_skills": [],
            "total_skills_found": 0,
            "skill_confidence_levels": {
                "high_confidence": [],
                "medium_confidence": [],
                "low_confidence": [],
            },
            "skill_confidence_details": [],
        }


def calculate_career_probabilities_node(state: SkillGapState) -> SkillGapState:
    """
    Node: LLM-only career matching based on extracted skills + user preferences.

    This intentionally avoids strict hardcoded cluster scoring so recommendations
    are generated directly by the model from the user's context.
    """
    try:
        user_skills = state.get("user_skills", [])
        questionnaire_answers = state.get("questionnaire_answers", {})
        preferred_tech_stack = None
        if isinstance(questionnaire_answers, dict):
            preferred_tech_stack = questionnaire_answers.get("preferred_tech_stack")
        effective_stack, _ = _resolve_effective_tech_stack(preferred_tech_stack, user_skills)
        career_reference = _build_career_reference(effective_stack)
        timeline_weeks = _extract_timeline_weeks(questionnaire_answers)
        proficiency_map = _build_proficiency_map(state, questionnaire_answers)
        confidence_by_skill: dict[str, dict] = {}
        for item in state.get("skill_confidence_details", []) or []:
            skill_key = _normalize_skill(item.get("skill"))
            if skill_key:
                confidence_by_skill[skill_key] = item

        target_role = _resolve_target_role(questionnaire_answers)
        if not target_role:
            target_role = "General Software Engineer"

        prompt = f"""You are a career-matching expert.

User skills: {user_skills}
Target role preference: {target_role}
Timeline target (weeks): {timeline_weeks if timeline_weeks is not None else 'not specified'}

Return ONLY valid JSON with this schema:
[
  {{
    "career": "string",
    "probability": 0-100,
    "skill_match_percentage": 0-100,
    "matched_skills": ["..."],
    "missing_skills": ["..."],
    "needs_improvement_skills": ["..."],
    "score_summary": "short paragraph under 45 words"
  }}
]

Rules:
- Return 4 to 8 careers.
- Keep skills canonical and concise.
- Do not repeat the same skill across missing_skills and needs_improvement_skills.
- Keep missing_skills focused to the most impactful core gaps (typically 3 to 7 items).
- Avoid unrelated primary-language gaps unless clearly essential for that career.
- Be practical and less strict with scoring (do not under-score partially matching profiles).
"""

        completion = client.chat.completions.create(
            model=GROQ_SKILLGAP_MODEL,
            messages=[
                {"role": "system", "content": "Return only JSON. No markdown."},
                {
                    "role": "system",
                    "content": (
                        "Use this canonical career-skill reference for role grounding. "
                        "These clusters are authoritative context, not mandatory exact output names.\n"
                        f"{career_reference}"
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.2,
        )

        raw = (completion.choices[0].message.content or "").strip()
        parsed = _extract_json_payload(raw)
        if not isinstance(parsed, list) or not parsed:
            raise ValueError("LLM returned empty or invalid career_matches payload")

        user_norm = {_normalize_skill(s) for s in user_skills}

        def _dedupe(values: list[str]) -> list[str]:
            seen = set()
            result = []
            for value in values:
                if not isinstance(value, str):
                    continue
                v = value.strip()
                n = _normalize_skill(v)
                if not v or not n or n in seen:
                    continue
                seen.add(n)
                result.append(v)
            return result

        career_matches: list[CareerMatch] = []
        for item in parsed:
            if not isinstance(item, dict):
                continue

            career_name = str(item.get("career", "")).strip()
            if not career_name:
                continue

            matched = _dedupe(item.get("matched_skills", []) if isinstance(item.get("matched_skills"), list) else [])
            missing = _dedupe(item.get("missing_skills", []) if isinstance(item.get("missing_skills"), list) else [])
            improve = _dedupe(item.get("needs_improvement_skills", []) if isinstance(item.get("needs_improvement_skills"), list) else [])

            reference_skills = _get_reference_skills_for_career(career_name)
            if reference_skills:
                # Calibrate sparse LLM output using canonical role skills so overlap-heavy roles
                # (e.g., Software Engineer vs Full Stack) do not collapse into tiny counts.
                ref_matched = [s for s in reference_skills if _normalize_skill(s) in user_norm]
                ref_missing = [
                    s for s in reference_skills
                    if _normalize_skill(s) not in user_norm and not _is_language_outlier_for_profile(s, user_norm)
                ]

                matched = _dedupe((matched + ref_matched)[:24])
                missing = _dedupe((missing + ref_missing)[:7])

            missing = _dedupe([s for s in missing if not _is_language_outlier_for_profile(s, user_norm)])

            # Keep sets disjoint to avoid confusing UX.
            missing_norm = {_normalize_skill(s) for s in missing}
            improve = [s for s in improve if _normalize_skill(s) not in missing_norm]
            improve = _dedupe(improve[:10])

            # If matched list is too thin from the model, recover obvious intersections.
            if not matched:
                all_reported = {_normalize_skill(s) for s in (missing + improve)}
                matched = [s for s in user_skills if _normalize_skill(s) not in all_reported][:12]

            prob = item.get("probability", item.get("skill_match_percentage", 0))
            try:
                prob = float(prob)
            except Exception:
                prob = 0.0
            prob = max(0.0, min(100.0, round(prob, 2)))

            skill_match = item.get("skill_match_percentage", prob)
            try:
                skill_match = float(skill_match)
            except Exception:
                skill_match = prob
            skill_match = max(0.0, min(100.0, round(skill_match, 2)))

            missing_metadata = []
            for skill in missing:
                detail = confidence_by_skill.get(_normalize_skill(skill))
                missing_metadata.append(
                    {
                        "skill": skill,
                        "bucket": GapBucket.CRITICAL_BLOCKER.value,
                        "required": True,
                        "proficiency": int(proficiency_map.get(_normalize_skill(skill), 0)),
                        **get_skill_learning_metadata(skill),
                        "reason": _build_gap_reason(
                            career_name=career_name,
                            skill=skill,
                            bucket=GapBucket.CRITICAL_BLOCKER.value,
                            matched_skills=matched,
                            required=True,
                            evidence_item=detail,
                        ),
                    }
                )
            for skill in improve:
                detail = confidence_by_skill.get(_normalize_skill(skill))
                missing_metadata.append(
                    {
                        "skill": skill,
                        "bucket": GapBucket.PARTIAL_GAP.value,
                        "required": True,
                        "proficiency": int(proficiency_map.get(_normalize_skill(skill), 0)),
                        **get_skill_learning_metadata(skill),
                        "reason": _build_gap_reason(
                            career_name=career_name,
                            skill=skill,
                            bucket=GapBucket.PARTIAL_GAP.value,
                            matched_skills=matched,
                            required=True,
                            evidence_item=detail,
                        ),
                    }
                )

            if reference_skills:
                total_required = len({_normalize_skill(s) for s in reference_skills if _normalize_skill(s)})
            else:
                total_required = len({*[_normalize_skill(s) for s in matched], *[_normalize_skill(s) for s in missing], *[_normalize_skill(s) for s in improve]})

            match_evidence = []
            for skill in matched[:10]:
                detail = confidence_by_skill.get(_normalize_skill(skill))
                if detail:
                    match_evidence.append(
                        {
                            "skill": skill,
                            "confidence_level": detail.get("level"),
                            "score": detail.get("score", 0),
                            "evidence": detail.get("evidence", []),
                        }
                    )

            evidence_projects = 0
            evidence_experience = 0
            for entry in match_evidence:
                ev = " ".join(entry.get("evidence", [])).lower()
                if "projects" in ev:
                    evidence_projects += 1
                if "experience" in ev:
                    evidence_experience += 1

            score_summary = str(item.get("score_summary", "")).strip()
            if not score_summary:
                score_summary = _default_score_summary({
                    "probability": prob,
                    "matched_skills_count": len(matched),
                    "total_required_skills": total_required,
                    "missing_skills": missing,
                    "needs_improvement_skills": improve,
                })
            if match_evidence:
                score_summary = (
                    f"{score_summary} Evidence: {len(match_evidence)} matched skills are grounded in resume/profile context"
                    f" ({evidence_projects} from projects, {evidence_experience} from experience)."
                )

            career_matches.append(
                {
                    "career": career_name,
                    "probability": prob,
                    "skill_match_percentage": skill_match,
                    "matched_skills": matched,
                    "missing_skills": missing,
                    "needs_improvement_skills": improve,
                    "missing_skills_metadata": missing_metadata,
                    "match_evidence": match_evidence,
                    "total_required_skills": total_required,
                    "matched_skills_count": len(matched),
                    "score_summary": score_summary,
                }
            )

        if not career_matches:
            raise ValueError("No valid career matches after LLM normalization")

        career_matches.sort(key=lambda x: x.get("probability", 0), reverse=True)

        selected_match = next(
            (cm for cm in career_matches if _normalize_role(cm.get("career", "")) == _normalize_role(target_role)),
            None,
        )
        if not selected_match:
            selected_match = career_matches[0]

        critical_bucket = []
        partial_bucket = []
        for skill in selected_match.get("missing_skills", []):
            critical_bucket.append(
                {
                    "skill": skill,
                    "required": True,
                    "proficiency": int(proficiency_map.get(_normalize_skill(skill), 0)),
                    **get_skill_learning_metadata(skill),
                }
            )
        for skill in selected_match.get("needs_improvement_skills", []):
            partial_bucket.append(
                {
                    "skill": skill,
                    "required": True,
                    "proficiency": int(proficiency_map.get(_normalize_skill(skill), 0)),
                    **get_skill_learning_metadata(skill),
                }
            )

        gap_buckets = {
            GapBucket.CRITICAL_BLOCKER.value: critical_bucket,
            GapBucket.PARTIAL_GAP.value: partial_bucket,
            GapBucket.OPPORTUNITY.value: [],
            GapBucket.RESUME_GAP.value: [],
        }

        study_planner_skills = []
        seen_planner = set()
        for skill in (selected_match.get("missing_skills", []) + selected_match.get("needs_improvement_skills", [])):
            norm = _normalize_skill(skill)
            if norm and norm not in seen_planner:
                seen_planner.add(norm)
                study_planner_skills.append(skill)

        return {
            **state,
            "career_matches": career_matches,
            "top_3_careers": career_matches[:3],
            "target_role": target_role,
            "selected_cluster_source": "llm_direct",
            "selected_cluster_confidence": 1.0,
            "timeline_weeks": timeline_weeks,
            "skill_proficiency": proficiency_map,
            "gap_buckets": gap_buckets,
            "resume_optimizer_skills": [],
            "study_planner_skills": study_planner_skills,
            "out_of_scope_skills": [],
            "timeline_note": None,
            "selected_target_career_match": selected_match,
        }

    except Exception as e:
        logger.warning(f"LLM career matching failed, falling back: {e}")
        return _fallback_career_probabilities(state)


def _fallback_career_probabilities(state: SkillGapState) -> SkillGapState:
    """Fallback: minimal non-strict response if LLM matching is unavailable."""
    user_skills = state.get("user_skills", [])
    questionnaire_answers = state.get("questionnaire_answers", {})
    timeline_weeks = _extract_timeline_weeks(questionnaire_answers)
    target_role = _resolve_target_role(questionnaire_answers)

    if not target_role:
        target_role = "General Software Engineer"

    proficiency_map = _build_proficiency_map(state, questionnaire_answers)
    matched = user_skills[: min(10, len(user_skills))]
    selected_match: CareerMatch = {
        "career": target_role,
        "probability": 55.0,
        "skill_match_percentage": 55.0,
        "matched_skills": matched,
        "missing_skills": [],
        "needs_improvement_skills": [],
        "missing_skills_metadata": [],
        "total_required_skills": max(1, len(matched)),
        "matched_skills_count": len(matched),
        "score_summary": "Fallback estimate generated because the LLM career matcher was unavailable. Re-run analysis for a detailed role-by-role explanation.",
    }

    buckets = {
        GapBucket.CRITICAL_BLOCKER.value: [],
        GapBucket.PARTIAL_GAP.value: [],
        GapBucket.OPPORTUNITY.value: [],
        GapBucket.RESUME_GAP.value: [],
    }

    return {
        **state,
        "career_matches": [selected_match],
        "top_3_careers": [selected_match],
        "target_role": target_role,
        "selected_cluster_source": "llm_fallback",
        "selected_cluster_confidence": 0.0,
        "timeline_weeks": timeline_weeks,
        "skill_proficiency": proficiency_map,
        "gap_buckets": buckets,
        "resume_optimizer_skills": [],
        "study_planner_skills": [],
        "out_of_scope_skills": [],
        "timeline_note": "LLM unavailable during matching. Results are a temporary fallback.",
        "selected_target_career_match": selected_match,
    }


def get_ai_recommendations_node(state: SkillGapState) -> SkillGapState:
    """
    Node: Get AI-powered career recommendations and learning paths.
    
    Args:
        state: The skill gap state.
        
    Returns:
        Updated state with AI recommendations.
    """
    try:
        user_skills = state.get("user_skills", [])
        top_careers = state.get("career_matches", [])
        resume_text = state["resume_text"]
        gap_buckets = state.get("gap_buckets", {})
        timeline_weeks = state.get("timeline_weeks")
        timeline_note = state.get("timeline_note")
        
        if not top_careers:
            logger.warning("No career matches to generate recommendations for")
            return {
                **state,
                "ai_recommendations": "Unable to generate recommendations - no career matches found."
            }
        
        top_3_careers = top_careers[:3]
        careers_summary = "\n".join([
            f"{i+1}. {career['career']} ({career['probability']}% match) - Missing: {', '.join(career['missing_skills'][:5])}"
            for i, career in enumerate(top_3_careers)
        ])
        critical = [item.get("skill") for item in gap_buckets.get(GapBucket.CRITICAL_BLOCKER.value, [])]
        partial = [item.get("skill") for item in gap_buckets.get(GapBucket.PARTIAL_GAP.value, [])]
        opportunity = [item.get("skill") for item in gap_buckets.get(GapBucket.OPPORTUNITY.value, [])]
        resume_gap = [item.get("skill") for item in gap_buckets.get(GapBucket.RESUME_GAP.value, [])]
        
        prompt = f"""Based on this resume analysis:

User's Current Skills: {', '.join(user_skills) if user_skills else 'No explicit skills detected'}

Top Career Matches:
{careers_summary}

Gap Buckets:
- critical_blocker: {critical}
- partial_gap: {partial}
- opportunity: {opportunity}
- resume_gap: {resume_gap}

Timeline target: {timeline_weeks or 'not specified'} weeks
Timeline note: {timeline_note or 'N/A'}

Provide:
1. Detailed explanation of why these careers match the user's profile
2. Recommended learning path for the top career (specific courses, certifications, projects)
3. Timeline to become job-ready for the top career
4. Actionable next steps
5. Separate resume-improvement actions for resume_gap items (these should not be treated as study tasks)

Keep the response structured and practical."""

        logger.info("Generating AI recommendations")
        completion = client.chat.completions.create(
            model=GROQ_SKILLGAP_MODEL,
            messages=[
                {"role": "system", "content": "You are an expert career counselor and skill development advisor."},
                {"role": "user", "content": prompt},
            ],
        )

        ai_recommendations = completion.choices[0].message.content
        logger.info("AI recommendations generated successfully")
        
        return {
            **state,
            "ai_recommendations": ai_recommendations
        }

    except Exception as e:
        logger.error(f"Error generating AI recommendations: {str(e)}")
        return {
            **state,
            "ai_recommendations": f"AI recommendations unavailable: {str(e)}"
        }


def compile_results_node(state: SkillGapState) -> SkillGapState:
    """
    Node: Compile final results and summary.
    
    Args:
        state: The skill gap state.
        
    Returns:
        Updated state with compiled results.
    """
    try:
        career_matches = state.get("career_matches", [])
        
        if not career_matches:
            logger.warning("No career matches to compile")
            analysis_summary = {
                "best_match": None,
                "best_match_probability": 0,
                "skills_to_focus": []
            }
        else:
            analysis_summary = {
                "best_match": career_matches[0]["career"] if career_matches else None,
                "best_match_probability": career_matches[0]["probability"] if career_matches else 0,
                "skills_to_focus": career_matches[0]["missing_skills"][:5] if career_matches else []
            }
        
        logger.info(f"Analysis summary compiled: best match = {analysis_summary['best_match']}")
        
        return {
            **state,
            "analysis_summary": analysis_summary
        }
    except Exception as e:
        logger.error(f"Error compiling results: {str(e)}")
        return {
            **state,
            "error": f"Error compiling results: {str(e)}",
            "analysis_summary": {
                "best_match": None,
                "best_match_probability": 0,
                "skills_to_focus": []
            }
        }
