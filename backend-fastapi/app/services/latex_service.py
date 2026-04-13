import logging
import os
import shutil
import subprocess
import tempfile
from typing import Dict, List

logger = logging.getLogger(__name__)


def sanitize(text: str) -> str:
    if not text:
        return ""
    text = str(text)
    if not text.strip():
        return ""
    replacements = {
        "\\": r"\textbackslash{}",
        "&": r"\&",
        "%": r"\%",
        "$": r"\$",
        "#": r"\#",
        "_": r"\_",
        "{": r"\{",
        "}": r"\}",
        "~": r"\textasciitilde{}",
        "^": r"\textasciicircum{}",
    }
    for char, replacement in replacements.items():
        text = text.replace(char, replacement)
    return text


def _sanitize_list(values: List[str]) -> List[str]:
    return [sanitize(value) for value in values if value and str(value).strip()]


def _section_has_content(items: List[str]) -> bool:
    return any(item and str(item).strip() for item in items)


def _clean_text(value: str) -> str:
    return sanitize(value).replace("\n", " ").replace("\r", " ").strip()


def build_latex(profile: Dict) -> str:
    name = _clean_text(profile.get("name", "")) or "Resume"
    phone = _clean_text(profile.get("phone", ""))
    email = _clean_text(profile.get("email", ""))
    linkedin = _clean_text(profile.get("linkedin", ""))
    github = _clean_text(profile.get("github", ""))
    location = _clean_text(profile.get("location", ""))
    intro = _clean_text(profile.get("intro", ""))

    latex_parts: List[str] = [
        r"\documentclass[letterpaper,11pt]{article}",
        r"\usepackage{latexsym}",
        r"\usepackage[empty]{fullpage}",
        r"\usepackage{titlesec}",
        r"\usepackage{marvosym}",
        r"\usepackage[usenames,dvipsnames]{color}",
        r"\usepackage{verbatim}",
        r"\usepackage{enumitem}",
        r"\usepackage[hidelinks]{hyperref}",
        r"\usepackage{fancyhdr}",
        r"\usepackage[english]{babel}",
        r"\usepackage{tabularx}",
        r"\pagestyle{fancy}",
        r"\fancyhf{}",
        r"\fancyfoot{}",
        r"\renewcommand{\headrulewidth}{0pt}",
        r"\renewcommand{\footrulewidth}{0pt}",
        r"\addtolength{\oddsidemargin}{-0.5in}",
        r"\addtolength{\evensidemargin}{-0.5in}",
        r"\addtolength{\textwidth}{1in}",
        r"\addtolength{\topmargin}{-.5in}",
        r"\addtolength{\textheight}{1.0in}",
        r"\urlstyle{same}",
        r"\raggedbottom",
        r"\raggedright",
        r"\setlength{\tabcolsep}{0in}",
        r"\titleformat{\section}{\vspace{-4pt}\scshape\raggedright\large}{}{0em}{}[\color{black}\titlerule \vspace{-5pt}]",
        r"\newcommand{\resumeItem}[1]{\item\small{#1 \vspace{-2pt}}}",
        r"\newcommand{\resumeSubheading}[4]{\vspace{-2pt}\item\begin{tabular*}{0.97\textwidth}[t]{l@{\extracolsep{\fill}}r}\textbf{#1} & #2 \\\\\textit{\small#3} & \textit{\small #4} \\\\\end{tabular*}\vspace{-7pt}}",
        r"\newcommand{\resumeProjectHeading}[2]{\item\begin{tabular*}{0.97\textwidth}{l@{\extracolsep{\fill}}r}\small#1 & #2 \\\\\end{tabular*}\vspace{-7pt}}",
        r"\newcommand{\resumeSubItem}[1]{\resumeItem{#1}\vspace{-4pt}}",
        r"\renewcommand\labelitemii{$\vcenter{\hbox{\tiny$\bullet$}}$}",
        r"\newcommand{\resumeSubHeadingListStart}{\begin{itemize}[leftmargin=0.15in, label={}]}",
        r"\newcommand{\resumeSubHeadingListEnd}{\end{itemize}}",
        r"\newcommand{\resumeItemListStart}{\begin{itemize}}",
        r"\newcommand{\resumeItemListEnd}{\end{itemize}\vspace{-5pt}}",
        r"\begin{document}",
    ]

    header_bits = []
    if phone:
        header_bits.append(phone)
    if email:
        header_bits.append(rf"\href{{mailto:{email}}}{{\underline{{{email}}}}}")
    if linkedin:
        header_bits.append(rf"\href{{{linkedin}}}{{\underline{{{linkedin}}}}}")
    if github:
        header_bits.append(rf"\href{{{github}}}{{\underline{{{github}}}}}")
    if location:
        header_bits.append(location)

    header_line = " $|$ ".join(header_bits)
    latex_parts.append(r"\begin{center}")
    latex_parts.append(rf"    \textbf{{\Huge \scshape {name}}}")
    if header_line:
        latex_parts.append(rf"    \\ \vspace{{1pt}} \small {header_line}")
    latex_parts.append(r"\end{center}")

    if intro:
        latex_parts.append(r"\section{Summary}")
        latex_parts.append(r"\resumeSubHeadingListStart")
        latex_parts.append(rf"\resumeItem{{{intro}}}")
        latex_parts.append(r"\resumeSubHeadingListEnd")

    def _clean_list(values: List[str]) -> List[str]:
        return [
            _clean_text(value)
            for value in values
            if value and str(value).strip()
        ]

    education_entries = profile.get("education_entries") or []
    if isinstance(education_entries, list) and education_entries:
        education_lines = [r"\section{Education}", r"\resumeSubHeadingListStart"]
        has_education = False
        for entry in education_entries:
            institution = _clean_text(entry.get("institution", ""))
            degree = _clean_text(entry.get("degree", ""))
            date_range = _clean_text(entry.get("date_range", ""))
            grade = _clean_text(entry.get("grade", ""))
            if not any([institution, degree, date_range, grade]):
                continue
            has_education = True
            education_lines.append(
                rf"\resumeSubheading{{{institution}}}{{{date_range}}}{{{degree}}}{{{grade}}}"
            )
        if has_education:
            education_lines.append(r"\resumeSubHeadingListEnd")
            latex_parts.extend(education_lines)

    experience_entries = profile.get("experience_entries") or []
    if isinstance(experience_entries, list) and experience_entries:
        experience_lines = [r"\section{Experience}", r"\resumeSubHeadingListStart"]
        has_experience = False
        for entry in experience_entries:
            title = _clean_text(entry.get("title", ""))
            company = _clean_text(entry.get("company", ""))
            location_entry = _clean_text(entry.get("location", ""))
            date_range = _clean_text(entry.get("date_range", ""))
            bullets = _clean_list(entry.get("bullets", []) or [])
            if not any([title, company, location_entry, date_range, bullets]):
                continue
            has_experience = True
            experience_lines.append(
                rf"\resumeSubheading{{{title}}}{{{date_range}}}{{{company}}}{{{location_entry}}}"
            )
            if bullets:
                experience_lines.append(r"\resumeItemListStart")
                for bullet in bullets:
                    experience_lines.append(rf"\resumeItem{{{bullet}}}")
                experience_lines.append(r"\resumeItemListEnd")
        if has_experience:
            experience_lines.append(r"\resumeSubHeadingListEnd")
            latex_parts.extend(experience_lines)

    project_entries = profile.get("project_entries") or []
    if isinstance(project_entries, list) and project_entries:
        project_lines = [r"\section{Projects}", r"\resumeSubHeadingListStart"]
        has_projects = False
        for entry in project_entries:
            project_name = _clean_text(entry.get("name", ""))
            tech_stack = _clean_text(entry.get("tech_stack", ""))
            date_range = _clean_text(entry.get("date_range", ""))
            links = _clean_text(entry.get("links", ""))
            bullets = _clean_list(entry.get("bullets", []) or [])
            if not any([project_name, tech_stack, date_range, links, bullets]):
                continue

            has_projects = True
            heading_parts = []
            if project_name:
                heading_parts.append(rf"\textbf{{{project_name}}}")
            if tech_stack:
                heading_parts.append(rf"\emph{{\small {tech_stack}}}")
            if links:
                heading_parts.append(rf"\href{{{links}}}{{\underline{{{links}}}}}")
            heading_text = " $|$ ".join(heading_parts)
            project_lines.append(
                rf"\resumeProjectHeading{{{heading_text}}}{{{date_range}}}"
            )
            if bullets:
                project_lines.append(r"\resumeItemListStart")
                for bullet in bullets:
                    project_lines.append(rf"\resumeItem{{{bullet}}}")
                project_lines.append(r"\resumeItemListEnd")
        if has_projects:
            project_lines.append(r"\resumeSubHeadingListEnd")
            latex_parts.extend(project_lines)

    skills = profile.get("skills") or []
    if isinstance(skills, list):
        skills = _clean_list(skills)
    elif isinstance(skills, str):
        skills = _clean_list([item.strip() for item in skills.split(",")])
    else:
        skills = []

    if _section_has_content(skills):
        latex_parts.append(r"\section{Technical Skills}")
        latex_parts.append(rf"\textbf{{Skills}}{{: {', '.join(skills)}}}")

    certifications_raw = _clean_text(profile.get("certifications", ""))
    certifications = [line.strip() for line in certifications_raw.split("\n") if line.strip()]
    if certifications:
        latex_parts.append(r"\section{Certifications}")
        latex_parts.append(r"\resumeSubHeadingListStart")
        for item in certifications:
            latex_parts.append(rf"\resumeItem{{{item}}}")
        latex_parts.append(r"\resumeSubHeadingListEnd")

    coursework = _clean_text(profile.get("coursework", ""))
    if coursework:
        latex_parts.append(r"\section{Coursework}")
        latex_parts.append(r"\resumeSubHeadingListStart")
        latex_parts.append(rf"\resumeItem{{{coursework}}}")
        latex_parts.append(r"\resumeSubHeadingListEnd")

    latex_parts.append(r"\end{document}")

    return "\n".join(latex_parts)


