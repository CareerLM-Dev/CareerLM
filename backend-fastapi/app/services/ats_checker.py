"""
ATS (Applicant Tracking System) Checker Module

This module provides functionality to analyze resumes for ATS compatibility,
calculating scores based on structure, keywords, content quality, and formatting.
"""

import re
import os
from groq import Groq
from dotenv import load_dotenv

# Load API key from .env
load_dotenv()
client = Groq(api_key=os.getenv("GROQ_API_KEY"))


# Expanded stop words including corporate fluff
STOP_WORDS = {
    # Common English stop words
    'the', 'and', 'for', 'with', 'that', 'this', 'you', 'not', 'are', 'from', 'your',
    'have', 'has', 'had', 'was', 'were', 'will', 'would', 'should', 'could', 'can',
    'our', 'their', 'his', 'her', 'its', 'they', 'them', 'these', 'those', 'been',
    'being', 'did', 'does', 'doing', 'done', 'who', 'what', 'when', 'where', 'why',
    'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'some', 'such',
    'than', 'too', 'very', 'just', 'own', 'into', 'over', 'also', 'only',
    # Corporate/resume fluff words
    'responsibilities', 'responsibility', 'candidate', 'candidates', 'team', 'teams',
    'work', 'working', 'duties', 'duty', 'role', 'roles', 'position', 'positions',
    'company', 'companies', 'organization', 'organizations', 'business', 'businesses',
    'experience', 'experiences', 'required', 'requirements', 'requirement', 'preferred',
    'ability', 'abilities', 'opportunity', 'opportunities', 'seeking', 'looking',
    'environment', 'environments', 'including', 'include', 'includes', 'included',
    'must', 'need', 'needs', 'needed', 'ensure', 'ensuring', 'provide', 'providing',
    'support', 'supporting', 'assist', 'assisting', 'help', 'helping', 'maintain',
    'maintaining', 'knowledge', 'understanding', 'strong', 'excellent', 'good',
    'great', 'best', 'years', 'year', 'months', 'month', 'day', 'days'
}

# Common action verbs for resume content analysis
ACTION_VERBS = {
    'achieved', 'accelerated', 'accomplished', 'administered', 'advanced', 'analyzed',
    'architected', 'assembled', 'assessed', 'attained', 'authored', 'automated',
    'balanced', 'boosted', 'briefed', 'budgeted', 'built', 'calculated', 'captured',
    'centralized', 'chaired', 'championed', 'clarified', 'coached', 'collaborated',
    'communicated', 'compiled', 'completed', 'composed', 'computed', 'conceptualized',
    'conducted', 'consolidated', 'constructed', 'consulted', 'contacted', 'contributed',
    'controlled', 'converted', 'coordinated', 'created', 'customized', 'decreased',
    'defined', 'delegated', 'delivered', 'deployed', 'designed', 'detected', 'determined',
    'developed', 'devised', 'diagnosed', 'directed', 'discovered', 'dispatched',
    'distributed', 'documented', 'doubled', 'drafted', 'drove', 'earned', 'edited',
    'eliminated', 'enabled', 'enhanced', 'ensured', 'established', 'evaluated',
    'examined', 'executed', 'expanded', 'expedited', 'facilitated', 'fixed', 'formulated',
    'founded', 'gained', 'generated', 'guided', 'handled', 'headed', 'helped',
    'identified', 'implemented', 'improved', 'increased', 'influenced', 'informed',
    'initiated', 'inspected', 'installed', 'instituted', 'instructed', 'integrated',
    'interpreted', 'interviewed', 'introduced', 'invented', 'investigated', 'launched',
    'led', 'leveraged', 'maintained', 'managed', 'marketed', 'maximized', 'measured',
    'mediated', 'modernized', 'modified', 'monitored', 'motivated', 'navigated',
    'negotiated', 'operated', 'optimized', 'orchestrated', 'organized', 'originated',
    'overhauled', 'oversaw', 'performed', 'persuaded', 'pioneered', 'planned',
    'prepared', 'presented', 'processed', 'procured', 'produced', 'programmed',
    'promoted', 'provided', 'publicized', 'published', 'purchased', 'recommended',
    'reconciled', 'recorded', 'recruited', 'redesigned', 'reduced', 'reengineered',
    'referred', 'reformed', 'reinvented', 'released', 'remodeled', 'repaired',
    'replaced', 'reported', 'represented', 'researched', 'resolved', 'restored',
    'restructured', 'retrieved', 'revamped', 'reviewed', 'revised', 'revitalized',
    'saved', 'scheduled', 'screened', 'secured', 'selected', 'separated', 'served',
    'serviced', 'set', 'settled', 'shaped', 'shared', 'showed', 'simplified',
    'simulated', 'solved', 'sorted', 'spearheaded', 'specified', 'standardized',
    'stimulated', 'streamlined', 'strengthened', 'structured', 'studied', 'submitted',
    'summarized', 'supervised', 'supported', 'surpassed', 'surveyed', 'synthesized',
    'systematized', 'tabulated', 'targeted', 'taught', 'tested', 'tracked',
    'trained', 'transformed', 'translated', 'trimmed', 'tripled', 'troubleshot',
    'tutored', 'unified', 'updated', 'upgraded', 'utilized', 'validated',
    'valued', 'verified', 'visualized', 'wrote'
}

