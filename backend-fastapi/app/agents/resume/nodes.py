# app/agents/resume/nodes.py
"""
Simplified 3-Agent Resume Module
- Agent 1: Resume Analyzer (ATS + structure)
- Agent 2: Skill Intelligence (validation + gaps + levels in ONE call)
- Agent 3: Optimization Advisor (honest suggestions + learning path)
"""
from langchain_core.messages import HumanMessage, SystemMessage
import json
import re

from app.agents.resume.state import ResumeState
from app.agents.llm_config import RESUME_LLM
from app.services.ats_checker import get_ats_score

# Use module-specific LLM from config
llm = RESUME_LLM


# =====================================
# AGENT 1: RESUME ANALYZER
# Combines: ATS scoring + structure analysis
# =====================================

def resume_analyzer_agent(state: ResumeState) -> ResumeState:
    """
    Agent 1: Analyzes ATS compatibility AND identifies structure issues.
    Single agent that does both tasks (no need for separate structure_fixer).
    """
    messages = state.get("messages", [])
    messages.append("Resume Analyzer: Starting ATS analysis...")

    # Get ATS score using existing service
    ats_result = get_ats_score(
        state["resume_text"],
        state.get("resume_sections", {}),
        state["job_description"]
    )
    #hello hello
    ats_score = ats_result["overall_score"]
    components = ats_result["component_scores"]
    
    messages.append(f"Resume Analyzer: ATS Score = {ats_score}/100")
    
    # If ATS < 60, generate structure suggestions using LLM
    structure_suggestions = []
    needs_template = False
    
    if ats_score < 60:
        messages.append("Resume Analyzer: Low ATS score - analyzing structure issues...")
        needs_template = True
        
        prompt = f"""You are an ATS optimization expert.

ATS Scores:
- Structure: {components.get('structure_score', 0)}/100
- Keywords: {components.get('keyword_score', 0)}/100
- Content: {components.get('content_score', 0)}/100
- Formatting: {components.get('formatting_score', 0)}/100

Resume Sections Found:
{chr(10).join([f"- {k}" for k in state['resume_sections'].keys() if state['resume_sections'][k].strip()])}

Provide exactly 3 critical structural fixes to improve ATS score.
Focus on the LOWEST scoring components.

Format:
1. [Issue] - [Solution]
2. [Issue] - [Solution]
3. [Issue] - [Solution]

Be specific and actionable."""

        try:
            response = llm.invoke([
                SystemMessage(content="You are an ATS resume structure expert. Provide exactly 3 fixes."),
                HumanMessage(content=prompt)
            ])
            
            # Parse numbered list
            for line in response.content.split('\n'):
                line = line.strip()
                if line and len(line) > 3 and line[0].isdigit() and line[1] in '.):':
                    structure_suggestions.append(line[2:].strip())
            
            if not structure_suggestions:
                structure_suggestions = ["Use a clean, ATS-friendly template", "Add clear section headers", "Quantify achievements"]
                
            messages.append(f"Resume Analyzer: Generated {len(structure_suggestions)} structure fixes")
            
        except Exception as e:
            messages.append(f"Resume Analyzer: Error generating suggestions - {str(e)}")
            structure_suggestions = ["Consider using an ATS-optimized template"]

    completed = state.get("completed_steps", [])
    completed.append("analyze_resume")

    return {
        **state,
        "ats_score": ats_score,
        "ats_components": components,
        "ats_justification": ats_result["justification"],
        "structure_suggestions": structure_suggestions,
        "needs_template": needs_template,
        "completed_steps": completed,
        "messages": messages
    }


# =====================================
# AGENT 2: SKILL INTELLIGENCE
# Combines: skill validation + gap analysis + level assessment
# =====================================