def compile_to_pdf(latex_content: str) -> bytes:
    if not shutil.which("tectonic"):
        raise ValueError(
            "Tectonic is not installed on this server. "
            "Please install it before generating PDFs."
        )

    with tempfile.TemporaryDirectory() as tmpdir:
        tex_path = os.path.join(tmpdir, "resume.tex")
        pdf_path = os.path.join(tmpdir, "resume.pdf")

        with open(tex_path, "w", encoding="utf-8") as file_handle:
            file_handle.write(latex_content)

        logger.info("[LATEX] Starting Tectonic compilation")

        result = subprocess.run(
            ["tectonic", "-X", "compile", tex_path, "--outdir", tmpdir],
            capture_output=True,
            timeout=60,
            cwd=tmpdir,
        )

        if result.returncode != 0:
            error_msg = result.stderr.decode("utf-8", errors="replace")
            numbered_lines = []
            for idx, line in enumerate(latex_content.splitlines(), start=1):
                if idx > 200:
                    numbered_lines.append("...truncated...")
                    break
                numbered_lines.append(f"{idx:03d}: {line}")
            logger.error(
                "[LATEX] Compilation failed: %s\n[LATEX] Content:\n%s",
                error_msg,
                "\n".join(numbered_lines),
            )
            raise ValueError(
                "PDF compilation failed. Please check your content for special characters."
            )

        if not os.path.exists(pdf_path):
            raise ValueError("PDF file was not generated after compilation.")

        with open(pdf_path, "rb") as file_handle:
            pdf_bytes = file_handle.read()

        logger.info(f"[LATEX] PDF generated successfully, size: {len(pdf_bytes)} bytes")
        return pdf_bytes
