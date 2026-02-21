# app/agents/interview/generator.py
"""
Mock Interview Question Generator
Uses Groq Llama-3 to generate structured interview questions
"""
import json
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_groq import ChatGroq
import os
from dotenv import load_dotenv

load_dotenv()

# Initialize Interview LLM
INTERVIEW_LLM = ChatGroq(
    api_key=os.getenv("GROQ_API_KEY"),
    model="llama-3.1-8b-instant",
    temperature=0.8
)


def generate_interview_questions(
    resume_text: str,
    resume_sections: dict,
    target_role: str,
    difficulty: str = "medium",
    user_skills: list = None
) -> dict:
    """
    Generate structured interview questions based on user context and difficulty.
    
    Question count by difficulty:
    - Easy: 5 questions total (2 Resume, 2 Project, 1 Technical)
    - Medium: 10 questions total (2 Resume, 3 Project, 3 Technical, 1 System Design, 1 Behavioral)
    - Hard: 15 questions total (3 Resume, 4 Project, 4 Technical, 2 System Design, 2 Behavioral)
    
    Args:
        resume_text: Full resume text
        resume_sections: Parsed sections dict
        target_role: Target job role
        difficulty: Difficulty level (easy/medium/hard)
        user_skills: List of user's skills
        
    Returns:
        dict with questions array
    """
    
    # Extract key context
    experience = resume_sections.get("experience", "")[:500]
    projects = resume_sections.get("projects", "")[:500]
    skills = resume_sections.get("skills", "")[:300]
    education = resume_sections.get("education", "")[:300]
    
    # Define difficulty descriptions
    difficulty_guidance = {
        "easy": "Focus on fundamental concepts, basic terminology, and straightforward scenarios. Questions should be answerable by entry-level candidates.",
        "medium": "Mix of fundamental and intermediate concepts. Include some problem-solving scenarios and practical applications. Suitable for mid-level candidates.",
        "hard": "Advanced concepts, complex scenarios, optimization problems, and deep technical knowledge. Challenge the candidate with edge cases and architectural decisions."
    }
    
    difficulty_desc = difficulty_guidance.get(difficulty.lower(), difficulty_guidance["medium"])
    
    # Define question distribution based on difficulty
    distributions = {
        "easy": {
            "total": 5,
            "breakdown": "2 Resume Validation, 2 Project Deep Dive, 1 Core Technical"
        },
        "medium": {
            "total": 10,
            "breakdown": "2 Resume Validation, 3 Project Deep Dive, 3 Core Technical, 1 System Design, 1 Behavioral"
        },
        "hard": {
            "total": 15,
            "breakdown": "3 Resume Validation, 4 Project Deep Dive, 4 Core Technical, 2 System Design, 2 Behavioral"
        }
    }
    
    dist = distributions.get(difficulty.lower(), distributions["medium"])
    
    prompt = f"""You are an expert technical interviewer conducting a mock interview session.

**Candidate Context:**
Target Role: {target_role}
Skills: {skills if skills else (', '.join(user_skills) if user_skills else 'Not specified')}
Experience: {experience[:200] if experience else 'Not specified'}
Projects: {projects[:200] if projects else 'Not specified'}

**Difficulty Level: {difficulty.upper()}**
{difficulty_desc}

**Task:** Generate EXACTLY {dist['total']} interview questions in this EXACT distribution:
{dist['breakdown']}

IMPORTANT: Generate EXACTLY {dist['total']} questions total. No more, no less.

**Requirements:**
- Questions must be specific to the candidate's background
- Progressive difficulty within each category
- Questions should be realistic for {target_role}
- Each question should be clear and answerable in 2-3 minutes

**Output Format (JSON ONLY):**
{{
  "questions": [
    {{
      "id": 1,
      "category": "Resume Validation",
      "question": "Your actual question here?",
      "follow_up_hint": "Brief hint for deeper probing"
    }},
    ...continue for all 15 questions...
  ]
}}

Return ONLY valid JSON. No markdown formatting, no explanation."""

    try:
        response = INTERVIEW_LLM.invoke([
            SystemMessage(content="You are a JSON-only interview question generator. Return valid JSON only."),
            HumanMessage(content=prompt)
        ])
        
        content = response.content.strip()
        
        # Clean up potential markdown formatting
        if content.startswith("```json"):
            content = content[7:]
        if content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]
        
        content = content.strip()
        
        # Parse JSON
        result = json.loads(content)
        
        # Validate structure
        if "questions" not in result:
            raise ValueError("Invalid response: missing 'questions' key")
        
        # Determine expected count based on difficulty
        expected_counts = {"easy": 5, "medium": 10, "hard": 15}
        expected = expected_counts.get(difficulty.lower(), 10)
        
        # Ensure we have the right number of questions (truncate if more, error if less)
        if len(result["questions"]) < expected:
            raise ValueError(f"Expected at least {expected} questions, got {len(result['questions'])}")
        
        if len(result["questions"]) > expected:
            # Truncate to expected count
            result["questions"] = result["questions"][:expected]
        
        return result
        
    except json.JSONDecodeError as e:
        raise ValueError(f"Failed to parse LLM response as JSON: {str(e)}")
    except Exception as e:
        raise RuntimeError(f"Question generation failed: {str(e)}")