def skill_intelligence_agent(state: ResumeState) -> ResumeState:
    """
    Agent 2: THE BIG ONE - does validation, gaps, and levels in ONE LLM call.
    This is the heart of honest skill assessment.
    """
    messages = state.get("messages", [])
    messages.append("Skill Intelligence: Analyzing skills with evidence...")

    resume_text = state["resume_text"]
    jd_text = state["job_description"]

    prompt = f"""You are an expert technical recruiter performing honest skill assessment.

RESUME:
{resume_text[:2500]}

JOB DESCRIPTION:
{jd_text[:1200]}

Your task: For EVERY skill/technology mentioned in the JD, determine:
1. **Status**: Does candidate have it?
   - "confirmed": Explicitly mentioned AND used in projects with evidence
   - "transferable": Similar/related skill present (e.g., has Heroku, JD wants AWS)
   - "missing": No evidence whatsoever

2. **Proficiency Levels** (0-3):
   - 0: No knowledge
   - 1: Basic (can use with guidance, 0-1 year)
   - 2: Intermediate (independent work, 1-3 years)
   - 3: Advanced (can teach others, 3+ years)
   
3. **Gap Analysis**:
   - What level does JD require?
   - What level does candidate have?
   - Learning time to bridge gap

Return JSON array (analyze 10-15 key skills from JD):
[
  {{
    "skill": "Python",
    "status": "confirmed",
    "evidence": ["Listed in Skills", "Used in 3 projects", "5 years mentioned"],
    "confidence": 0.95,
    "current_level": 2,
    "required_level": 2,
    "gap": 0,
    "learning_time": "0 months"
  }},
  {{
    "skill": "AWS",
    "status": "transferable",
    "evidence": ["Mentions cloud deployment", "Used Heroku"],
    "confidence": 0.4,
    "current_level": 0,
    "required_level": 2,
    "gap": 2,
    "learning_time": "2-3 months"
  }},
  {{
    "skill": "Kubernetes",
    "status": "missing",
    "evidence": [],
    "confidence": 0.0,
    "current_level": 0,
    "required_level": 1,
    "gap": 1,
    "learning_time": "3-4 weeks"
  }}
]

Be strict: Only mark "confirmed" if there's REAL evidence of use.
"""

    try:
        response = llm.invoke([
            SystemMessage(content="You are a technical recruiter expert. Return ONLY valid JSON array."),
            HumanMessage(content=prompt)
        ])

        # Parse JSON response
        content = response.content.strip()
        
        # Extract JSON array from markdown code blocks or raw response
        json_match = re.search(r'```(?:json)?\s*(\[.*?\])\s*```', content, re.DOTALL)
        if json_match:
            skills_analysis = json.loads(json_match.group(1))
        else:
            json_match = re.search(r'\[.*\]', content, re.DOTALL)
            if json_match:
                skills_analysis = json.loads(json_match.group(0))
            else:
                raise ValueError("No JSON array found")

        # Calculate readiness metrics
        total_skills = len(skills_analysis)
        ready_skills = [s["skill"] for s in skills_analysis if s["gap"] == 0]
        # Show all gaps for now (any gap > 0, regardless of status)
        critical_gaps = [s["skill"] for s in skills_analysis if s["gap"] > 0]
        
        readiness_pct = (len(ready_skills) / total_skills * 100) if total_skills > 0 else 0
        overall_readiness = f"{readiness_pct:.0f}% match"
        
        # Build learning priorities (critical gaps first)
        learning_priorities = []
        for skill in skills_analysis:
            if skill["gap"] > 0:
                priority = "high" if skill["gap"] >= 2 else "medium" if skill["gap"] == 1 else "low"
                learning_priorities.append({
                    "skill": skill["skill"],
                    "gap": skill["gap"],
                    "time": skill["learning_time"],
                    "priority": priority
                })
        
        # Sort by gap (biggest first)
        learning_priorities.sort(key=lambda x: x["gap"], reverse=True)

        messages.append(f"Skill Intelligence: {overall_readiness} | Ready: {len(ready_skills)}/{total_skills}")
        messages.append(f"Skill Intelligence: Critical gaps: {len(critical_gaps)}")

    except Exception as e:
        messages.append(f"Skill Intelligence: Error - {str(e)}")
        skills_analysis = []
        overall_readiness = "Unknown"
        ready_skills = []
        critical_gaps = []
        learning_priorities = []

    completed = state.get("completed_steps", [])
    completed.append("analyze_skills")

    return {
        **state,
        "skills_analysis": skills_analysis,
        "overall_readiness": overall_readiness,
        "ready_skills": ready_skills,
        "critical_gaps": critical_gaps,
        "learning_priorities": learning_priorities,
        "completed_steps": completed,
        "messages": messages
    }


# =====================================
# AGENT 3: OPTIMIZATION ADVISOR
# Generates honest improvements + learning roadmap
# =====================================

