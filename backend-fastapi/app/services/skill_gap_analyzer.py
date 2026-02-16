"""
Skill Gap Analyzer Module

This module provides functionality to analyze resumes and identify skill gaps
based on career cluster matching using TF-IDF and cosine similarity.
"""

import os
from dotenv import load_dotenv
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from app.agents.llm_config import GROQ_CLIENT as client, GROQ_DEFAULT_MODEL

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


def extract_skills_from_resume(resume_text: str) -> list:
    """
    Extract skills from resume text using pattern matching.
    
    Args:
        resume_text: The extracted resume text.
        
    Returns:
        List of found skills.
    """
    resume_lower = resume_text.lower()
    found_skills = set()
    
    # Collect all possible skills from career clusters
    all_skills = set()
    for cluster_data in CAREER_CLUSTERS.values():
        all_skills.update(cluster_data["skills"])
    
    # Find skills in resume
    for skill in all_skills:
        if skill.lower() in resume_lower:
            found_skills.add(skill)
    
    return list(found_skills)


def calculate_skill_match_percentage(user_skills: list, career_skills: list) -> float:
    """
    Calculate percentage match between user skills and career requirements.
    
    Args:
        user_skills: List of user's skills.
        career_skills: List of required career skills.
        
    Returns:
        Match percentage as a float.
    """
    user_skills_set = set(skill.lower() for skill in user_skills)
    career_skills_set = set(skill.lower() for skill in career_skills)
    
    if not career_skills_set:
        return 0.0
    
    matched_skills = user_skills_set.intersection(career_skills_set)
    match_percentage = (len(matched_skills) / len(career_skills_set)) * 100
    
    return round(match_percentage, 2)


def calculate_semantic_similarity(user_text: str, career_keywords: list) -> float:
    """
    Calculate semantic similarity using TF-IDF and cosine similarity.
    
    Args:
        user_text: The resume text.
        career_keywords: List of career keywords.
        
    Returns:
        Similarity score as a percentage.
    """
    try:
        # Combine career keywords into a single text
        career_text = " ".join(career_keywords)
        
        # Create TF-IDF vectors
        vectorizer = TfidfVectorizer(stop_words='english')
        vectors = vectorizer.fit_transform([user_text.lower(), career_text.lower()])
        
        # Calculate cosine similarity
        similarity = cosine_similarity(vectors[0:1], vectors[1:2])[0][0]
        return round(similarity * 100, 2)
    except:
        return 0.0


def calculate_career_probabilities(resume_text: str, user_skills: list) -> list:
    """
    Calculate probability scores for each career based on skills and semantic matching.
    
    Args:
        resume_text: The extracted resume text.
        user_skills: List of user's skills.
        
    Returns:
        List of career match dictionaries sorted by probability.
    """
    career_matches = []
    
    for career_name, cluster_data in CAREER_CLUSTERS.items():
        # Calculate skill-based match
        skill_match = calculate_skill_match_percentage(user_skills, cluster_data["skills"])
        
        # Calculate semantic similarity
        semantic_match = calculate_semantic_similarity(resume_text, cluster_data["keywords"])
        
        # Combined probability (weighted average: 70% skills, 30% semantic)
        combined_probability = (skill_match * 0.7) + (semantic_match * 0.3)
        
        # Find matched and missing skills
        user_skills_lower = set(skill.lower() for skill in user_skills)
        
        matched_skills = [
            skill for skill in cluster_data["skills"] 
            if skill.lower() in user_skills_lower
        ]
        
        missing_skills = [
            skill for skill in cluster_data["skills"] 
            if skill.lower() not in user_skills_lower
        ][:10]  # Limit to top 10 missing skills
        
        career_matches.append({
            "career": career_name,
            "probability": round(combined_probability, 2),
            "skill_match_percentage": skill_match,
            "semantic_match_percentage": semantic_match,
            "matched_skills": matched_skills,
            "missing_skills": missing_skills,
            "total_required_skills": len(cluster_data["skills"]),
            "matched_skills_count": len(matched_skills)
        })
    
    # Sort by probability (descending)
    career_matches.sort(key=lambda x: x["probability"], reverse=True)
    
    return career_matches


def get_ai_career_recommendations(resume_text: str, user_skills: list, top_careers: list) -> str:
    """
    Get AI-powered career recommendations and learning paths.
    
    Args:
        resume_text: The extracted resume text.
        user_skills: List of user's skills.
        top_careers: List of top career matches.
        
    Returns:
        AI-generated recommendations string.
    """
    try:
        top_3_careers = top_careers[:3]
        careers_summary = "\n".join([
            f"{i+1}. {career['career']} ({career['probability']}% match) - Missing: {', '.join(career['missing_skills'][:5])}"
            for i, career in enumerate(top_3_careers)
        ])
        
        prompt = f"""Based on this resume analysis:

User's Current Skills: {', '.join(user_skills)}

Top Career Matches:
{careers_summary}

Provide:
1. Detailed explanation of why these careers match the user's profile
2. Recommended learning path for the top career (specific courses, certifications, projects)
3. Timeline to become job-ready for the top career
4. Actionable next steps

Keep the response structured and practical."""

        completion = client.chat.completions.create(
            model=GROQ_DEFAULT_MODEL,
            messages=[
                {"role": "system", "content": "You are an expert career counselor and skill development advisor."},
                {"role": "user", "content": prompt},
            ],
        )

        return completion.choices[0].message.content

    except Exception as e:
        return f"AI recommendations unavailable: {str(e)}"


def analyze_skill_gap(resume_text: str, filename: str = None) -> dict:
    """
    Main function to analyze skill gaps and recommend careers based on clustering.
    
    Args:
        resume_text: The extracted resume text (already parsed).
        filename: Optional filename for logging purposes.
        
    Returns:
        Dictionary containing skill analysis, career matches, and recommendations.
    """
    try:
        # Extract user skills from the text
        user_skills = extract_skills_from_resume(resume_text)
        
        if not user_skills:
            return {
                "error": "No recognizable skills found in resume. Please ensure your resume includes technical skills."
            }
        
        # Calculate career probabilities
        career_matches = calculate_career_probabilities(resume_text, user_skills)
        
        # Get AI recommendations
        ai_recommendations = get_ai_career_recommendations(resume_text, user_skills, career_matches)
        
        return {
            "user_skills": user_skills,
            "total_skills_found": len(user_skills),
            "career_matches": career_matches,
            "top_3_careers": career_matches[:3],
            "ai_recommendations": ai_recommendations,
            "analysis_summary": {
                "best_match": career_matches[0]["career"] if career_matches else None,
                "best_match_probability": career_matches[0]["probability"] if career_matches else 0,
                "skills_to_focus": career_matches[0]["missing_skills"][:5] if career_matches else []
            }
        }
    
    except Exception as e:
        return {
            "error": f"Analysis failed: {str(e)}"
        }
