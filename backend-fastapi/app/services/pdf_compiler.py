"""
PDF Compiler Service
Compiles LaTeX code to PDF using pdflatex
"""

import os
import subprocess
import tempfile
import shutil
from typing import Tuple, Optional
import logging

logger = logging.getLogger(__name__)


class PDFCompilationError(Exception):
    """Raised when PDF compilation fails."""
    def __init__(self, message: str, log_output: str = ""):
        super().__init__(message)
        self.log_output = log_output


def check_pdflatex_available() -> bool:
    """Check if pdflatex is available on the system."""
    try:
        result = subprocess.run(
            ["pdflatex", "--version"],
            capture_output=True,
            text=True,
            timeout=10
        )
        return result.returncode == 0
    except (subprocess.SubprocessError, FileNotFoundError):
        return False


def compile_latex_to_pdf(latex_code: str, timeout: int = 60) -> bytes:
    """
    Compile LaTeX code to PDF.
    
    Args:
        latex_code: Complete LaTeX document as string
        timeout: Maximum time in seconds for compilation
    
    Returns:
        PDF file contents as bytes
    
    Raises:
        PDFCompilationError: If compilation fails
    """
    
    if not check_pdflatex_available():
        raise PDFCompilationError(
            "pdflatex is not available. Please install TeX Live or MiKTeX.",
            "pdflatex command not found in PATH"
        )
    
    # Create temporary directory for compilation
    temp_dir = tempfile.mkdtemp(prefix="resume_latex_")
    
    try:
        # Write LaTeX source
        tex_path = os.path.join(temp_dir, "resume.tex")
        with open(tex_path, "w", encoding="utf-8") as f:
            f.write(latex_code)
        
        # Run pdflatex (twice for references)
        for run in range(2):
            result = subprocess.run(
                [
                    "pdflatex",
                    "-interaction=nonstopmode",
                    "-halt-on-error",
                    "-output-directory", temp_dir,
                    tex_path
                ],
                capture_output=True,
                text=True,
                timeout=timeout,
                cwd=temp_dir
            )
            
            if result.returncode != 0:
                # Extract relevant error messages from log
                log_path = os.path.join(temp_dir, "resume.log")
                log_content = ""
                if os.path.exists(log_path):
                    with open(log_path, "r", encoding="utf-8", errors="ignore") as f:
                        log_content = f.read()
                
                # Find error lines
                error_lines = []
                for line in log_content.split('\n'):
                    if line.startswith('!') or 'Error' in line or 'error' in line:
                        error_lines.append(line)
                
                error_summary = '\n'.join(error_lines[:10]) if error_lines else result.stderr
                
                raise PDFCompilationError(
                    f"LaTeX compilation failed on run {run + 1}",
                    error_summary
                )
        
        # Read generated PDF
        pdf_path = os.path.join(temp_dir, "resume.pdf")
        
        if not os.path.exists(pdf_path):
            raise PDFCompilationError(
                "PDF file was not generated",
                "No output file found after compilation"
            )
        
        with open(pdf_path, "rb") as f:
            pdf_bytes = f.read()
        
        logger.info(f"Successfully compiled PDF ({len(pdf_bytes)} bytes)")
        return pdf_bytes
    
    except subprocess.TimeoutExpired:
        raise PDFCompilationError(
            f"LaTeX compilation timed out after {timeout} seconds",
            "Process exceeded time limit"
        )
    
    finally:
        # Clean up temporary directory
        try:
            shutil.rmtree(temp_dir)
        except Exception as e:
            logger.warning(f"Failed to clean up temp directory: {e}")


async def compile_latex_to_pdf_async(latex_code: str, timeout: int = 60) -> bytes:
    """
    Async wrapper for PDF compilation.
    Runs compilation in a thread pool to avoid blocking.
    """
    import asyncio
    
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None,
        lambda: compile_latex_to_pdf(latex_code, timeout)
    )


# Alternative: Use external API for compilation (no local TeX required)
async def compile_latex_via_api(latex_code: str) -> bytes:
    """
    Compile LaTeX using an external API service.
    Fallback when local pdflatex is not available.
    
    Uses latex.ytotech.com API (free, no auth required).
    """
    import httpx
    
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                "https://latex.ytotech.com/builds/sync",
                json={
                    "compiler": "pdflatex",
                    "resources": [
                        {
                            "main": True,
                            "content": latex_code
                        }
                    ]
                }
            )
            
            if response.status_code == 200:
                return response.content
            else:
                error_text = response.text
                raise PDFCompilationError(
                    f"API compilation failed with status {response.status_code}",
                    error_text
                )
    
    except httpx.TimeoutException:
        raise PDFCompilationError(
            "API compilation timed out",
            "External service did not respond in time"
        )
    except httpx.RequestError as e:
        raise PDFCompilationError(
            f"API request failed: {str(e)}",
            "Network error connecting to compilation service"
        )


async def compile_latex_with_fallback(latex_code: str, timeout: int = 60) -> bytes:
    """
    Try local compilation first, fall back to API if unavailable.
    """
    if check_pdflatex_available():
        return await compile_latex_to_pdf_async(latex_code, timeout)
    else:
        logger.warning("Local pdflatex not available, using external API")
        return await compile_latex_via_api(latex_code)