def optimization_advisor_agent(state: ResumeState) -> ResumeState:
    """
    Agent 3: Creates honest resume improvements and learning roadmap.
    Only suggests changes based on confirmed/transferable skills.
    """
    messages = state.get("messages", [])
    messages.append("Optimization Advisor: Generating honest suggestions...")

    skills_analysis = state.get("skills_analysis", [])
    ats_score = state.get("ats_score", 0)
    jd_text = state["job_description"]

    # Separate skills by status
    confirmed = [s for s in skills_analysis if s["status"] == "confirmed"]
    transferable = [s for s in skills_analysis if s["status"] == "transferable"]
    missing = [s for s in skills_analysis if s["status"] == "missing"]
    ready_skills = state.get("ready_skills", [])

    # Build context for LLM
    confirmed_summary = "\n".join([f"- {s['skill']}: {', '.join(s['evidence'][:2])}" for s in confirmed])
    transferable_summary = "\n".join([f"- {s['skill']}: {', '.join(s['evidence'][:2])}" for s in transferable])
    missing_summary = ", ".join([s['skill'] for s in missing])

    prompt = f"""You are an ethical resume coach. Help candidates present ACTUAL skills honestly.

CONFIRMED SKILLS (they really have):
{confirmed_summary}

TRANSFERABLE SKILLS (related experience):
{transferable_summary}

MISSING SKILLS (DON'T suggest adding these):
{missing_summary}

JOB DESCRIPTION:
{jd_text[:800]}

Provide exactly 5 honest resume improvements:
- 3 suggestions: How to HIGHLIGHT/QUANTIFY confirmed skills
- 2 suggestions: How to REFRAME transferable skills honestly

RULES:
DO: "Move Python to top of Skills", "Quantify database size in project"
DO: "Reframe 'deployed app' as 'cloud deployment experience' (honest stretch)"
DON'T: "Add AWS to skills" (if missing)
DON'T: "Mention Kubernetes" (if missing)

Format (exactly 5 items):
1. [Honest suggestion for confirmed skill]
2. [Honest suggestion for confirmed skill]
3. [Honest suggestion for confirmed skill]
4. [Honest reframing for transferable skill]
5. [Honest reframing for transferable skill]

Be direct, actionable, ETHICAL. Never fabricate experience."""

    try:
        response = llm.invoke([
            SystemMessage(content="You are an ethical career coach. Never suggest fabricating experience."),
            HumanMessage(content=prompt)
        ])

        # Parse suggestions
        honest_improvements = []
        for line in response.content.split('\n'):
            line = line.strip()
            if line and len(line) > 3 and line[0].isdigit() and line[1] in '.):':
                honest_improvements.append(line[2:].strip())

        if len(honest_improvements) < 3:
            honest_improvements = [
                "Highlight your strongest technical skills at the top of your Skills section",
                "Add specific metrics to your project descriptions (users, data size, performance gains)",
                "Use action verbs for your achievements (Built, Optimized, Reduced, Increased)"
            ]

        messages.append(f"Optimization Advisor: Generated {len(honest_improvements)} suggestions")

    except Exception as e:
        messages.append(f"Optimization Advisor: Error - {str(e)}")
        honest_improvements = ["Unable to generate suggestions"]

    # Generate learning roadmap from priorities
    learning_priorities = state.get("learning_priorities", [])
    learning_roadmap = []
    
    for item in learning_priorities[:5]:  # Top 5 priorities
        learning_roadmap.append({
            "skill": item["skill"],
            "priority": item["priority"],
            "time_estimate": item["time"],
            "recommendation": f"Focus on {item['skill']} ({item['priority']} priority) - {item['time']}"
        })

    # Calculate job readiness projection
    current_readiness = int(state.get("overall_readiness", "0%").replace("%", "").split()[0])
    total_learning_months = sum([
        3 if "month" in p["time"] and "2-3" in p["time"] else
        1 if "week" in p["time"] else 0
        for p in learning_priorities[:5]
    ])
    
    projected_readiness = min(95, current_readiness + (len(learning_priorities[:5]) * 8))
    job_readiness_estimate = f"{current_readiness}% now → {projected_readiness}% in {total_learning_months} months"

    messages.append(f"Optimization Advisor: Learning roadmap ready ({len(learning_roadmap)} priorities)")

    completed = state.get("completed_steps", [])
    completed.append("generate_advice")

    return {
        **state,
        "honest_improvements": honest_improvements,
        "learning_roadmap": learning_roadmap,
        "job_readiness_estimate": job_readiness_estimate,
        "completed_steps": completed,
        "messages": messages
    }
# hello hello