# Common adverbs that may precede action verbs
COMMON_ADVERBS = {
    'successfully', 'effectively', 'efficiently', 'directly', 'consistently',
    'proactively', 'independently', 'collaboratively', 'strategically', 'actively',
    'significantly', 'substantially', 'comprehensively', 'thoroughly', 'rapidly',
    'quickly', 'personally', 'professionally', 'regularly', 'frequently'
}


def _extract_tokens(text: str) -> set:
    """
    Extract clean tokens from text, preserving technical terms like C++, Node.js.
    
    Args:
        text: The input text to tokenize.
        
    Returns:
        A set of lowercase tokens.
    """
    # Regex pattern that keeps technical terms like C++, C#, Node.js, .NET
    token_pattern = r'\b[A-Za-z][A-Za-z0-9+#]*(?:\.[A-Za-z0-9+#]+)*\b'
    
    tokens = re.findall(token_pattern, text)
    
    # Also capture standalone versions like "C++" or ".NET"
    special_terms = re.findall(r'\b(?:C\+\+|C#|\.NET|F#)\b', text, re.IGNORECASE)
    
    # Combine and lowercase
    all_tokens = set(token.lower() for token in tokens)
    all_tokens.update(term.lower() for term in special_terms)
    
    # Remove single characters and stop words
    return {t for t in all_tokens if len(t) > 1 and t not in STOP_WORDS}


def calculate_structure_score(sections: dict) -> int:
    """
    Calculate a score based on resume structure and completeness.
    
    Args:
        sections: Dictionary of parsed resume sections.
        
    Returns:
        Structure score (0-100).
    """
    # Essential sections that should exist in a good resume
    essential_sections = ["contact", "experience", "education", "skills"]
    helpful_sections = ["summary", "projects", "certifications", "publications", "awards"]
    
    # Check for presence and content in essential sections
    essential_score = 0
    for section in essential_sections:
        content = sections.get(section, "").strip()
        if content and len(content) > 20:
            essential_score += 25
    
    # Bonus points for helpful sections
    helpful_score = 0
    for section in helpful_sections:
        content = sections.get(section, "").strip()
        if content and len(content) > 20:
            helpful_score += 10
    
    # Normalize scores
    normalized_essential = min(100, essential_score)
    normalized_helpful = min(50, helpful_score)
    
    structure_score = (normalized_essential * 0.7) + (normalized_helpful * 0.3)
    return round(structure_score)


def calculate_keyword_score(resume_text: str, job_description: str) -> int:
    """
    Calculate keyword matching score between resume and job description.
    
    Uses set operations for efficient overlap calculation and improved
    token extraction that preserves technical terms.
    
    Args:
        resume_text: The full resume text.
        job_description: The target job description.
        
    Returns:
        Keyword match score (0-100).
    """
    if not job_description.strip():
        return 75  # Default score if no job description provided
    
    # Extract tokens using improved tokenization
    job_keywords = _extract_tokens(job_description)
    resume_keywords = _extract_tokens(resume_text)
    
    if not job_keywords:
        return 75  # Default if no meaningful keywords found
    
    # Use set intersection for matching
    matched_keywords = job_keywords.intersection(resume_keywords)
    match_percentage = (len(matched_keywords) / len(job_keywords)) * 100
    
    # Scale the score - 0% match = 0, 50% match = 75, 100% match = 100
    if match_percentage <= 50:
        keyword_score = match_percentage * 1.5
    else:
        keyword_score = 75 + ((match_percentage - 50) * 0.5)
    
    return round(min(100, keyword_score))


