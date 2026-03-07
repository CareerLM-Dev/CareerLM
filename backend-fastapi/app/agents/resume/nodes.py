# app/agents/resume/nodes.py
"""
Resume Agent Nodes — Career Advisor Framework

3-agent pipeline aligned to the rubric:
  Agent 1 — Structure & Completeness Analyzer
             Dimension 1: Structure & Formatting  (20% no-JD / 15% with-JD)
             Dimension 2: Section Completeness    (15% no-JD / 10% with-JD)

  Agent 2 — Relevance & Keyword Analyzer
             Dimension 3: Keyword & Relevance     (30% no-JD / 40% with-JD)
             Two modes: exact JD gap table (with JD) vs role-archetype baseline (no JD)

  Agent 3 — Impact & Specificity Advisor
             Dimension 4: Impact & Specificity    (35% both)
             Hybrid: deterministic verb/metric check + LLM vague-claim detection
             Redundancy & Noise check
             Computes final weighted score + zone label
"""

import json
import re
from typing import Any, Dict, List, Set

from app.agents.llm_config import GROQ_CLIENT, GROQ_DEFAULT_MODEL
from app.agents.resume.state import ResumeState


# ─── Role Archetypes ─────────────────────────────────────────────────────────

ROLE_ARCHETYPES: Dict[str, Dict] = {
    "software_engineer": {
        "label": "Software Engineer",
        "keywords": [
            "python", "java", "javascript", "git", "algorithms", "data structures",
            "api", "rest", "sql", "testing", "linux", "oop", "system design",
        ],
        "expected_sections": ["education", "skills", "projects"],
        "experience_required": False,
    },
    "data_scientist": {
        "label": "Data Scientist",
        "keywords": [
            "python", "machine learning", "statistics", "pandas", "numpy",
            "sklearn", "tensorflow", "sql", "visualization", "jupyter",
            "regression", "classification", "data analysis",
        ],
        "expected_sections": ["education", "skills", "projects"],
        "experience_required": False,
    },
    "data_analyst": {
        "label": "Data Analyst",
        "keywords": [
            "excel", "sql", "python", "tableau", "power bi",
            "visualization", "statistics", "reporting", "dashboards", "etl",
        ],
        "expected_sections": ["education", "skills", "projects"],
        "experience_required": False,
    },
    "ml_engineer": {
        "label": "ML Engineer",
        "keywords": [
            "python", "tensorflow", "pytorch", "mlops", "docker",
            "pipeline", "feature engineering", "model deployment", "sklearn",
            "kubernetes", "experiment tracking",
        ],
        "expected_sections": ["education", "skills", "projects"],
        "experience_required": False,
    },
    "full_stack_developer": {
        "label": "Full Stack Developer",
        "keywords": [
            "react", "node", "javascript", "html", "css",
            "api", "sql", "nosql", "git", "rest", "typescript",
        ],
        "expected_sections": ["education", "skills", "projects"],
        "experience_required": False,
    },
    "devops_engineer": {
        "label": "DevOps Engineer",
        "keywords": [
            "docker", "kubernetes", "ci/cd", "jenkins", "terraform",
            "aws", "linux", "monitoring", "git", "ansible", "cloud",
        ],
        "expected_sections": ["education", "skills", "projects"],
        "experience_required": False,
    },
    "product_manager": {
        "label": "Product Manager",
        "keywords": [
            "roadmap", "stakeholder", "agile", "scrum", "user research",
            "metrics", "kpi", "launch", "prioritization", "product strategy",
        ],
        "expected_sections": ["education", "experience", "projects"],
        "experience_required": True,
    },
    "cloud_architect": {
        "label": "Cloud Architect",
        "keywords": [
            "aws", "azure", "gcp", "terraform", "kubernetes", "docker",
            "microservices", "serverless", "iam", "vpc", "cost optimization",
        ],
        "expected_sections": ["education", "skills", "projects"],
        "experience_required": False,
    },
    "cybersecurity_analyst": {
        "label": "Cybersecurity Analyst",
        "keywords": [
            "penetration testing", "siem", "firewall", "nmap", "vulnerability",
            "incident response", "encryption", "compliance", "linux", "network security",
        ],
        "expected_sections": ["education", "skills", "projects"],
        "experience_required": False,
    },
    "mobile_developer": {
        "label": "Mobile Developer",
        "keywords": [
            "swift", "kotlin", "react native", "flutter", "android", "ios",
            "api", "rest", "git", "xcode", "firebase",
        ],
        "expected_sections": ["education", "skills", "projects"],
        "experience_required": False,
    },
    "business_analyst": {
        "label": "Business Analyst",
        "keywords": [
            "requirements", "stakeholder", "process mapping", "sql", "excel",
            "reporting", "brd", "user stories", "agile", "jira",
        ],
        "expected_sections": ["education", "experience", "projects"],
        "experience_required": False,
    },
    "ux_ui_designer": {
        "label": "UI/UX Designer",
        "keywords": [
            "figma", "sketch", "wireframes", "prototyping", "user research",
            "usability testing", "design thinking", "css", "accessibility",
        ],
        "expected_sections": ["education", "skills", "projects"],
        "experience_required": False,
    },
}

