"""
LaTeX Resume Generator Service
Generates LaTeX code using Jake's Resume Template
"""

import re
from typing import Dict, List, Optional


def escape_latex(text: str) -> str:
    """Escape special LaTeX characters."""
    if not text:
        return ""
    
    # Order matters - backslash must be first
    replacements = [
        ('\\', '\\textbackslash{}'),
        ('&', '\\&'),
        ('%', '\\%'),
        ('$', '\\$'),
        ('#', '\\#'),
        ('_', '\\_'),
        ('{', '\\{'),
        ('}', '\\}'),
        ('~', '\\textasciitilde{}'),
        ('^', '\\textasciicircum{}'),
    ]
    
    for old, new in replacements:
        text = text.replace(old, new)
    
    return text


def parse_contact_info(contact_text: str) -> Dict[str, str]:
    """Extract contact information from contact section text."""
    info = {
        "name": "",
        "phone": "",
        "email": "",
        "linkedin": "",
        "github": "",
        "location": "",
        "website": ""
    }
    
    if not contact_text:
        return info
    
    lines = contact_text.strip().split('\n')
    
    # First line is usually the name
    if lines:
        info["name"] = lines[0].strip()
    
    # Extract patterns from remaining text
    full_text = contact_text.lower()
    
    # Email pattern
    email_match = re.search(r'[\w\.-]+@[\w\.-]+\.\w+', contact_text)
    if email_match:
        info["email"] = email_match.group()
    
    # Phone pattern
    phone_match = re.search(r'[\+]?[\d\s\-\(\)]{10,}', contact_text)
    if phone_match:
        info["phone"] = phone_match.group().strip()
    
    # LinkedIn pattern
    linkedin_match = re.search(r'linkedin\.com/in/[\w\-]+', contact_text, re.IGNORECASE)
    if linkedin_match:
        info["linkedin"] = linkedin_match.group()
    
    # GitHub pattern
    github_match = re.search(r'github\.com/[\w\-]+', contact_text, re.IGNORECASE)
    if github_match:
        info["github"] = github_match.group()
    
    return info


def parse_experience_entries(experience_text: str) -> List[Dict[str, str]]:
    """Parse experience section into structured entries."""
    entries = []
    if not experience_text:
        return entries
    
    # Split by common patterns that indicate new entries
    # Look for patterns like "Company Name" followed by dates or titles
    lines = experience_text.strip().split('\n')
    
    current_entry = None
    current_bullets = []
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        # Check if this looks like a header line (company/role)
        # Headers typically don't start with bullet points
        is_bullet = line.startswith(('-', '•', '–', '*', '▪')) or re.match(r'^\d+\.', line)
        
        if not is_bullet and len(line) > 5:
            # Save previous entry
            if current_entry:
                current_entry["bullets"] = current_bullets
                entries.append(current_entry)
            
            # Start new entry
            current_entry = {
                "title": line,
                "company": "",
                "location": "",
                "dates": "",
                "bullets": []
            }
            current_bullets = []
            
            # Try to extract dates from the line
            date_match = re.search(r'((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*\d{4}\s*[-–]\s*(?:Present|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*\d{4})|\d{4}\s*[-–]\s*(?:Present|\d{4}))', line, re.IGNORECASE)
            if date_match:
                current_entry["dates"] = date_match.group()
                current_entry["title"] = line.replace(date_match.group(), '').strip(' -–|')
        
        elif is_bullet and current_entry:
            # Remove bullet character
            bullet_text = re.sub(r'^[-•–*▪]\s*|\d+\.\s*', '', line)
            current_bullets.append(bullet_text)
    
    # Don't forget the last entry
    if current_entry:
        current_entry["bullets"] = current_bullets
        entries.append(current_entry)
    
    return entries


