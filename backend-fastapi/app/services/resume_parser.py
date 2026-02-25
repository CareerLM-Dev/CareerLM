"""
Centralized Resume Parser Module

This module provides a unified interface for extracting text from resumes
and parsing them into structured sections. It handles PDF text extraction,
intelligent chunking, and hybrid keyword+LLM section identification.

Architecture:
1. Extract text from PDF
2. Clean unicode artifacts (Wingdings bullets etc.)
3. Split into logical chunks (potential sections)
4. First pass: keyword matching against templates (checked BEFORE ALL CAPS)
5. Second pass: batch LLM call for unidentified chunks
6. Output: dictionary mapping section names → content
"""

import re
import pdfplumber
import io
import json
from typing import Dict, List, Optional, Tuple

from app.agents.llm_config import GROQ_CLIENT, GROQ_DEFAULT_MODEL


class ResumeParser:
    """
    Hybrid parser for resume section extraction using keywords + LLM fallback.
    """

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
            r"key\s+skills",
            r"(technical\s+)?competenc(ies|e)",
            r"technologies|tools",
            r"technical\s+proficienc(ies|y)",
            r"areas?\s+of\s+expertise"
        ],
        "projects": [
            r"(personal\s+|professional\s+|key\s+)?projects?",
            r"key\s+projects",
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
        self._compiled_patterns = {}
        for section, patterns in self.SECTION_PATTERNS.items():
            combined_pattern = "|".join(f"({p})" for p in patterns)
            self._compiled_patterns[section] = re.compile(
                f"^\\s*({combined_pattern})\\s*:?\\s*$",
                re.IGNORECASE
            )

    # ── Text cleaning ─────────────────────────────────────────────────────────

    def _clean_text(self, text: str) -> str:
        """
        Strip unicode artifacts that come from Wingdings/symbol fonts in PDFs.
        Normalises bullets to standard characters so line parsing works correctly.
        """
        # Wingdings bullet \uf0a8 and full private use area range
        text = re.sub(r'[\uf000-\uf0ff]', '•', text)
        # Other common PDF bullet artifacts
        text = text.replace('\u25a0', '•').replace('\u25cf', '•').replace('\u2022', '•')
        # Normalise non-breaking spaces
        text = text.replace('\xa0', ' ')
        # Collapse multiple spaces on a line but keep newlines
        text = re.sub(r'[ \t]+', ' ', text)
        return text

    # ── PDF / text extraction ─────────────────────────────────────────────────

    def extract_text_from_pdf(self, file_bytes: bytes) -> str:
        text = ""
        try:
            with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                for page in pdf.pages:
                    page_text = page.extract_text()
                    if page_text:
                        text += page_text + "\n"
        except Exception as e:
            raise ValueError(f"Failed to extract text from PDF: {str(e)}")
        return self._clean_text(text)

    def extract_text(self, file_bytes: bytes, filename: Optional[str] = None) -> str:
        if filename and filename.lower().endswith('.pdf'):
            return self.extract_text_from_pdf(file_bytes)
        try:
            return self._clean_text(file_bytes.decode("utf-8"))
        except UnicodeDecodeError:
            try:
                return self._clean_text(file_bytes.decode("latin-1"))
            except Exception:
                return str(file_bytes)

    # ── Section identification ────────────────────────────────────────────────

    def _identify_section(self, line: str) -> Optional[str]:
        """
        Identify if a line is a section header.
        Keyword matching runs FIRST — ALL CAPS detection is only a tiebreaker.
        """
        if not line:
            return None
        cleaned = line.strip()
        if not cleaned or len(cleaned) > 60:
            return None

        # 1. Compiled regex patterns (most precise)
        for section, pattern in self._compiled_patterns.items():
            if pattern.match(cleaned):
                return section

        # 2. Explicit keyword fallback (case-insensitive)
        line_lower = cleaned.lower().rstrip(':').strip()
        header_keywords = {
            "experience": ["work experience", "professional experience", "employment", "work history", "career history"],
            "education": ["education", "academic", "degree", "university", "college", "training"],
            "skills": ["skills", "technical skills", "core skills", "key skills", "competencies",
                       "technologies", "programming", "languages"],
            "projects": ["projects", "portfolio", "notable work", "key projects"],
            "certifications": ["certifications", "certificates", "licenses", "credentials", "professional cert"],
            "summary": ["summary", "objective", "profile", "about", "professional summary", "career summary"],
            "contact": ["contact", "personal info", "contact info"],
            "publications": ["publications", "papers", "research", "articles", "published"],
            "awards": ["awards", "honors", "recognition", "achievement"],
        }
        for section, keywords in header_keywords.items():
            for keyword in keywords:
                if line_lower == keyword or line_lower.startswith(keyword):
                    return section

        return None

    # ── Chunking ──────────────────────────────────────────────────────────────

    def _split_into_chunks(self, resume_text: str) -> List[Tuple[str, str]]:
        """
        Split resume into (header, content) chunks.

        Header detection order (IMPORTANT — do NOT change):
          1. Keyword matching via _identify_section  ← most reliable
          2. Known section keywords list             ← explicit safety net
          3. ALL CAPS pattern                        ← last resort only
          4. Colon-ending short line                 ← structural hint
        """
        lines = resume_text.splitlines()
        chunks = []
        current_header = ""
        current_content = []

        # ALL CAPS pattern used only as last resort
        all_caps_pattern = re.compile(r'^[A-Z][A-Z\s&]{2,}[A-Z]$|^[A-Z][A-Z\s&]+:$')

        known_keywords = [
            'EDUCATION', 'EXPERIENCE', 'SKILLS', 'PROJECTS',
            'CERTIFICATIONS', 'LANGUAGES', 'TECHNICAL', 'AWARDS',
            'PUBLICATIONS', 'SUMMARY', 'OBJECTIVE', 'CONTACT',
            'TRAINING', 'RELEVANT', 'KEY SKILLS', 'KEY PROJECTS',
        ]

        for line in lines:
            stripped = line.strip()
            if not stripped:
                continue

            # Gate: must be short enough to be a header
            if len(stripped) >= 60:
                current_content.append(line)
                continue

            # Check order: keyword first, ALL CAPS last
            is_header = (
                self._identify_section(stripped) is not None
                or any(
                    re.match(r'^' + re.escape(kw) + r'(\s|$|:)', stripped, re.IGNORECASE)
                    for kw in known_keywords
                )
                or bool(all_caps_pattern.match(stripped))
                or (stripped.endswith(':') and len(stripped.split()) <= 5)
            )

            if is_header:
                if current_content or current_header:
                    chunks.append((current_header, "\n".join(current_content).strip()))
                current_header = stripped
                current_content = []
            else:
                current_content.append(line)

        if current_content or current_header:
            chunks.append((current_header, "\n".join(current_content).strip()))

        return chunks

    # ── LLM fallback ──────────────────────────────────────────────────────────

    def _identify_sections_with_llm(self, chunks: List[Tuple[int, str, str]]) -> Dict[int, str]:
        if not chunks:
            return {}

        chunks_text = ""
        for idx, header, content in chunks:
            preview = (content[:200] if content else f"Header: {header}").replace('\n', ' | ')
            chunks_text += f"\nChunk {idx}:\nHeader: '{header}'\nContent Preview: {preview}\n---"

        prompt = f"""You are an expert resume parser. Classify EACH chunk into a resume section.

Instructions:
- Return ONLY valid JSON with no other text
- Map each chunk index to the most appropriate section
- "KEY SKILLS" → skills, "KEY PROJECTS" → projects

Valid sections: contact, summary, experience, education, skills, projects, certifications, publications, awards, other

Resume chunks:
{chunks_text}

Return format (JSON only):
{{"0": "experience", "1": "education", "2": "skills", ...}}
"""
        try:
            response = GROQ_CLIENT.chat.completions.create(
                model=GROQ_DEFAULT_MODEL,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.1,
                max_tokens=1000
            )
            response_text = response.choices[0].message.content.strip()
            json_match = re.search(r'\{[^{}]*\}|\{(?:[^{}]|(?:\{[^{}]*\}))*\}', response_text, re.DOTALL)
            if json_match:
                result = json.loads(json_match.group())
                return {
                    int(k) if isinstance(k, str) and k.lstrip('-').isdigit() else k: v
                    for k, v in result.items()
                }
        except Exception as e:
            print(f"Warning: LLM section identification failed: {e}")
        return {}

    # ── Main parse ────────────────────────────────────────────────────────────

    def parse_sections(self, resume_text: str) -> Dict[str, str]:
        sections = {
            "contact": "", "summary": "", "experience": "", "education": "",
            "skills": "", "projects": "", "certifications": "",
            "publications": "", "awards": "", "other": ""
        }
        valid_sections = set(sections.keys())

        chunks = self._split_into_chunks(resume_text)
        section_to_chunks: Dict[str, List[str]] = {sec: [] for sec in sections}
        unidentified_chunks = []

        for idx, (header, content) in enumerate(chunks):
            full_content = f"{header}\n{content}".strip() if header and content else (header or content)

            # Try header first, then first line of content
            section = self._identify_section(header) if header else None
            if not section:
                first_line = content.split('\n')[0] if content else ""
                section = self._identify_section(first_line) if first_line else None

            if section:
                section_to_chunks[section].append(full_content)
            else:
                unidentified_chunks.append((idx, header, content))

        # Decide whether to use LLM
        unidentified_ratio = len(unidentified_chunks) / max(1, len(chunks))
        use_llm_for_all = unidentified_ratio > 0.3

        if use_llm_for_all:
            print(f"Resume structure unclear — using LLM for all {len(chunks)} chunks")
            llm_results = self._identify_sections_with_llm(
                [(i, h, c) for i, (h, c) in enumerate(chunks)]
            )
            section_to_chunks = {sec: [] for sec in sections}
            for idx, (header, content) in enumerate(chunks):
                sec = llm_results.get(idx, "other")
                if sec not in valid_sections:
                    sec = "other"
                full_content = f"{header}\n{content}".strip() if header and content else (header or content)
                section_to_chunks[sec].append(full_content)

        elif unidentified_chunks:
            print(f"Using LLM for {len(unidentified_chunks)} ambiguous chunks")
            llm_results = self._identify_sections_with_llm(unidentified_chunks)
            for idx, header, content in unidentified_chunks:
                sec = llm_results.get(idx, "other")
                if sec not in valid_sections:
                    sec = "other"
                full_content = f"{header}\n{content}".strip() if header and content else (header or content)
                section_to_chunks[sec].append(full_content)

        for section, chunks_list in section_to_chunks.items():
            if chunks_list:
                sections[section] = "\n\n".join(chunks_list).strip()

        return sections

    def parse_skills_list(self, skills_text: str) -> List[str]:
        if not skills_text:
            return []
        skills_list = re.split(r'[,\n;•|·]+', skills_text)
        cleaned = []
        for skill in skills_list:
            skill = re.sub(r'^[-*•✓►▪→]\s*', '', skill.strip()).strip()
            if skill and len(skill) > 1:
                cleaned.append(skill)
        return cleaned

    def parse_resume(self, file_bytes: bytes, filename: Optional[str] = None) -> tuple:
        resume_text = self.extract_text(file_bytes, filename)
        sections = self.parse_sections(resume_text)
        return resume_text, sections


# Singleton
_parser_instance = None

def get_parser() -> ResumeParser:
    global _parser_instance
    if _parser_instance is None:
        _parser_instance = ResumeParser()
    return _parser_instance