DEFAULT_ARCHETYPE: Dict = {
    "label": "General Tech",
    "keywords": ["python", "git", "sql", "api", "linux"],
    "expected_sections": ["education", "skills", "projects"],
    "experience_required": False,
}

ACTION_VERBS: Set[str] = {
    "built", "developed", "implemented", "designed", "created", "deployed",
    "optimized", "improved", "automated", "integrated", "reduced", "increased",
    "launched", "led", "managed", "analyzed", "engineered", "architected",
    "delivered", "collaborated", "migrated", "refactored", "tested", "documented",
    "mentored", "researched", "established", "streamlined", "maintained", "scaled",
    "resolved", "debugged", "containerized", "configured", "monitored",
    "benchmarked", "profiled", "orchestrated", "coordinated", "facilitated",
    "spearheaded", "championed", "accelerated", "extracted", "transformed",
    "visualized", "modeled", "forecasted", "validated", "secured", "trained",
    "fine-tuned", "scraped", "parsed", "reviewed", "diagnosed", "simulated",
    "prototyped", "pitched", "published", "contributed",
}

STOPWORDS: Set[str] = {
    "the", "and", "for", "with", "that", "this", "from", "your", "you",
    "are", "our", "will", "have", "has", "was", "were", "but", "not",
    "all", "any", "can", "may", "per", "use", "using", "used", "able",
    "role", "job", "work", "team", "skills", "experience", "years", "year",
    "required", "preferred", "also", "well", "into", "over", "they", "their",
    "what", "when", "where", "who", "how", "its", "more", "other",
}


# ─── Utility Helpers ─────────────────────────────────────────────────────────

def _truncate(text: str, max_chars: int) -> str:
    return text if len(text) <= max_chars else text[:max_chars] + "..."


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").lower()).strip()


def _build_resume_context(sections: Dict[str, str], max_chars: int = 8000) -> str:
    parts = [f"## {k.upper()}\n{v}" for k, v in sections.items() if v]
    return _truncate("\n\n".join(parts), max_chars)


def _extract_json(text: str) -> Dict[str, Any]:
    if not text:
        return {}
    for pattern in [
        r"```json\s*(\{.*?\})\s*```",
        r"```\s*(\{.*?\})\s*```",
        r"(\{(?:[^{}]|(?:\{(?:[^{}]|(?:\{[^{}]*\}))*\}))*\})",
    ]:
        m = re.search(pattern, text, re.DOTALL)
        if m:
            try:
                return json.loads(m.group(1))
            except json.JSONDecodeError:
                continue
    return {}


def _llm_json(prompt: str, max_tokens: int = 1500) -> Dict[str, Any]:
    response = GROQ_CLIENT.chat.completions.create(
        model=GROQ_DEFAULT_MODEL,
        messages=[{"role": "user", "content": prompt}],
        temperature=0.2,
        max_tokens=max_tokens,
    )
    return _extract_json(response.choices[0].message.content.strip())


def _clamp(value: float) -> int:
    return max(0, min(100, int(round(value))))


def _score_zone(score: int) -> str:
    if score < 50:
        return "Needs significant work"
    elif score < 75:
        return "Good foundation, clear gaps"
    return "Strong, minor refinements needed"


def _get_archetype(role_type: str) -> Dict:
    return ROLE_ARCHETYPES.get(role_type or "", DEFAULT_ARCHETYPE)


