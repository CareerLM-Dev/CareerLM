# tests/test_simplified_workflow.py
"""
Test for simplified 3-agent resume workflow
"""
import sys
from pathlib import Path

# Add project root to Python path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

print("=" * 60)
print("Testing Simplified 3-Agent Resume Workflow")
print("=" * 60)

from app.services.resume_optimizer import optimize_resume_logic
from app.agents.resume import resume_workflow
from app.agents.resume.state import ResumeState
print("✅ Imports successful\n")


def test_simplified_workflow():
    """Test the 3-agent workflow with sample resume and job description"""
    
    print("📝 Test: 3-Agent Resume Workflow")
    print("-" * 60)
    
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

    print("\n📄 Sample Resume:")
    print(sample_resume[:200] + "...")
    print("\n💼 Sample JD:")
    print(sample_jd[:150] + "...")
    print("\n" + "=" * 60)
    print("Running workflow...")
    print("=" * 60 + "\n")

    try:
        # Run the workflow
        result = optimize_resume_logic(
            sample_resume.encode("utf-8"),
            sample_jd,
            filename="resume.txt"
        )

        print("\n" + "=" * 60)
        print("✅ WORKFLOW COMPLETED SUCCESSFULLY")
        print("=" * 60)

        # Print results
        print(f"\n📊 ATS Score: {result['ats_score']}/100")
        
        print(f"\n🧠 Overall Readiness: {result['overall_readiness']}")
        
        print(f"\n✅ Ready Skills ({len(result['ready_skills'])}):")
        for skill in result['ready_skills'][:5]:
            print(f"  - {skill}")
        
        print(f"\n⚠️ Critical Gaps ({len(result['critical_gaps'])}):")
        for gap in result['critical_gaps'][:5]:
            print(f"  - {gap}")
        
        print(f"\n📚 Learning Priorities ({len(result['learning_priorities'])}):")
        for i, priority in enumerate(result['learning_priorities'][:3], 1):
            print(f"  {i}. {priority['skill']} - {priority['priority']} priority ({priority['time']})")
        
        print(f"\n✍️ Honest Improvements ({len(result['honest_improvements'])}):")
        for i, suggestion in enumerate(result['honest_improvements'][:3], 1):
            print(f"  {i}. {suggestion[:80]}...")
        
        if result.get('structure_suggestions'):
            print(f"\n🏗️ Structure Suggestions ({len(result['structure_suggestions'])}):")
            for i, suggestion in enumerate(result['structure_suggestions'], 1):
                print(f"  {i}. {suggestion[:80]}...")
        
        print(f"\n📈 Job Readiness: {result['job_readiness_estimate']}")
        
        print(f"\n🤖 Agent Execution Log:")
        for msg in result['agent_execution_log']:
            print(f"  {msg}")
        
        print(f"\n✅ Completed Steps: {', '.join(result['completed_steps'])}")
        print(f"🔄 Total Iterations: {result['total_iterations']}")
        print(f"📦 Version: {result['_version']}")

        # Assertions
        assert result['ats_score'] > 0, "ATS score should be calculated"
        assert result['overall_readiness'] != "Unknown", "Readiness should be calculated"
        assert len(result['skills_analysis']) > 0, "Skills should be analyzed"
        assert len(result['honest_improvements']) > 0, "Improvements should be generated"
        assert result['total_iterations'] <= 3, "Should complete in 3 iterations"
        assert len(result['completed_steps']) == 3, "Should complete all 3 steps"
        assert 'analyze_resume' in result['completed_steps'], "Step 1 should complete"
        assert 'analyze_skills' in result['completed_steps'], "Step 2 should complete"
        assert 'generate_advice' in result['completed_steps'], "Step 3 should complete"

        print("\n" + "=" * 60)
        print("✅ ALL TESTS PASSED!")
        print("=" * 60)
        
        return True

    except Exception as e:
        print("\n" + "=" * 60)
        print("❌ TEST FAILED")
        print("=" * 60)
        print(f"\nError: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = test_simplified_workflow()
    sys.exit(0 if success else 1)
