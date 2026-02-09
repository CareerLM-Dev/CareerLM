"""
Centralized Resume Parser Module

This module provides a unified interface for extracting text from resumes
and parsing them into structured sections. It handles PDF text extraction
and section segmentation with improved detection logic.
"""

import re
import pdfplumber
import io
from typing import Dict, List, Optional


class ResumeParser:
    """
    A centralized parser for handling resume text extraction and section segmentation.
    
    Usage:
        parser = ResumeParser()
        text = parser.extract_text_from_pdf(file_bytes)
        sections = parser.parse_sections(text)
        # or use the convenience method:
        text, sections = parser.parse_resume(file_bytes, filename="resume.pdf")
    """
    
    # Define section header patterns with multiple variations
    SECTION_PATTERNS = {
        "contact": [
            r"contact\s*(info|information|details)?",
            r"personal\s*(info|information|details)?",
            r"email|phone|address"
        ],
        "summary": [
            r"(professional\s+)?summary",
            r"(career\s+)?objective",
            r"(professional\s+)?profile",
            r"about\s+me",
            r"overview"
        ],
        "experience": [
            r"(professional\s+|work\s+)?experience",
            r"work\s+history",
            r"employment(\s+history)?",
            r"professional\s+background",
            r"career\s+history"
        ],
        "education": [
            r"education(\s+&\s+training)?",
            r"academic\s+(background|qualifications|credentials)",
            r"degrees?",
            r"university|college|school"
        ],
        "skills": [
            r"(technical\s+|core\s+|key\s+)?skills?",
            r"(technical\s+)?competenc(ies|e)",
            r"technologies|tools",
            r"technical\s+proficienc(ies|y)",
            r"areas?\s+of\s+expertise"
        ],
        "projects": [
            r"(personal\s+|professional\s+|key\s+)?projects?",
            r"portfolio",
            r"notable\s+work"
        ],
        "certifications": [
            r"certifications?",
            r"licenses?(\s+&\s+certifications?)?",
            r"professional\s+certifications?",
            r"credentials?"
        ],
        "publications": [
            r"publications?",
            r"papers?",
            r"research(\s+papers?)?",
            r"articles?"
        ],
        "awards": [
            r"awards?(\s+&\s+honors)?",
            r"honors?(\s+&\s+awards)?",
            r"achievements?",
            r"recognition"
        ]
    }
    
    def __init__(self):
        """Initialize the parser with compiled regex patterns."""
        self._compiled_patterns = {}
        for section, patterns in self.SECTION_PATTERNS.items():
            combined_pattern = "|".join(f"({p})" for p in patterns)
            self._compiled_patterns[section] = re.compile(
                f"^\\s*({combined_pattern})\\s*:?\\s*$",
                re.IGNORECASE
            )
    
    def extract_text_from_pdf(self, file_bytes: bytes) -> str:
        """
        Extract text content from a PDF file.
        
        Args:
            file_bytes: The raw bytes of the PDF file.
            
        Returns:
            The extracted text as a string.
        """
        text = ""
        try:
            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                for page in pdf.pages:
                    page_text = page.extract_text()
                    if page_text:
                        text += page_text + "\n"
        except Exception as e:
            raise ValueError(f"Failed to extract text from PDF: {str(e)}")
        return text
    
    def extract_text(self, file_bytes: bytes, filename: Optional[str] = None) -> str:
        """
        Extract text from file bytes, auto-detecting format based on filename.
        
        Args:
            file_bytes: The raw bytes of the file.
            filename: Optional filename to determine file type.
            
        Returns:
            The extracted text as a string.
        """
        # Check if it's a PDF
        if filename and filename.lower().endswith('.pdf'):
            return self.extract_text_from_pdf(file_bytes)
        
        # Try to decode as text
        try:
            return file_bytes.decode("utf-8")
        except UnicodeDecodeError:
            try:
                return file_bytes.decode("latin-1")
            except Exception:
                return str(file_bytes)
    
    def _identify_section(self, line: str) -> Optional[str]:
        """
        Identify if a line is a section header.
        
        Args:
            line: The text line to check.
            
        Returns:
            The section name if identified, None otherwise.
        """
        cleaned_line = line.strip()
        
        # Skip empty lines or very long lines (not headers)
        if not cleaned_line or len(cleaned_line) > 50:
            return None
        
        # Check against compiled patterns
        for section, pattern in self._compiled_patterns.items():
            if pattern.match(cleaned_line):
                return section
        
        # Fallback: check for common header keywords using startswith
        line_lower = cleaned_line.lower()
        
        header_keywords = {
            "experience": ["experience", "work history", "employment", "professional background"],
            "education": ["education", "academic", "degree", "university", "college"],
            "skills": ["skills", "technical skills", "core skills", "competencies", "technologies"],
            "projects": ["projects", "portfolio", "notable work"],
            "certifications": ["certifications", "licenses", "credentials"],
            "summary": ["summary", "objective", "profile", "about me", "overview"],
            "contact": ["contact", "personal info"],
            "publications": ["publications", "papers", "research"],
            "awards": ["awards", "honors", "achievements"]
        }
        
        for section, keywords in header_keywords.items():
            for keyword in keywords:
                if line_lower.startswith(keyword):
                    return section
        
        return None
    
    def parse_sections(self, resume_text: str) -> Dict[str, str]:
        """
        Parse resume text into structured sections.
        
        Args:
            resume_text: The full resume text.
            
        Returns:
            A dictionary mapping section names to their content.
        """
        sections = {
            "contact": "",
            "summary": "",
            "experience": "",
            "education": "",
            "skills": "",
            "projects": "",
            "certifications": "",
            "publications": "",
            "awards": "",
            "other": ""
        }
        
        current_section = "other"
        lines = resume_text.splitlines()
        
        for line in lines:
            # Try to identify if this line is a section header
            identified_section = self._identify_section(line)
            
            if identified_section:
                current_section = identified_section
                # Don't add the header line itself to content
                continue
            
            # Add non-empty lines to the current section
            if line.strip():
                sections[current_section] += line.strip() + "\n"
        
        # Clean up sections - strip trailing whitespace
        for section in sections:
            sections[section] = sections[section].strip()
        
        return sections
    
    def parse_skills_list(self, skills_text: str) -> List[str]:
        """
        Parse skills section text into a list of individual skills.
        
        Args:
            skills_text: The raw skills section text.
            
        Returns:
            A list of individual skill strings.
        """
        if not skills_text:
            return []
        
        # Split on common delimiters
        skills_list = re.split(r'[,\n;•|·]+', skills_text)
        
        # Clean up each skill
        cleaned_skills = []
        for skill in skills_list:
            skill = skill.strip()
            # Remove bullet points, dashes at start
            skill = re.sub(r'^[-*✓►▪→]\s*', '', skill).strip()
            if skill and len(skill) > 1:
                cleaned_skills.append(skill)
        
        return cleaned_skills
    
    def parse_resume(self, file_bytes: bytes, filename: Optional[str] = None) -> tuple:
        """
        Convenience method to extract text and parse sections in one call.
        
        Args:
            file_bytes: The raw bytes of the resume file.
            filename: Optional filename to determine file type.
            
        Returns:
            A tuple of (resume_text, sections_dict).
        """
        resume_text = self.extract_text(file_bytes, filename)
        sections = self.parse_sections(resume_text)
        return resume_text, sections


# Singleton instance for convenience
_parser_instance = None


def get_parser() -> ResumeParser:
    """Get or create a singleton ResumeParser instance."""
    global _parser_instance
    if _parser_instance is None:
        _parser_instance = ResumeParser()
    return _parser_instance