def parse_education_entries(education_text: str) -> List[Dict[str, str]]:
    """Parse education section into structured entries."""
    entries = []
    if not education_text:
        return entries
    
    lines = education_text.strip().split('\n')
    current_entry = None
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        is_bullet = line.startswith(('-', '•', '–', '*', '▪'))
        
        if not is_bullet:
            if current_entry:
                entries.append(current_entry)
            
            current_entry = {
                "degree": line,
                "school": "",
                "location": "",
                "dates": "",
                "details": ""
            }
            
            # Extract dates
            date_match = re.search(r'((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*\d{4}\s*[-–]\s*(?:Present|Expected|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*\d{4})|\d{4}\s*[-–]\s*(?:Present|Expected|\d{4}))', line, re.IGNORECASE)
            if date_match:
                current_entry["dates"] = date_match.group()
        elif current_entry:
            bullet_text = re.sub(r'^[-•–*▪]\s*', '', line)
            if current_entry["details"]:
                current_entry["details"] += "; " + bullet_text
            else:
                current_entry["details"] = bullet_text
    
    if current_entry:
        entries.append(current_entry)
    
    return entries


def parse_project_entries(projects_text: str) -> List[Dict[str, str]]:
    """Parse projects section into structured entries."""
    entries = []
    if not projects_text:
        return entries
    
    lines = projects_text.strip().split('\n')
    current_entry = None
    current_bullets = []
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        is_bullet = line.startswith(('-', '•', '–', '*', '▪')) or re.match(r'^\d+\.', line)
        
        if not is_bullet and len(line) > 3:
            if current_entry:
                current_entry["bullets"] = current_bullets
                entries.append(current_entry)
            
            current_entry = {
                "name": line,
                "technologies": "",
                "dates": "",
                "bullets": []
            }
            current_bullets = []
            
            # Extract technologies in parentheses or after pipe
            tech_match = re.search(r'\(([^)]+)\)|\|(.+)$', line)
            if tech_match:
                current_entry["technologies"] = (tech_match.group(1) or tech_match.group(2)).strip()
                current_entry["name"] = line[:tech_match.start()].strip()
        
        elif is_bullet and current_entry:
            bullet_text = re.sub(r'^[-•–*▪]\s*|\d+\.\s*', '', line)
            current_bullets.append(bullet_text)
    
    if current_entry:
        current_entry["bullets"] = current_bullets
        entries.append(current_entry)
    
    return entries


def parse_skills(skills_text: str) -> Dict[str, List[str]]:
    """Parse skills section into categories."""
    categories = {}
    if not skills_text:
        return categories
    
    lines = skills_text.strip().split('\n')
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        # Check for category: skills format
        if ':' in line:
            parts = line.split(':', 1)
            category = parts[0].strip()
            skills = [s.strip() for s in parts[1].split(',')]
            categories[category] = skills
        else:
            # No category, add to general
            if "General" not in categories:
                categories["General"] = []
            skills = [s.strip() for s in line.split(',')]
            categories["General"].extend(skills)
    
    return categories