def _extract_bullets(resume_text: str) -> List[str]:
    bullets = []
    for line in resume_text.splitlines():
        stripped = line.strip()
        if stripped and stripped[0] in ("-", "•", "–", "*", "▪"):
            clean = re.sub(r"^[-•–*▪]\s*", "", stripped).strip()
            if len(clean) > 15:
                bullets.append(clean)
        elif re.match(r"^\d+\.\s+\w", stripped):
            clean = re.sub(r"^\d+\.\s+", "", stripped).strip()
            if len(clean) > 15:
                bullets.append(clean)
    return bullets


def _extract_keywords(text: str, limit: int = 60) -> List[str]:
    tokens = re.findall(r"[a-zA-Z][a-zA-Z0-9+.#/-]{2,}", _normalize(text))
    filtered = [t for t in tokens if t not in STOPWORDS]
    freq: Dict[str, int] = {}
    for t in filtered:
        freq[t] = freq.get(t, 0) + 1
    return [t for t, _ in sorted(freq.items(), key=lambda x: (-x[1], x[0]))[:limit]]


# ─── Deterministic Scorers ───────────────────────────────────────────────────

def _score_structure_formatting(resume_text: str) -> Dict:
    """
    Dimension 1 — Structure & Formatting (deterministic component).
    Checks: length appropriateness, long lines (multi-column signals), all-caps abuse.
    """
    lines = [l for l in resume_text.splitlines() if l.strip()]
    total_chars = len(resume_text)
    score = 100
    issues = []

    if total_chars > 6000:
        score -= 20
        issues.append({
            "title": "Resume likely exceeds one page",
            "explanation": (
                "Recruiters for entry-level roles expect a concise one-page resume. "
                "Yours appears longer than standard for a student or early-career candidate. "
                "Trim experience descriptions, remove redundant phrasing, and cut anything "
                "not directly relevant to the role."
            ),
            "evidence": f"Approximately {total_chars // 250} page(s) of content extracted.",
        })
    elif total_chars < 800:
        score -= 25
        issues.append({
            "title": "Resume is too sparse",
            "explanation": (
                "Your resume has very little content. A recruiter scanning this would have "
                "almost nothing to evaluate your candidacy on. Expand your project descriptions, "
                "skills section, and education details."
            ),
            "evidence": f"Only {total_chars} characters of content detected.",
        })

    long_lines = [l for l in lines if len(l) > 120]
    if len(long_lines) > 3:
        score -= min(25, len(long_lines) * 3)
        issues.append({
            "title": "Formatting may not parse cleanly in plain-text viewers",
            "explanation": (
                "Several lines are unusually long — a common side-effect of multi-column layouts, "
                "tables, or design-heavy templates. When basic viewers strip formatting, "
                "these lines can become garbled or run together."
            ),
            "evidence": f'Example line: "{long_lines[0][:80]}..."',
        })

    caps_lines = [l for l in lines if len(l.strip()) > 10 and l.strip().isupper()]
    if len(caps_lines) > 5:
        score -= min(15, len(caps_lines) * 2)
        issues.append({
            "title": "Excessive use of all-caps text",
            "explanation": (
                "Using all-caps for the majority of content can make the resume harder to scan. "
                "Recruiters skim for role names, company names, and skill keywords — "
                "heavy capitalisation slows that down."
            ),
            "evidence": f'Example: "{caps_lines[0].strip()}"',
        })

    return {"score": _clamp(score), "issues": issues}


def _score_section_completeness(
    resume_sections: Dict[str, str], role_type: str
) -> Dict:
    """
    Dimension 2 — Section Completeness (context-aware).
    Allows Projects to substitute for Experience (typical for students/early-career).
    """
    archetype = _get_archetype(role_type)
    expected = archetype["expected_sections"]

    present = []
    missing = []
    issues = []

    for section in expected:
        exists = bool(resume_sections.get(section) and len(resume_sections[section].strip()) > 30)
        if exists:
            present.append(section)
        else:
            # Projects can substitute for Experience (common for students/early-career)
            if section == "experience" and resume_sections.get("projects"):
                present.append(section)
                continue
            missing.append(section)
            issues.append({
                "title": f'Missing section: "{section.title()}"',
                "explanation": (
                    f'The "{section.title()}" section is typically expected in a '
                    f'{archetype["label"]} resume but was not detected. '
                    "A recruiter scanning your resume for this section will not find it, "
                    "which creates a gap in the first impression even if the content "
                    "exists elsewhere."
                ),
                "evidence": "Section not detected in resume.",
            })

    if role_type in ("devops_engineer", "cloud_architect"):
        if not resume_sections.get("certifications") and not resume_sections.get("achievements"):
            issues.append({
                "title": "Certifications section missing",
                "explanation": (
                    f"For {archetype['label']} roles, certifications "
                    "(e.g. AWS, GCP, CKA) carry significant weight. "
                    "If you hold any, add a dedicated Certifications section."
                ),
                "evidence": "No certifications or achievements section detected.",
            })

    score = _clamp((len(present) / max(1, len(expected))) * 100)
    return {"score": score, "missing_sections": missing, "issues": issues}


