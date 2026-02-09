# tests/test_graph.py
import sys
from pathlib import Path

# Add project root to Python path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

print("✓ Path setup complete")

from app.services.resume_optimizer import optimize_resume_logic
print("✓ Imports successful")


def test_with_sample_resume():
    sample_resume = """
John Doe
john.doe@email.com | (555) 123-4567

EXPERIENCE
Software Developer at Tech Corp (3 years)
- Developed web applications using Python and Django
- Built REST APIs serving 10,000+ users
- Managed PostgreSQL databases with 50GB+ data
- Deployed applications on Heroku cloud platform
- Used Git for version control in team of 5

SKILLS
Python (3 years), Django, PostgreSQL, Git, HTML, CSS, JavaScript

PROJECTS
E-commerce Platform
- Built using Django REST Framework
- Integrated Stripe payment processing
- Deployed on cloud platform with CI/CD
"""

    sample_jd = """
Senior Python Developer

Requirements:
- 5+ years Python experience (REQUIRED)
- Expert in Django and FastAPI (REQUIRED)
- AWS cloud experience (REQUIRED)
- Docker and Kubernetes (REQUIRED)
- PostgreSQL or MySQL (REQUIRED)
- CI/CD pipelines (PREFERRED)
- Strong REST API development (REQUIRED)
"""

    print("=" * 60)
    print("TESTING ENHANCED AGENTIC SYSTEM")
    print("=" * 60)
    
    result = optimize_resume_logic(
        resume_content=sample_resume.encode('utf-8'),
        job_description=sample_jd,
        filename="sample_resume.txt"
    )
    
    # Print agent log
    print("\n" + "=" * 60)
    print("AGENT EXECUTION LOG")
    print("=" * 60)
    for msg in result["agent_execution_log"]:
        print(msg)
    
    # Print validated skills
    print("\n" + "=" * 60)
    print("SKILL VALIDATION")
    print("=" * 60)
    for skill in result.get("validated_skills", []):
        print(f"\n{skill['skill']}: {skill['status'].upper()}")
        print(f"  Confidence: {skill['confidence']}")
        print(f"  Evidence: {', '.join(skill['evidence'][:2])}")
    
    # Print level assessment
    print("\n" + "=" * 60)
    print("LEVEL ASSESSMENT")
    print("=" * 60)
    level_data = result.get("level_assessment", {})
    print(f"Overall Readiness: {level_data.get('overall_readiness', 'N/A')}")
    
    for skill_level in level_data.get("skill_levels", [])[:5]:
        print(f"\n{skill_level['skill']}:")
        print(f"  Required: Level {skill_level['required_level']}")
        print(f"  Current: Level {skill_level['current_level']}")
        print(f"  Gap: {skill_level['gap']} levels")
        print(f"  Time to bridge: {skill_level['time_to_bridge']}")
        print(f"  Reason: {skill_level['assessment_reason']}")
    
    # Print honest improvements
    print("\n" + "=" * 60)
    print("HONEST IMPROVEMENTS (Evidence-Based)")
    print("=" * 60)
    for i, improvement in enumerate(result.get("honest_improvements", []), 1):
        print(f"{i}. {improvement}")
    
    return result


if __name__ == "__main__":
    print("🧪 Starting test...")
    test_with_sample_resume()
    print("\n✅ Test complete!")