def calculate_content_quality_score(resume_text: str) -> int:
    """
    Analyze content quality factors like action verbs and quantification.
    
    Handles adverbs at the start of bullet points by checking both
    the first and second words for action verbs.
    
    Args:
        resume_text: The full resume text.
        
    Returns:
        Content quality score (0-100).
    """
    lines = resume_text.splitlines()
    
    # Find bullet point lines
    bullet_pattern = r'^[-•*✓►▪→]\s*'
    bullet_lines = []
    for line in lines:
        stripped = line.strip()
        if stripped and re.match(bullet_pattern, stripped):
            bullet_lines.append(stripped)
    
    # Count bullet points that start with action verbs
    action_verb_count = 0
    for line in bullet_lines:
        # Remove the bullet and get words
        cleaned_line = re.sub(bullet_pattern, '', line).strip().lower()
        words = cleaned_line.split()
        
        if not words:
            continue
        
        # Check first word
        first_word = words[0].rstrip(',.:;')
        if first_word in ACTION_VERBS:
            action_verb_count += 1
            continue
        
        # If first word is an adverb, check second word
        if first_word in COMMON_ADVERBS and len(words) > 1:
            second_word = words[1].rstrip(',.:;')
            if second_word in ACTION_VERBS:
                action_verb_count += 1
    
    # Calculate action verb percentage
    action_verb_score = 0
    if bullet_lines:
        action_verb_percentage = (action_verb_count / len(bullet_lines)) * 100
        action_verb_score = min(100, action_verb_percentage)
    
    # Check for metrics and quantifiable achievements
    metrics_pattern = r'\b\d+%|\$[\d,]+|\d+\s*(percent|dollars|users|clients|people|customers|sales|revenue|growth|increase|decrease|reduction|projects?|teams?|members?)\b'
    metrics_matches = re.findall(metrics_pattern, resume_text.lower())
    
    # Score based on number of metrics (diminishing returns)
    metrics_score = min(100, len(metrics_matches) * 15) if metrics_matches else 0
    
    # Overall content quality is weighted between action verbs and metrics
    content_score = (action_verb_score * 0.6) + (metrics_score * 0.4)
    return round(content_score)


def calculate_formatting_score(resume_text: str) -> int:
    """
    Check for good formatting practices in resumes.
    
    Args:
        resume_text: The full resume text.
        
    Returns:
        Formatting score (0-100).
    """
    lines = resume_text.splitlines()
    
    # Check consistent use of bullet points
    bullet_pattern = r'^[-•*✓►▪→]\s+'
    has_bullets = any(re.match(bullet_pattern, line.strip()) for line in lines)
    
    # Check for appropriate line spacing
    blank_line_count = sum(1 for line in lines if not line.strip())
    total_lines = len(lines)
    blank_ratio = blank_line_count / total_lines if total_lines > 0 else 0
    
    # Check for consistent date formatting
    date_patterns = [
        r'\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{4}\b',
        r'\b\d{2}/\d{2}/\d{4}\b',
        r'\b\d{4}-\d{2}\b',
        r'\b\d{4}\s*[-–]\s*(Present|Current|Now|\d{4})\b'
    ]
    
    dates = []
    for pattern in date_patterns:
        dates.extend(re.findall(pattern, resume_text, re.IGNORECASE))
    
    has_consistent_dates = len(dates) >= 2
    
    # Calculate formatting score
    formatting_score = 0
    
    # Bullet points (30 points)
    if has_bullets:
        formatting_score += 30
    
    # Appropriate spacing (40 points)
    if 0.05 <= blank_ratio <= 0.3:
        formatting_score += 40
    elif 0 < blank_ratio < 0.5:
        formatting_score += 20
    
    # Date consistency (30 points)
    if has_consistent_dates:
        formatting_score += 30
    
    return formatting_score


def sanitize_resume_for_ai(resume_text: str, sections: dict) -> str:
    """
    Remove sensitive personal information from resume before sending to AI.
    
    Args:
        resume_text: The full resume text.
        sections: The parsed sections dictionary.
        
    Returns:
        Sanitized resume text without contact info.
    """
    # Use sections to exclude Contact and Summary for privacy
    safe_sections = []
    for section_name, section_content in sections.items():
        if section_name not in ["contact", "summary", "other"] and section_content.strip():
            safe_sections.append(f"[{section_name.title()}]\n{section_content}")
    
    if safe_sections:
        return "\n\n".join(safe_sections)
    
    # Fallback: return truncated resume text
    return resume_text[:3000]


