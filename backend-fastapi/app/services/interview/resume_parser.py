import re
from typing import Dict, List


KNOWN_TECH = [
    "python", "java", "javascript", "typescript", "c", "c++", "c#", "go", "rust", "kotlin",
    "swift", "php", "ruby", "scala", "r", "sql", "nosql", "html", "css", "react",
    "next.js", "vue", "angular", "node.js", "express", "fastapi", "flask", "django", "spring",
    "spring boot", "dotnet", "asp.net", "pandas", "numpy", "pytorch", "tensorflow", "scikit-learn",
    "xgboost", "spark", "hadoop", "airflow", "dbt", "postgresql", "mysql", "mongodb", "redis",
    "elasticsearch", "kafka", "rabbitmq", "docker", "kubernetes", "terraform", "ansible", "git",
    "github actions", "jenkins", "aws", "azure", "gcp", "supabase", "langchain", "langgraph",
    "grpc", "graphql", "rest", "linux", "bash", "tableau", "power bi",
]

ROLE_REQUIREMENTS = {
    "software engineer": ["python", "sql", "git", "rest", "docker", "testing"],
    "full stack developer": ["react", "node.js", "sql", "api", "docker", "javascript"],
    "backend engineer": ["python", "fastapi", "postgresql", "redis", "docker", "kafka"],
    "data scientist": ["python", "pandas", "numpy", "machine learning", "sql", "tensorflow"],
    "data analyst": ["sql", "python", "tableau", "power bi", "excel", "statistics"],
    "devops engineer": ["docker", "kubernetes", "terraform", "aws", "ci/cd", "linux"],
    "machine learning engineer": ["python", "pytorch", "tensorflow", "mlops", "docker", "kubernetes"],
}

_SECTION_SPLIT = re.compile(r"\n\s*(experience|work experience|projects|skills|education)\s*\n", flags=re.IGNORECASE)
_METRIC_PATTERN = re.compile(r"\b\d+\s*(?:%|x|ms|users|members|weeks|months)\b", flags=re.IGNORECASE)
_PROJECT_LINE_PATTERN = re.compile(r"\b(built|developed|created|designed|implemented)\b", flags=re.IGNORECASE)
_COMPANY_PATTERN = re.compile(
    r"(?:at|@)\s+([A-Z][A-Za-z0-9&.,'\- ]{1,60})|([A-Z][A-Za-z0-9&.,'\- ]{1,60})\s*(?:\||\-|,)?\s*(?:inc|llc|ltd|corp|technologies|solutions)?",
    flags=re.IGNORECASE,
)


def _normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", text or " ").strip()


def _extract_section_text(resume_text: str, section_name: str) -> str:
    text = resume_text or ""
    matches = list(_SECTION_SPLIT.finditer(text))
    if not matches:
        return text

    for idx, match in enumerate(matches):
        if match.group(1).strip().lower() == section_name.lower():
            start = match.end()
            end = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
            return text[start:end]

    return text


def _extract_stack(resume_text: str, max_items: int = 8) -> List[str]:
    lowered = f" {resume_text.lower()} "
    stack: List[str] = []
    for tech in KNOWN_TECH:
        escaped = re.escape(tech.lower())
        if re.search(rf"(?<![a-z0-9]){escaped}(?![a-z0-9])", lowered):
            stack.append(tech)
        if len(stack) >= max_items:
            break
    return stack


def _extract_companies(experience_text: str, max_items: int = 2) -> List[str]:
    companies: List[str] = []
    seen = set()

    for line in (experience_text or "").splitlines():
        line_clean = line.strip()
        if not line_clean:
            continue

        match = _COMPANY_PATTERN.search(line_clean)
        if not match:
            continue

        candidate = (match.group(1) or match.group(2) or "").strip(" -|,")
        candidate = _normalize_text(candidate)
        if len(candidate) < 2:
            continue

        key = candidate.lower()
        if key in seen:
            continue

        seen.add(key)
        companies.append(candidate)

    return companies[-max_items:] if max_items > 0 else []


def _extract_projects(resume_text: str, max_items: int = 3) -> List[str]:
    lines = [_normalize_text(line) for line in (resume_text or "").splitlines()]
    selected: List[str] = []

    for line in lines:
        if not line:
            continue
        if _PROJECT_LINE_PATTERN.search(line):
            selected.append(line)
        if len(selected) >= max_items:
            break

    return selected


def _extract_metrics(resume_text: str, max_items: int = 4) -> List[str]:
    full_matches = _METRIC_PATTERN.finditer(resume_text or "")
    values: List[str] = []
    seen = set()

    for match in full_matches:
        metric = match.group(0).strip()
        key = metric.lower()
        if key in seen:
            continue
        seen.add(key)
        values.append(metric)
        if len(values) >= max_items:
            break

    return values


def _resolve_role_requirements(target_role: str) -> List[str]:
    role = (target_role or "software engineer").strip().lower()

    if role in ROLE_REQUIREMENTS:
        return ROLE_REQUIREMENTS[role]

    for known_role, requirements in ROLE_REQUIREMENTS.items():
        if known_role in role:
            return requirements

    return ROLE_REQUIREMENTS["software engineer"]


def _extract_gaps(resume_text: str, target_role: str, max_items: int = 4) -> List[str]:
    required = _resolve_role_requirements(target_role)
    lowered = (resume_text or "").lower()
    gaps: List[str] = []

    for item in required:
        escaped = re.escape(item.lower())
        if not re.search(rf"(?<![a-z0-9]){escaped}(?![a-z0-9])", lowered):
            gaps.append(item)
        if len(gaps) >= max_items:
            break

    return gaps


def extract_resume_anchors(resume_text: str, target_role: str) -> Dict[str, List[str]]:
    """Extract compact resume anchors using regex only; no LLM calls."""
    normalized = resume_text or ""
    experience_text = _extract_section_text(normalized, "experience")

    return {
        "stack": _extract_stack(normalized, max_items=8),
        "companies": _extract_companies(experience_text, max_items=2),
        "projects": _extract_projects(normalized, max_items=3),
        "metrics": _extract_metrics(normalized, max_items=4),
        "gaps": _extract_gaps(normalized, target_role, max_items=4),
    }