def _score_impact_deterministic(bullets: List[str]) -> Dict:
    """
    Deterministic component of Dimension 4 — Impact & Specificity.
    Checks: action verb at start of bullet, presence of numbers/metrics.
    """
    if not bullets:
        return {
            "action_verb_ratio": 0.0,
            "metric_ratio": 0.0,
            "score": 40,
            "bullets_without_verb": [],
            "bullets_without_metric": [],
        }

    has_verb = []
    has_metric = []
    metric_pattern = re.compile(
        r"\d+\s*[%xkms]|\d+\s*(million|billion|percent|users|requests|ms|sec|hrs?|days?|times?)",
        re.IGNORECASE,
    )
    for bullet in bullets:
        first_word = bullet.split()[0].lower().rstrip(".,;:") if bullet.split() else ""
        has_verb.append(first_word in ACTION_VERBS)
        has_metric.append(
            bool(metric_pattern.search(bullet)) or bool(re.search(r"\b\d{2,}\b", bullet))
        )

    action_ratio = sum(has_verb) / len(bullets)
    metric_ratio = sum(has_metric) / len(bullets)
    score = _clamp(action_ratio * 40 + metric_ratio * 40 + 20)

    return {
        "action_verb_ratio": round(action_ratio, 2),
        "metric_ratio": round(metric_ratio, 2),
        "score": score,
        "bullets_without_verb": [b for b, v in zip(bullets, has_verb) if not v][:5],
        "bullets_without_metric": [b for b, m in zip(bullets, has_metric) if not m][:5],
    }


def _keyword_overlap(source_keywords: List[str], resume_text: str) -> Dict:
    """Compute overlap between a keyword list and resume text."""
    normalized = _normalize(resume_text)
    matched = [kw for kw in source_keywords if kw.lower() in normalized]
    missing = [kw for kw in source_keywords if kw.lower() not in normalized]
    return {
        "matched": matched,
        "missing": missing,
        "score": _clamp(len(matched) / max(1, len(source_keywords)) * 100),
    }


def _compute_final_score(
    structure_score: int,
    completeness_score: int,
    relevance_score: int,
    impact_score: int,
    has_jd: bool,
) -> int:
    """
    Apply JD-conditional weights.
    Without JD: Structure 20% / Completeness 15% / Relevance 30% / Impact 35%
    With JD:    Structure 15% / Completeness 10% / Relevance 40% / Impact 35%
    """
    if has_jd:
        w = {"s": 0.15, "c": 0.10, "r": 0.40, "i": 0.35}
    else:
        w = {"s": 0.20, "c": 0.15, "r": 0.30, "i": 0.35}
    return _clamp(
        structure_score * w["s"]
        + completeness_score * w["c"]
        + relevance_score * w["r"]
        + impact_score * w["i"]
    )


# ─── Agent 1: Structure & Completeness ───────────────────────────────────────

def structure_completeness_agent(state: ResumeState) -> ResumeState:
    """
    Dimension 1 (Structure & Formatting) + Dimension 2 (Section Completeness).
    Deterministic scoring first; LLM adds nuanced structure observations only.
    """
    messages = state.get("messages", [])
    completed = state.get("completed_steps", [])

    resume_text = state.get("resume_text", "")
    resume_sections = state.get("resume_sections", {})
    role_type = state.get("role_type") or ""
    archetype = _get_archetype(role_type)
    resume_context = _build_resume_context(resume_sections)

    struct_result = _score_structure_formatting(resume_text)
    comp_result = _score_section_completeness(resume_sections, role_type)

    # Minimal LLM call - only get top 3 critical issues
    prompt = f"""List the top 3 critical structure issues for this {archetype["label"]} resume as brief strings.

Resume:
{_truncate(resume_context, 2000)}

Return: {{"issues": ["issue 1", "issue 2", "issue 3"]}}"""

    llm_result = _llm_json(prompt, max_tokens=200)
    llm_issues = [{"issue": issue} for issue in llm_result.get("issues", [])[:3]]
    all_structure_issues = struct_result["issues"] + llm_issues

    messages.append(
        f"Agent 1 — Structure: {struct_result['score']}/100 | Completeness: {comp_result['score']}/100"
    )
    completed.append("structure_completeness")

    return {
        **state,
        "structure_score": struct_result["score"],
        "completeness_score": comp_result["score"],
        "structure_suggestions": all_structure_issues,  # Minimal: [{"issue": "..."}]
        "completed_steps": completed,
        "messages": messages,
        "_status": "processing",
    }


