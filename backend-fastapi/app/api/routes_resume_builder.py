from fastapi import APIRouter, HTTPException, Header
from fastapi.responses import Response
from pydantic import BaseModel
from typing import Optional
import json
import logging

from supabase_client import supabase
from app.services.latex_service import build_latex, compile_to_pdf

router = APIRouter()
logger = logging.getLogger(__name__)


class GeneratePDFRequest(BaseModel):
    user_id: str


@router.post("/generate-pdf")
async def generate_pdf(
    request: GeneratePDFRequest,
    authorization: Optional[str] = Header(None)
):
    """
    Generate a PDF resume from the user's stored profile.
    Reads user_profile from Supabase, builds LaTeX from Jake's template,
    compiles with Tectonic, returns PDF as downloadable file.
    """
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing authorization header")

    try:
        token = authorization.replace("Bearer ", "")
        user_response = supabase.auth.get_user(token)
        if not user_response or not user_response.user:
            raise HTTPException(status_code=401, detail="Invalid token")

        result = (
            supabase.table("user")
            .select("user_profile, name, email")
            .eq("id", request.user_id)
            .single()
            .execute()
        )

        if not result.data:
            raise HTTPException(status_code=404, detail="User profile not found")

        profile = result.data.get("user_profile") or {}
        if isinstance(profile, str):
            try:
                profile = json.loads(profile)
            except Exception:
                profile = {}

        if not profile.get("name"):
            profile["name"] = result.data.get("name", "")
        if not profile.get("email"):
            profile["email"] = result.data.get("email", "")

        if not profile.get("name"):
            raise HTTPException(
                status_code=400,
                detail="Profile is empty. Please fill in your details in the Resume Builder first."
            )

        logger.info(f"[GENERATE_PDF] Building LaTeX for user {request.user_id}")

        latex_content = build_latex(profile)
        pdf_bytes = compile_to_pdf(latex_content)

        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="resume_{request.user_id[:8]}.pdf"',
                "Content-Length": str(len(pdf_bytes)),
            },
        )

    except HTTPException:
        raise
    except ValueError as exc:
        logger.error(f"[GENERATE_PDF] Compilation error: {exc}")
        raise HTTPException(status_code=500, detail=str(exc))
    except Exception as exc:
        logger.error("[GENERATE_PDF] Unexpected error", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="Failed to generate PDF. Please try again."
        )
