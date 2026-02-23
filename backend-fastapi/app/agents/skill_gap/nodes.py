"""
Nodes for the skill gap analyzer agent.
Implements individual steps in the skill gap analysis workflow.
Uses LLM-based extraction and matching instead of hardcoded regex + TF-IDF.
"""

import re
import json
import os
import logging
from dotenv import load_dotenv
from .state import SkillGapState, CareerMatch
from app.agents.llm_config import GROQ_CLIENT as client, GROQ_SKILLGAP_MODEL

# Setup logging
logger = logging.getLogger(__name__)

load_dotenv()

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
    skills_lower = {s.lower() for s in user_skills}
    results = []
    for stack_name, stack_techs in TECH_STACKS.items():
        matched = [t for t in stack_techs if t.lower() in skills_lower]
        if matched:
            results.append({
                "stack": stack_name,
                "matched": matched,
                "confidence": round(len(matched) / len(stack_techs), 2),
            })
    results.sort(key=lambda x: x["confidence"], reverse=True)
    return results


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
        all_stack_techs_lower.update(t.lower() for t in techs)

    # Selected stack's techs (lowercase)
    selected_lower = {t.lower() for t in TECH_STACKS.get(stack, [])}

    filtered = []
    for skill in career_skills:
        sl = skill.lower()
        if sl not in all_stack_techs_lower:
            # Universal / stack-agnostic -> always include
            filtered.append(skill)
        elif sl in selected_lower:
            # Belongs to the selected stack -> include
            filtered.append(skill)
        # else: belongs to another stack -> exclude
    return filtered


def extract_skills_from_resume(
    skills_text: str | None = None,
    projects_text: str | None = None,
    resume_text: str | None = None,
) -> list[str]:
    """
    Extract skills using the dedicated skills section and project tech-stacks.

    Priority:
      1. ``skills_text`` + ``projects_text`` (structured sections from resume)
      2. Falls back to ``resume_text`` only when sections are unavailable.

    Falls back to regex matching against CAREER_CLUSTERS if the LLM call fails.
    """
    # Build a focused input for the LLM
    if skills_text or projects_text:
        input_block = ""
        if skills_text:
            input_block += f"=== SKILLS SECTION ===\n{skills_text}\n\n"
        if projects_text:
            input_block += f"=== PROJECTS SECTION ===\n{projects_text}\n"
    elif resume_text:
        input_block = resume_text[:6000]
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
            "- Keep each item short (one skill per entry, no descriptions).\n\n"
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
            # Deduplicate while preserving order
            seen: set[str] = set()
            unique: list[str] = []
            for s in skills:
                if isinstance(s, str) and s.strip():
                    key = s.strip().lower()
                    if key not in seen:
                        seen.add(key)
                        unique.append(s.strip())
            logger.info(f"LLM extracted {len(unique)} skills from resume")
            return unique

    except Exception as e:
        logger.warning(f"LLM skill extraction failed, falling back to regex: {e}")

    # ── Fallback: regex matching against CAREER_CLUSTERS ──
    fallback_text = skills_text or projects_text or resume_text or ""
    return _regex_extract_skills(fallback_text)


def _regex_extract_skills(resume_text: str) -> list[str]:
    """Fallback regex-based skill extraction using CAREER_CLUSTERS."""
    resume_lower = resume_text.lower()
    found_skills: set[str] = set()

    all_skills: set[str] = set()
    for cluster_data in CAREER_CLUSTERS.values():
        all_skills.update(cluster_data["skills"])

    for skill in all_skills:
        pattern = r"(?<![a-zA-Z])" + re.escape(skill.lower()) + r"(?![a-zA-Z])"
        if re.search(pattern, resume_lower):
            found_skills.add(skill)

    return list(found_skills)


def _build_career_reference() -> str:
    """Build a compact text summary of CAREER_CLUSTERS for the LLM prompt."""
    lines = []
    for career, data in CAREER_CLUSTERS.items():
        skills_str = ", ".join(data["skills"])
        lines.append(f"- {career}: {skills_str}")
    return "\n".join(lines)


def extract_skills_node(state: SkillGapState) -> SkillGapState:
    """
    Node: Extract skills from the skills section + project stack.
    Falls back to full resume text when sections aren't available.
    """
    try:
        user_skills = extract_skills_from_resume(
            skills_text=state.get("skills_text"),
            projects_text=state.get("projects_text"),
            resume_text=state.get("resume_text"),
        )
        logger.info(f"Extracted {len(user_skills)} skills from resume")

        return {
            **state,
            "user_skills": user_skills,
            "total_skills_found": len(user_skills),
        }
    except Exception as e:
        logger.error(f"Error extracting skills: {str(e)}")
        return {
            **state,
            "error": f"Error extracting skills: {str(e)}",
            "user_skills": [],
            "total_skills_found": 0,
        }


