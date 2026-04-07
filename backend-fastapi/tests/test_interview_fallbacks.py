import sys
import unittest
from pathlib import Path


project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from app.services.interview.fallbacks import build_fallback_questions


class TestInterviewFallbacks(unittest.TestCase):
    def test_build_fallback_questions_completes_easy_set_after_partial_generation(self):
        existing_questions = [
            {
                "id": 1,
                "category": "Resume Validation",
                "question": "Tell me about the strongest experience on your resume.",
            },
            {
                "id": 2,
                "category": "Project Deep Dive",
                "question": "Walk me through the architecture of your job tracker project.",
            },
            {
                "id": 3,
                "category": "Core Technical",
                "question": "How have you used FastAPI in practice?",
            },
        ]

        blocked_questions = [
            "Tell me about the strongest experience on your resume.",
            "Walk me through the architecture of your job tracker project.",
            "How have you used FastAPI in practice?",
            "What challenge did you face while building your job tracker project?",
            "Which project best demonstrates your engineering skills?",
        ]

        resume_sections = {
            "experience": "Software Engineer Intern at Acme Corp\nBuilt internal automation tools with Python and FastAPI\nImproved reporting workflow for recruiters",
            "projects": "Job tracker platform with resume analysis and interview prep\nPortfolio website with React and Tailwind CSS",
            "skills": "Python, FastAPI, React, PostgreSQL, Tailwind CSS",
            "education": "B.Tech in Computer Engineering",
        }

        fallback_questions = build_fallback_questions(
            target_role="Software Engineer",
            difficulty="easy",
            resume_sections=resume_sections,
            existing_questions=existing_questions,
            blocked_questions=blocked_questions,
        )

        combined = existing_questions + fallback_questions

        self.assertEqual(len(combined), 5)
        self.assertEqual(sum(1 for item in combined if item["category"] == "Resume Validation"), 2)
        self.assertEqual(sum(1 for item in combined if item["category"] == "Project Deep Dive"), 2)
        self.assertEqual(sum(1 for item in combined if item["category"] == "Core Technical"), 1)

        combined_texts = [item["question"] for item in combined]
        self.assertEqual(len(combined_texts), len(set(combined_texts)))


if __name__ == "__main__":
    unittest.main()