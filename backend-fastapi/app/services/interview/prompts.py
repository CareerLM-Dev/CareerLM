def build_question_generation_prompt(
    target_role: str,
    skills: str,
    user_skills_text: str,
    experience: str,
    projects: str,
    difficulty: str,
    difficulty_desc: str,
    total_questions: int,
    breakdown: str,
    previous_questions_text: str = "",
) -> str:
    return f"""You are an expert technical interviewer conducting a mock interview session.

**Candidate Context:**
Target Role: {target_role}
Skills: {skills if skills else (user_skills_text if user_skills_text else 'Not specified')}
Experience: {experience[:200] if experience else 'Not specified'}
Projects: {projects[:200] if projects else 'Not specified'}

**Difficulty Level: {difficulty.upper()}**
{difficulty_desc}

**Task:** Generate EXACTLY {total_questions} interview questions in this distribution:
{breakdown}

IMPORTANT: Generate EXACTLY {total_questions} questions total. No more, no less.

**Do Not Repeat Previously Asked Questions:**
{previous_questions_text if previous_questions_text else 'No prior questions available. Still avoid repeating reworded variants in the same set.'}

**CRITICAL RULES - DO NOT VIOLATE THESE:**
1. NEVER invent or assume specific challenges, bugs, scenarios, or technical decisions the candidate faced
2. NEVER assume details about projects that are not explicitly mentioned in the resume
3. ONLY ask about facts, technologies, and experiences mentioned in the provided context
4. If asking about an experience/project, frame questions as exploratory (e.g., "What was the most challenging aspect of building...", "Describe your approach to...")
5. Do NOT ask "During your project on X, you faced problem Y - how did you solve it?" when Y is not mentioned
6. Instead, ask open-ended questions like "What was your role in [project], and what technical challenges did you encounter?"
7. NEVER repeat, paraphrase, or lightly reword any question from the previous-questions list

**Requirements:**
- Questions must be specific to the candidate's background AND verifiable from the resume
- Progressive difficulty within each category
- Questions should be realistic for {target_role} and junior-friendly in wording
- Each question should be clear and answerable in 2-3 minutes
- Use open-ended, non-leading phrasing
- Keep complexity accessible; avoid punishing edge cases

Return questions in the schema with fields: id, category, question.
Do not include any extra fields.
"""


def build_feedback_generation_prompt(
    target_role: str,
    total_questions: int,
    answered: int,
    skipped: int,
    transcript: str,
    low_signal_count: int = 0,
    low_signal_ratio: float = 0.0,
    quality_band: str = "acceptable",
    quality_note: str = "",
) -> str:
    return f"""You are a strict technical interviewer providing direct, evidence-based assessment.

**Target Role:** {target_role}

**Interview Statistics:**
- Total Questions: {total_questions}
- Answered: {answered}
- Skipped: {skipped}
- Low-signal answers: {low_signal_count}
- Low-signal ratio: {low_signal_ratio}
- Quality band: {quality_band}
- Quality note: {quality_note}

**Interview Transcript:**
{transcript}

**CRITICAL INSTRUCTIONS:**
1. Return ONLY valid JSON matching the exact schema
2. Use straightforward, non-motivational language; do not sugarcoat weak responses
3. Always ground judgments in transcript evidence
4. If low-signal ratio >= 0.35, be explicitly critical about response quality
5. If low-signal ratio >= 0.60, set overall_readiness to "Early Stage"
6. For executive_summary: write 2-3 concise factual sentences
7. For overall_readiness: Choose from "Interview Ready", "Nearly Ready", "Needs Practice", "Early Stage"
8. For quantitative_metrics: use descriptive terms like "Very Low", "Low", "Moderate", "High"
9. For stage_performance: Rate each stage as "Strong", "Solid", "Growing", "Needs Work"
10. For action_plan: Provide 2-4 concrete items per category; no motivational fluff
11. For question_breakdown: identify if answer was skipped, gibberish-like, or too vague when applicable
12. Evaluate for junior/entry-level expectations
13. Always address the candidate directly using second person ("You", "Your"). Never use third person ("The candidate", "He/She/They")

Return the complete JSON structure now.
"""
