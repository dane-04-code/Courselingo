import os
import logging
from pathlib import Path
from typing import Annotated

import fitz
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from services.pdf_parser import extract_text_blocks, get_page_dimensions
from services.docx_parser import extract_text_segments
from services.deepl import translate_blocks, TranslationError
from services.pdf_builder import build_translated_pdf
from services.docx_builder import build_translated_docx

# ── Bootstrap ────────────────────────────────────────────────────────
# Look for .env in the backend dir first, then fall back to the project root
_backend_dir = Path(__file__).resolve().parent
_env_path = _backend_dir / ".env"
if not _env_path.exists():
    _env_path = _backend_dir.parent / ".env"
load_dotenv(dotenv_path=_env_path)

logger = logging.getLogger("pdf_translate")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="PDF Translation API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "http://localhost:3002", "http://localhost:3003"],
    allow_origin_regex=r"http://localhost:\d+",
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

# ── Constants ────────────────────────────────────────────────────────
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB
ALLOWED_CONTENT_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
DOCX_CONTENT_TYPES = {
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


# ── File-type handlers ───────────────────────────────────────────────
def _handle_pdf(
    file_bytes: bytes, target_lang: str, api_key: str
) -> tuple[bytes, str, str]:
    """Parse → translate → rebuild a PDF. Returns (bytes, extension, media_type)."""
    try:
        blocks = extract_text_blocks(file_bytes)
        page_dims = get_page_dimensions(file_bytes)
    except Exception as exc:
        logger.exception("PDF parsing failed")
        raise HTTPException(status_code=422, detail=f"Failed to parse PDF: {exc}")

    if not blocks:
        raise HTTPException(status_code=422, detail="No extractable text found in the PDF.")

    logger.info("Extracted %d text blocks across %d pages", len(blocks), len(page_dims))

    try:
        translated_blocks = translate_blocks(blocks, target_lang, api_key)
    except TranslationError as exc:
        logger.exception("Translation failed")
        raise HTTPException(status_code=502, detail=f"Translation service error: {exc}")
    except Exception as exc:
        logger.exception("Unexpected error during translation")
        raise HTTPException(status_code=500, detail=f"Unexpected error during translation: {exc}")

    try:
        output = build_translated_pdf(translated_blocks, page_dims, file_bytes)
    except Exception as exc:
        logger.exception("PDF reconstruction failed")
        raise HTTPException(status_code=500, detail=f"Failed to build translated PDF: {exc}")

    return output, ".pdf", "application/pdf"


def _handle_docx(
    file_bytes: bytes, target_lang: str, api_key: str
) -> tuple[bytes, str, str]:
    """Parse → translate → rebuild a DOCX. Returns (bytes, extension, media_type)."""
    try:
        segments = extract_text_segments(file_bytes)
    except Exception as exc:
        logger.exception("DOCX parsing failed")
        raise HTTPException(status_code=422, detail=f"Failed to parse DOCX: {exc}")

    if not segments:
        raise HTTPException(status_code=422, detail="No extractable text found in the DOCX.")

    logger.info("Extracted %d text segments from DOCX", len(segments))

    try:
        translated_segments = translate_blocks(segments, target_lang, api_key)
    except TranslationError as exc:
        logger.exception("Translation failed")
        raise HTTPException(status_code=502, detail=f"Translation service error: {exc}")
    except Exception as exc:
        logger.exception("Unexpected error during translation")
        raise HTTPException(status_code=500, detail=f"Unexpected error during translation: {exc}")

    try:
        output = build_translated_docx(file_bytes, translated_segments)
    except Exception as exc:
        logger.exception("DOCX reconstruction failed")
        raise HTTPException(status_code=500, detail=f"Failed to build translated DOCX: {exc}")

    return (
        output,
        ".docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


def _pages_to_credits(n: int) -> int:
    """Map page count to credit cost. Raises ValueError if over 300-page cap."""
    if n > 300:
        raise ValueError("Document exceeds the 300-page limit.")
    if n <= 25:  return 1
    if n <= 75:  return 2
    if n <= 150: return 3
    return 4


# ── Health check ─────────────────────────────────────────────────────
@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


# ── Estimate endpoint ────────────────────────────────────────────────
@app.post("/estimate")
async def estimate_characters(file: UploadFile = File(...)):
    """Return page count, character count, and credit cost without translating."""
    content = await file.read()

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File exceeds 20 MB limit.")

    name = (file.filename or "").lower()

    if name.endswith(".pdf"):
        try:
            with fitz.open(stream=content, filetype="pdf") as doc:
                page_count = doc.page_count
            blocks = extract_text_blocks(content)
            total_chars = sum(len(b["text"]) for b in blocks)
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"Failed to read PDF: {exc}")

    elif name.endswith(".docx"):
        try:
            segs = extract_text_segments(content)
            total_chars = sum(len(s["text"]) for s in segs)
            # DOCX has no native page count — estimate from paragraph count
            page_count = max(1, len(segs) // 20)
        except Exception as exc:
            raise HTTPException(status_code=422, detail=f"Failed to read DOCX: {exc}")

    else:
        raise HTTPException(status_code=400, detail="Only PDF and DOCX files are supported.")

    if name.endswith(".pdf"):
        try:
            credits = _pages_to_credits(page_count)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
    else:
        # DOCX: page_count is a rough estimate; cap credits at 4, don't hard-reject
        credits = min(_pages_to_credits(min(page_count, 300)), 4)

    return {
        "char_count": total_chars,
        "page_count": page_count,
        "credits_required": credits,
    }


# ── Translate endpoint ───────────────────────────────────────────────
@app.post("/translate")
async def translate_document(
    file: Annotated[UploadFile, File(description="PDF or DOCX file to translate")],
    target_lang: Annotated[
        str,
        Form(description="Target language code (e.g. DE, FR, ES, EN-US)"),
    ] = "EN-US",
) -> Response:
    """
    Accept a PDF or DOCX upload, translate every text block via DeepL,
    and return a new file that preserves the original layout/formatting.
    """

    # 1) Validate API key is configured
    api_key = os.getenv("DEEPL_API_KEY", "")
    if not api_key or api_key == "your_deepl_api_key_here":
        logger.error("DEEPL_API_KEY is not configured")
        raise HTTPException(
            status_code=500,
            detail="Server misconfiguration: DEEPL_API_KEY is not set.",
        )

    # 2) Validate uploaded file
    # Detect file type — also allow by extension as fallback
    content_type = file.content_type or ""
    filename_lower = (file.filename or "").lower()
    is_docx = content_type in DOCX_CONTENT_TYPES or filename_lower.endswith(".docx")
    is_pdf = content_type == "application/pdf" or filename_lower.endswith(".pdf")

    if not is_pdf and not is_docx:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type '{content_type}'. Only PDF and DOCX files are accepted.",
        )

    # 3) Read file bytes
    try:
        file_bytes = await file.read()
    except Exception as exc:
        logger.exception("Failed to read uploaded file")
        raise HTTPException(status_code=400, detail=f"Could not read uploaded file: {exc}")

    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum allowed size is {MAX_FILE_SIZE // (1024 * 1024)} MB.",
        )

    # Enforce 300-page cap for PDFs
    if is_pdf:
        try:
            with fitz.open(stream=file_bytes, filetype="pdf") as _doc:
                _page_count = _doc.page_count
            _pages_to_credits(_page_count)  # raises ValueError if > 300
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    # ── Branch: DOCX vs PDF ──────────────────────────────────────
    if is_docx:
        output_bytes, out_ext, media = _handle_docx(file_bytes, target_lang, api_key)
    else:
        output_bytes, out_ext, media = _handle_pdf(file_bytes, target_lang, api_key)

    # 6) Build safe filename & return
    raw_name = file.filename or "document"
    if raw_name.lower().endswith((".pdf", ".docx")):
        raw_name = raw_name.rsplit(".", 1)[0]

    output_filename = f"{raw_name}_translated{out_ext}"
    output_filename = output_filename.encode("ascii", errors="ignore").decode("ascii")
    output_filename = output_filename.replace('"', "_").replace("\\", "_")
    if not output_filename.endswith(out_ext):
        output_filename = f"translated{out_ext}"

    logger.info("Returning translated file: %s", output_filename)

    return Response(
        content=output_bytes,
        media_type=media,
        headers={
            "Content-Disposition": f'attachment; filename="{output_filename}"'
        },
    )