def calculate_career_probabilities_node(state: SkillGapState) -> SkillGapState:
    """
    Node: Use the LLM to score how well the user's skills match each career.
    Falls back to simple set-intersection scoring if the LLM call fails.
    """
    try:
        user_skills = state.get("user_skills", [])
        resume_text = state["resume_text"]

        logger.info(
            f"Calculating career probabilities via LLM for {len(user_skills)} skills"
        )

        career_ref = _build_career_reference()

        prompt = f"""You are an expert career analyst.

The user has these skills (extracted from their resume):
{json.dumps(user_skills)}

Here are the career paths and the skills typically required for each:
{career_ref}

For EACH career path listed above, evaluate how well the user's skills fit.
Consider:
- Direct skill matches (user has the exact skill)
- Transferable / related skills (e.g. "FastAPI" implies "REST API" knowledge)
- Overall profile coherence with the career

Return ONLY valid JSON — an array of objects, one per career, with these fields:
{{
  "career": "<career name>",
  "probability": <0-100 float, overall match percentage>,
  "matched_skills": [<skills the user already has that are relevant>],
  "missing_skills": [<top 10 most important skills the user is missing>]
}}

Sort by probability descending.  No extra text, just the JSON array."""

        completion = client.chat.completions.create(
            model=GROQ_SKILLGAP_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a career-matching engine. Respond ONLY with a "
                        "JSON array. No markdown, no commentary."
                    ),
                },
                {"role": "user", "content": prompt},
            ],
            temperature=0.0,
        )

        raw = (completion.choices[0].message.content or "").strip()
        if not raw:
            raise ValueError("LLM returned empty response")
        if raw.startswith("```"):
            raw = re.sub(r"^```(?:json)?\s*", "", raw)
            raw = re.sub(r"\s*```$", "", raw)

        llm_matches = json.loads(raw)

        if not isinstance(llm_matches, list) or len(llm_matches) == 0:
            raise ValueError("LLM returned empty or non-list response")

        career_matches: list[CareerMatch] = []
        for m in llm_matches:
            matched = m.get("matched_skills", [])
            missing = m.get("missing_skills", [])[:10]
            career_name = m.get("career", "Unknown")
            cluster = CAREER_CLUSTERS.get(career_name, {})
            total_req = len(cluster.get("skills", [])) if cluster else (
                len(matched) + len(missing)
            )
            prob = float(m.get("probability", 0))

            career_matches.append({
                "career": career_name,
                "probability": round(prob, 2),
                "skill_match_percentage": round(
                    (len(matched) / total_req * 100) if total_req else 0, 2
                ),
                "semantic_match_percentage": 0.0,  # not used in LLM path
                "matched_skills": matched,
                "missing_skills": missing,
                "total_required_skills": total_req,
                "matched_skills_count": len(matched),
            })

        career_matches.sort(key=lambda x: x["probability"], reverse=True)
        logger.info(
            f"LLM career match — top: {career_matches[0]['career']} "
            f"({career_matches[0]['probability']}%)"
        )

        return {
            **state,
            "career_matches": career_matches,
            "top_3_careers": career_matches[:3],
        }

    except Exception as e:
        logger.warning(f"LLM career matching failed, falling back: {e}")
        return _fallback_career_probabilities(state)


def _fallback_career_probabilities(state: SkillGapState) -> SkillGapState:
    """Fallback: simple set-intersection scoring when the LLM call fails."""
    user_skills = state.get("user_skills", [])
    user_lower = {s.lower() for s in user_skills}
    career_matches: list[CareerMatch] = []

    for career_name, cluster_data in CAREER_CLUSTERS.items():
        career_skills = cluster_data["skills"]
        career_lower = {s.lower() for s in career_skills}

        matched = [s for s in career_skills if s.lower() in user_lower]
        missing = [s for s in career_skills if s.lower() not in user_lower][:10]
        pct = (len(matched) / len(career_lower) * 100) if career_lower else 0

        career_matches.append({
            "career": career_name,
            "probability": round(pct, 2),
            "skill_match_percentage": round(pct, 2),
            "semantic_match_percentage": 0.0,
            "matched_skills": matched,
            "missing_skills": missing,
            "total_required_skills": len(career_skills),
            "matched_skills_count": len(matched),
        })

    career_matches.sort(key=lambda x: x["probability"], reverse=True)
    return {
        **state,
        "career_matches": career_matches,
        "top_3_careers": career_matches[:3],
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
        
        prompt = f"""Based on this resume analysis:

User's Current Skills: {', '.join(user_skills) if user_skills else 'No explicit skills detected'}

Top Career Matches:
{careers_summary}

Provide:
1. Detailed explanation of why these careers match the user's profile
2. Recommended learning path for the top career (specific courses, certifications, projects)
3. Timeline to become job-ready for the top career
4. Actionable next steps

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