# ─── Agent 2: Relevance & Keyword Alignment ──────────────────────────────────

def relevance_agent(state: ResumeState) -> ResumeState:
    """
    Dimension 3 — Keyword & Relevance Alignment.
    Mode A (JD provided): exact gap table against JD language.
    Mode B (no JD): role-archetype baseline, clearly labelled as general.
    """
    messages = state.get("messages", [])
    completed = state.get("completed_steps", [])

    resume_text = state.get("resume_text", "")
    resume_sections = state.get("resume_sections", {})
    job_description = state.get("job_description", "")
    role_type = state.get("role_type") or ""
    archetype = _get_archetype(role_type)

    has_jd = bool(job_description and len(job_description.strip()) > 50)
    resume_context = _build_resume_context(resume_sections, max_chars=7000)

    if has_jd:
        jd_kws = _extract_keywords(job_description, limit=40)
        overlap = _keyword_overlap(jd_kws, resume_text)
        relevance_score = overlap["score"]
        critical_gaps = overlap["missing"][:10]  # Top 10 missing JD keywords
    else:
        archetype_kws = archetype["keywords"]
        overlap = _keyword_overlap(archetype_kws, resume_text)
        relevance_score = overlap["score"]
        critical_gaps = overlap["missing"][:10]  # Top 10 missing archetype keywords

    messages.append(
        f"Agent 2 — Relevance: {relevance_score}/100 | has_jd={has_jd}"
    )
    completed.append("relevance")

    return {
        **state,
        "relevance_score": relevance_score,
        "critical_gaps": critical_gaps,  # Used by profile_update as skill_gaps
        "has_job_description": has_jd,
        "completed_steps": completed,
        "messages": messages,
        "_status": "processing",
    }


# ─── Agent 3: Impact & Specificity Advisor ───────────────────────────────────

def impact_advisor_agent(state: ResumeState) -> ResumeState:
    """
    Dimension 4 — Impact & Specificity + Redundancy & Noise.
    Hybrid: deterministic verb/metric ratio + LLM vague-claim detection.
    Computes the final weighted score and zone label.
    """
    messages = state.get("messages", [])
    completed = state.get("completed_steps", [])

    resume_text = state.get("resume_text", "")
    resume_sections = state.get("resume_sections", {})
    role_type = state.get("role_type") or ""
    has_jd = state.get("has_job_description", False)
    structure_score = state.get("structure_score", 70)
    completeness_score = state.get("completeness_score", 70)
    relevance_score = state.get("relevance_score", 70)
    archetype = _get_archetype(role_type)

    resume_context = _build_resume_context(resume_sections, max_chars=7000)
    bullets = _extract_bullets(resume_text)
    impact_det = _score_impact_deterministic(bullets)
    
    # Use deterministic scoring only - no expensive LLM call
    clarity = 0.5  # Default middle score
    impact_score = _clamp(
        impact_det["action_verb_ratio"] * 40
        + impact_det["metric_ratio"] * 40
        + clarity * 20
    )

    overall_score = _compute_final_score(
        structure_score=structure_score,
        completeness_score=completeness_score,
        relevance_score=relevance_score,
        impact_score=impact_score,
        has_jd=has_jd,
    )
    zone = _score_zone(overall_score)

    messages.append(
        f"Agent 3 — Impact: {impact_score}/100 | Overall: {overall_score}/100 | Zone: '{zone}'"
    )
    completed.append("impact_advice")

    return {
        **state,
        "impact_score": impact_score,
        "ats_score": overall_score,
        "score_zone": zone,
        "completed_steps": completed,
        "messages": messages,
        "_status": "completed",
    }