def generate_feedback_report(
    questions: list,
    answers: list,
    target_role: str,
    resume_text: str
) -> str:
    """
    Generate markdown feedback report based on interview transcript.
    
    Args:
        questions: List of question dicts
        answers: List of answer texts (same order as questions)
        target_role: Target job role
        resume_text: Original resume text for context
        
    Returns:
        Markdown formatted feedback report
    """
    
    # Build transcript and calculate metrics
    transcript = ""
    answered = 0
    skipped = 0
    
    for i, (q, a) in enumerate(zip(questions, answers), 1):
        transcript += f"\n**Q{i} [{q['category']}]:** {q['question']}\n"
        if a.strip() and a != "[Skipped]":
            transcript += f"**A{i}:** {a}\n"
            answered += 1
        else:
            transcript += f"**A{i}:** [Skipped]\n"
            skipped += 1
    
    total_questions = len(questions)
    
    prompt = f"""You are an expert technical interviewer providing feedback on a mock interview.

**Target Role:** {target_role}
**Interview Statistics:**
- Total Questions: {total_questions}
- Answered: {answered}
- Skipped: {skipped}

**Interview Transcript:**
{transcript}

**Task:** Analyze the candidate's performance and generate a detailed feedback report WITH METRICS.

**Report Structure (Markdown):**

# Mock Interview Feedback Report

## Interview Metrics
- **Total Questions:** {total_questions}
- **Questions Answered:** {answered}/{total_questions}
- **Questions Skipped:** {skipped}/{total_questions}
- **Answer Quality Score:** [Give 0-100 score based on depth, accuracy, and clarity]
- **Technical Competency:** [Strong/Moderate/Weak]
- **Communication Skills:** [Strong/Moderate/Weak]

## Overall Assessment
[2-3 sentences summarizing overall performance]

## Strengths
- [Specific strength 1 with example from transcript]
- [Specific strength 2 with example from transcript]
- [Specific strength 3 with example from transcript]

## Areas for Improvement
- **[Weakness 1 Title]**: [Detailed explanation with examples]
- **[Weakness 2 Title]**: [Detailed explanation with examples]
- **[Weakness 3 Title]**: [Detailed explanation with examples]

## Category Breakdown

### Resume Validation
**Performance Grade:** [Strong / Moderate / Weak]
**Questions:** [X answered, Y skipped]
[Analysis of responses]

### Project Deep Dive
**Performance Grade:** [Strong / Moderate / Weak]
**Questions:** [X answered, Y skipped]
[Analysis of responses]

### Core Technical
**Performance Grade:** [Strong / Moderate / Weak]
**Questions:** [X answered, Y skipped]
[Analysis of responses]

### System Design (if applicable)
**Performance Grade:** [Strong / Moderate / Weak / Not Assessed]
**Questions:** [X answered, Y skipped]
[Analysis of responses]

### Behavioral (if applicable)
**Performance Grade:** [Strong / Moderate / Weak / Not Assessed]
**Questions:** [X answered, Y skipped]
[Analysis of responses]

## Hiring Verdict

### **Recommendation:** [STRONG HIRE / HIRE / MAYBE / NO HIRE]

### Justification:
[2-3 sentences explaining the verdict based on performance]

**Next Steps:**
- [Actionable recommendation 1]
- [Actionable recommendation 2]
- [Actionable recommendation 3]

---
*Generated by CareerLM Mock Interview AI*

**IMPORTANT**: Use ONLY markdown syntax. Do NOT use HTML tags like <br/>, <strong>, etc. Use markdown formatting:
- Headers: #, ##, ###
- Bold: **text**
- Lists: - item or bullet points
- Line breaks: double newlines

Return ONLY the markdown report. Be honest and constructive."""

    try:
        response = INTERVIEW_LLM.invoke([
            SystemMessage(content="You are an expert interviewer providing constructive feedback. Return PURE MARKDOWN ONLY - no HTML tags."),
            HumanMessage(content=prompt)
        ])
        
        return response.content.strip()
        
    except Exception as e:
        raise RuntimeError(f"Feedback generation failed: {str(e)}")