def generate_latex(sections: Dict[str, str]) -> str:
    """
    Generate complete LaTeX document using Jake's Resume Template.
    
    Args:
        sections: Dictionary with keys like 'contact', 'summary', 'experience', etc.
    
    Returns:
        Complete LaTeX document as string
    """
    
    # Parse sections
    contact = parse_contact_info(sections.get("contact", ""))
    experience_entries = parse_experience_entries(sections.get("experience", ""))
    education_entries = parse_education_entries(sections.get("education", ""))
    project_entries = parse_project_entries(sections.get("projects", ""))
    skills = parse_skills(sections.get("skills", ""))
    
    # Build LaTeX document
    latex = r'''\documentclass[letterpaper,11pt]{article}

\usepackage{latexsym}
\usepackage[empty]{fullpage}
\usepackage{titlesec}
\usepackage{marvosym}
\usepackage[usenames,dvipsnames]{color}
\usepackage{verbatim}
\usepackage{enumitem}
\usepackage[hidelinks]{hyperref}
\usepackage{fancyhdr}
\usepackage[english]{babel}
\usepackage{tabularx}
\input{glyphtounicode}

\pagestyle{fancy}
\fancyhf{}
\fancyfoot{}
\renewcommand{\headrulewidth}{0pt}
\renewcommand{\footrulewidth}{0pt}

% Adjust margins
\addtolength{\oddsidemargin}{-0.5in}
\addtolength{\evensidemargin}{-0.5in}
\addtolength{\textwidth}{1in}
\addtolength{\topmargin}{-.5in}
\addtolength{\textheight}{1.0in}

\urlstyle{same}

\raggedbottom
\raggedright
\setlength{\tabcolsep}{0in}

% Sections formatting
\titleformat{\section}{
  \vspace{-4pt}\scshape\raggedright\large
}{}{0em}{}[\color{black}\titlerule \vspace{-5pt}]

% Ensure that generate pdf is machine readable/ATS parsable
\pdfgentounicode=1

%-------------------------
% Custom commands
\newcommand{\resumeItem}[1]{
  \item\small{
    {#1 \vspace{-2pt}}
  }
}

\newcommand{\resumeSubheading}[4]{
  \vspace{-2pt}\item
    \begin{tabular*}{0.97\textwidth}[t]{l@{\extracolsep{\fill}}r}
      \textbf{#1} & #2 \\
      \textit{\small#3} & \textit{\small #4} \\
    \end{tabular*}\vspace{-7pt}
}

\newcommand{\resumeSubSubheading}[2]{
    \item
    \begin{tabular*}{0.97\textwidth}{l@{\extracolsep{\fill}}r}
      \textit{\small#1} & \textit{\small #2} \\
    \end{tabular*}\vspace{-7pt}
}

\newcommand{\resumeProjectHeading}[2]{
    \item
    \begin{tabular*}{0.97\textwidth}{l@{\extracolsep{\fill}}r}
      \small#1 & #2 \\
    \end{tabular*}\vspace{-7pt}
}

\newcommand{\resumeSubItem}[1]{\resumeItem{#1}\vspace{-4pt}}

\renewcommand\labelitemii{$\vcenter{\hbox{\tiny$\bullet$}}$}

\newcommand{\resumeSubHeadingListStart}{\begin{itemize}[leftmargin=0.15in, label={}]}
\newcommand{\resumeSubHeadingListEnd}{\end{itemize}}
\newcommand{\resumeItemListStart}{\begin{itemize}}
\newcommand{\resumeItemListEnd}{\end{itemize}\vspace{-5pt}}

%-------------------------------------------
%%%%%%  RESUME STARTS HERE  %%%%%%%%%%%%%%%%%%%%%%%%%%%%

\begin{document}

'''
    
    # Header/Contact Section
    name = escape_latex(contact.get("name", "Your Name"))
    phone = escape_latex(contact.get("phone", ""))
    email = contact.get("email", "")
    linkedin = contact.get("linkedin", "")
    github = contact.get("github", "")
    
    latex += r'\begin{center}' + '\n'
    latex += r'    \textbf{\Huge \scshape ' + name + r'} \\ \vspace{1pt}' + '\n'
    
    contact_items = []
    if phone:
        contact_items.append(r'\small ' + phone)
    if email:
        contact_items.append(r'\href{mailto:' + email + r'}{\underline{' + escape_latex(email) + r'}}')
    if linkedin:
        contact_items.append(r'\href{https://' + linkedin + r'}{\underline{' + escape_latex(linkedin) + r'}}')
    if github:
        contact_items.append(r'\href{https://' + github + r'}{\underline{' + escape_latex(github) + r'}}')
    
    if contact_items:
        latex += r'    ' + r' $|$ '.join(contact_items) + '\n'
    
    latex += r'\end{center}' + '\n\n'
    
    # Summary Section (if exists)
    summary = sections.get("summary", "").strip()
    if summary:
        latex += r'%-----------SUMMARY-----------' + '\n'
        latex += r'\section{Summary}' + '\n'
        latex += escape_latex(summary) + '\n\n'
    
    # Education Section
    if education_entries:
        latex += r'%-----------EDUCATION-----------' + '\n'
        latex += r'\section{Education}' + '\n'
        latex += r'  \resumeSubHeadingListStart' + '\n'
        
        for edu in education_entries:
            degree = escape_latex(edu.get("degree", ""))
            school = escape_latex(edu.get("school", ""))
            dates = escape_latex(edu.get("dates", ""))
            details = escape_latex(edu.get("details", ""))
            
            latex += r'    \resumeSubheading' + '\n'
            latex += r'      {' + degree + r'}{' + dates + r'}' + '\n'
            latex += r'      {' + school + r'}{}' + '\n'
            
            if details:
                latex += r'      \resumeItemListStart' + '\n'
                latex += r'        \resumeItem{' + details + r'}' + '\n'
                latex += r'      \resumeItemListEnd' + '\n'
        
        latex += r'  \resumeSubHeadingListEnd' + '\n\n'
    
    # Experience Section
    if experience_entries:
        latex += r'%-----------EXPERIENCE-----------' + '\n'
        latex += r'\section{Experience}' + '\n'
        latex += r'  \resumeSubHeadingListStart' + '\n'
        
        for exp in experience_entries:
            title = escape_latex(exp.get("title", ""))
            company = escape_latex(exp.get("company", ""))
            dates = escape_latex(exp.get("dates", ""))
            location = escape_latex(exp.get("location", ""))
            
            latex += r'    \resumeSubheading' + '\n'
            latex += r'      {' + title + r'}{' + dates + r'}' + '\n'
            latex += r'      {' + company + r'}{' + location + r'}' + '\n'
            
            bullets = exp.get("bullets", [])
            if bullets:
                latex += r'      \resumeItemListStart' + '\n'
                for bullet in bullets:
                    latex += r'        \resumeItem{' + escape_latex(bullet) + r'}' + '\n'
                latex += r'      \resumeItemListEnd' + '\n'
        
        latex += r'  \resumeSubHeadingListEnd' + '\n\n'
    
    # Projects Section
    if project_entries:
        latex += r'%-----------PROJECTS-----------' + '\n'
        latex += r'\section{Projects}' + '\n'
        latex += r'    \resumeSubHeadingListStart' + '\n'
        
        for proj in project_entries:
            name = escape_latex(proj.get("name", ""))
            tech = escape_latex(proj.get("technologies", ""))
            dates = escape_latex(proj.get("dates", ""))
            
            if tech:
                latex += r'      \resumeProjectHeading' + '\n'
                latex += r'          {\textbf{' + name + r'} $|$ \emph{' + tech + r'}}{' + dates + r'}' + '\n'
            else:
                latex += r'      \resumeProjectHeading' + '\n'
                latex += r'          {\textbf{' + name + r'}}{' + dates + r'}' + '\n'
            
            bullets = proj.get("bullets", [])
            if bullets:
                latex += r'          \resumeItemListStart' + '\n'
                for bullet in bullets:
                    latex += r'            \resumeItem{' + escape_latex(bullet) + r'}' + '\n'
                latex += r'          \resumeItemListEnd' + '\n'
        
        latex += r'    \resumeSubHeadingListEnd' + '\n\n'
    
    # Skills Section
    if skills:
        latex += r'%-----------TECHNICAL SKILLS-----------' + '\n'
        latex += r'\section{Technical Skills}' + '\n'
        latex += r' \begin{itemize}[leftmargin=0.15in, label={}]' + '\n'
        latex += r'    \small{\item{' + '\n'
        
        skill_lines = []
        for category, skill_list in skills.items():
            if skill_list:
                escaped_skills = [escape_latex(s) for s in skill_list if s]
                skill_lines.append(r'     \textbf{' + escape_latex(category) + r'}{: ' + ', '.join(escaped_skills) + r'}')
        
        latex += r' \\' + '\n'.join(skill_lines) + '\n'
        latex += r'    }}' + '\n'
        latex += r' \end{itemize}' + '\n\n'
    
    # Certifications Section
    certifications = sections.get("certifications", "").strip()
    if certifications:
        latex += r'%-----------CERTIFICATIONS-----------' + '\n'
        latex += r'\section{Certifications}' + '\n'
        latex += r' \begin{itemize}[leftmargin=0.15in, label={}]' + '\n'
        latex += r'    \small{\item{' + '\n'
        latex += escape_latex(certifications) + '\n'
        latex += r'    }}' + '\n'
        latex += r' \end{itemize}' + '\n\n'
    
    # Awards Section
    awards = sections.get("awards", "").strip()
    if awards:
        latex += r'%-----------AWARDS-----------' + '\n'
        latex += r'\section{Awards}' + '\n'
        latex += r' \begin{itemize}[leftmargin=0.15in, label={}]' + '\n'
        latex += r'    \small{\item{' + '\n'
        latex += escape_latex(awards) + '\n'
        latex += r'    }}' + '\n'
        latex += r' \end{itemize}' + '\n\n'
    
    # End document
    latex += r'%-------------------------------------------' + '\n'
    latex += r'\end{document}' + '\n'
    
    return latex