def generate_ats_feedback(resume_text: str, sections: dict, job_description: str, overall_score: int) -> str:
    """
    Generate detailed AI feedback on the resume's ATS-friendliness.
    
    Args:
        resume_text: The full resume text.
        sections: The parsed sections dictionary.
        job_description: The target job description.
        overall_score: The calculated overall ATS score.
        
    Returns:
        AI-generated feedback string.
    """
    # Sanitize resume to remove contact info
    safe_resume_text = sanitize_resume_for_ai(resume_text, sections)
    
    prompt = f"""
    You are an expert ATS (Applicant Tracking System) analyst.
    
    Below is a resume (with personal contact information removed for privacy) and a job description. The resume has received an ATS score of {overall_score}/100.
    
    Resume:
    {safe_resume_text[:3000]}
    
    Job Description:
    {job_description[:1000]}
    
    Based on your expertise in ATS systems and resume optimization, provide THREE specific, actionable suggestions to improve this resume's ATS compatibility. Focus on:
    1. Format improvements for better parsing
    2. Content optimization for keyword matching
    3. Structure enhancements for ATS readability
    
    Provide your response as a list of 3 numbered suggestions, each with a brief explanation.
    """
    
    try:
        completion = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[
                {"role": "system", "content": "You are an expert resume analyst helping job seekers improve their ATS compatibility."},
                {"role": "user", "content": prompt},
            ],
        )
        
        return completion.choices[0].message.content
        
    except Exception as e:
        return f"Error generating AI feedback: {str(e)}"


def get_ats_score(resume_text: str, resume_sections: dict, job_description: str) -> dict:
    """
    Main function to get ATS score and analysis.
    
    Args:
        resume_text: The extracted resume text.
        resume_sections: The parsed resume sections dictionary.
        job_description: The target job description.
        
    Returns:
        Dictionary containing overall score, component scores, justification, and AI analysis.
    """
    # Calculate individual component scores
    structure_score = calculate_structure_score(resume_sections)
    keyword_score = calculate_keyword_score(resume_text, job_description)
    content_score = calculate_content_quality_score(resume_text)
    formatting_score = calculate_formatting_score(resume_text)
    
    # Calculate overall ATS score with weights
    weights = {
        'structure': 0.25,
        'keywords': 0.35,
        'content': 0.25,
        'formatting': 0.15
    }
    
    overall_score = round(
        structure_score * weights['structure'] +
        keyword_score * weights['keywords'] +
        content_score * weights['content'] +
        formatting_score * weights['formatting']
    )
    
    # Generate justification for score
    justifications = []
    
    if structure_score >= 80:
        justifications.append("Strong resume structure with all essential sections.")
    elif structure_score >= 60:
        justifications.append("Good resume structure, but could improve some sections.")
    else:
        justifications.append("Resume is missing key sections that ATS systems expect.")
    
    if keyword_score >= 80:
        justifications.append("Excellent keyword matching with job description.")
    elif keyword_score >= 60:
        justifications.append("Decent keyword matching, but some key terms are missing.")
    else:
        justifications.append("Poor keyword alignment with the job description.")
    
    if content_score >= 80:
        justifications.append("Strong use of action verbs and quantifiable achievements.")
    elif content_score >= 60:
        justifications.append("Good content, but could use more action verbs or metrics.")
    else:
        justifications.append("Content lacks action verbs and measurable achievements.")
    
    if formatting_score >= 80:
        justifications.append("Clean, consistent formatting that ATS systems can parse easily.")
    elif formatting_score >= 60:
        justifications.append("Acceptable formatting, but some inconsistencies may affect parsing.")
    else:
        justifications.append("Formatting issues may prevent proper ATS parsing.")
    
    # Add detailed AI analysis
    ai_analysis = generate_ats_feedback(resume_text, resume_sections, job_description, overall_score)
    
    return {
        "overall_score": overall_score,
        "component_scores": {
            "structure_score": structure_score,
            "keyword_score": keyword_score,
            "content_score": content_score,
            "formatting_score": formatting_score
        },
        "justification": justifications,
        "ai_analysis": ai_analysis
    }