def generate_latex_simple(sections: Dict[str, str]) -> str:
    """
    Generate simpler LaTeX that preserves original text structure more closely.
    Use this when parsed structure detection fails.
    """
    latex = r'''\documentclass[letterpaper,11pt]{article}

\usepackage{latexsym}
\usepackage[empty]{fullpage}
\usepackage{titlesec}
\usepackage[usenames,dvipsnames]{color}
\usepackage{enumitem}
\usepackage[hidelinks]{hyperref}
\usepackage{fancyhdr}
\usepackage[english]{babel}

\pagestyle{fancy}
\fancyhf{}
\renewcommand{\headrulewidth}{0pt}
\renewcommand{\footrulewidth}{0pt}

\addtolength{\oddsidemargin}{-0.5in}
\addtolength{\evensidemargin}{-0.5in}
\addtolength{\textwidth}{1in}
\addtolength{\topmargin}{-.5in}
\addtolength{\textheight}{1.0in}

\titleformat{\section}{\vspace{-4pt}\scshape\raggedright\large}{}{0em}{}[\color{black}\titlerule \vspace{-5pt}]

\begin{document}

'''
    
    section_titles = {
        "contact": "Contact",
        "summary": "Summary",
        "experience": "Experience",
        "education": "Education",
        "skills": "Technical Skills",
        "projects": "Projects",
        "certifications": "Certifications",
        "publications": "Publications",
        "awards": "Awards",
        "coursework": "Relevant Coursework",
        "other": "Additional Information"
    }
    
    # Contact as header
    contact = sections.get("contact", "").strip()
    if contact:
        lines = contact.split('\n')
        if lines:
            latex += r'\begin{center}' + '\n'
            latex += r'\textbf{\Huge \scshape ' + escape_latex(lines[0]) + r'} \\' + '\n'
            if len(lines) > 1:
                latex += r'\small ' + escape_latex(' | '.join(l.strip() for l in lines[1:] if l.strip())) + '\n'
            latex += r'\end{center}' + '\n\n'
    
    # Other sections
    for key in ["summary", "education", "experience", "projects", "skills", "certifications", "awards", "coursework", "other"]:
        content = sections.get(key, "").strip()
        if content:
            latex += r'\section{' + section_titles.get(key, key.title()) + r'}' + '\n'
            
            # Convert bullets
            lines = content.split('\n')
            in_list = False
            
            for line in lines:
                line = line.strip()
                if not line:
                    continue
                
                is_bullet = line.startswith(('-', '•', '–', '*', '▪'))
                
                if is_bullet:
                    if not in_list:
                        latex += r'\begin{itemize}[leftmargin=0.15in]' + '\n'
                        in_list = True
                    bullet_text = re.sub(r'^[-•–*▪]\s*', '', line)
                    latex += r'  \item ' + escape_latex(bullet_text) + '\n'
                else:
                    if in_list:
                        latex += r'\end{itemize}' + '\n'
                        in_list = False
                    latex += escape_latex(line) + r' \\' + '\n'
            
            if in_list:
                latex += r'\end{itemize}' + '\n'
            
            latex += '\n'
    
    latex += r'\end{document}' + '\n'
    
    return latex
