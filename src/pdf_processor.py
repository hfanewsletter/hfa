import fitz  # PyMuPDF
import logging
import io
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

# If average characters per page is below this, treat as image-based PDF
TEXT_DENSITY_THRESHOLD = 100


class UnprocessablePDFError(Exception):
    """
    Raised when a PDF can never be processed no matter how many times we retry:
    password-protected / encrypted, or structurally corrupt.

    The pipeline treats this differently from a transient failure (rate limit,
    network error): the file is moved out of the inbox into failed/ so it stops
    looping the watcher on every poll cycle.
    """


class PDFProcessor:
    """
    Extracts content from PDF files.
    Automatically detects whether a PDF is text-based or image-based (scanned).
    """

    def extract_content(self, pdf_bytes: bytes, source_pdf: str) -> Dict[str, Any]:
        """
        Extract content from PDF bytes.

        Returns a dict suitable for passing to LLMProvider.extract_articles():
        {
            "type": "text" | "image",
            "pages": [...],
            "source_pdf": str
        }
        """
        try:
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        except Exception as e:
            # fitz couldn't even open the file — it's corrupt/not a real PDF.
            raise UnprocessablePDFError(
                f"Cannot open PDF '{source_pdf}': {e}"
            ) from e

        # Password-protected PDFs can be opened but not read. `needs_pass` means a
        # real password is required (vs. empty-password "encryption" that fitz
        # auto-decrypts, which is common and perfectly readable). Fail fast with a
        # clear, permanent error instead of crashing mid-iteration.
        if getattr(doc, "needs_pass", False):
            doc.close()
            raise UnprocessablePDFError(
                f"PDF '{source_pdf}' is password-protected — cannot process."
            )

        try:
            if self._is_image_based(doc):
                logger.info("Detected image-based PDF: %s (%d pages)", source_pdf, len(doc))
                pages = self._extract_as_images(doc)
                return {"type": "image", "pages": pages, "source_pdf": source_pdf}
            else:
                logger.info("Detected text-based PDF: %s (%d pages)", source_pdf, len(doc))
                pages = self._extract_as_text(doc)
                return {"type": "text", "pages": pages, "source_pdf": source_pdf}
        except ValueError as e:
            # Safety net: pymupdf raises "document closed or encrypted" while
            # iterating pages of an encrypted/corrupt PDF that slipped past the
            # needs_pass check above. Treat as permanent so it leaves the inbox.
            if "encrypted" in str(e).lower() or "closed" in str(e).lower():
                raise UnprocessablePDFError(
                    f"PDF '{source_pdf}' is encrypted or corrupt: {e}"
                ) from e
            raise
        finally:
            doc.close()

    def _is_image_based(self, doc: fitz.Document) -> bool:
        """
        Heuristic: if average text per page is below threshold, treat as image-based.
        Also checks if pages contain embedded images with minimal text.
        """
        total_chars = 0
        for page in doc:
            text = page.get_text()
            total_chars += len(text.strip())

        avg_chars = total_chars / max(len(doc), 1)
        logger.debug("Average chars per page: %.1f (threshold: %d)", avg_chars, TEXT_DENSITY_THRESHOLD)
        return avg_chars < TEXT_DENSITY_THRESHOLD

    def _extract_as_text(self, doc: fitz.Document) -> List[Dict]:
        """Extract text from each page of a text-based PDF."""
        pages = []
        for page_num, page in enumerate(doc, start=1):
            # Use "text" mode for clean paragraph extraction
            text = page.get_text("text")
            pages.append({
                "page_num": page_num,
                "text": text.strip(),
            })
        return pages

    def render_first_page(self, pdf_bytes: bytes) -> Optional[bytes]:
        """
        Render the first page as a PNG image.
        Used as a fallback for LLM-based newspaper date extraction on image PDFs.
        """
        try:
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            try:
                if not doc.page_count:
                    return None
                pixmap = doc[0].get_pixmap(matrix=fitz.Matrix(1.5, 1.5))
                return pixmap.tobytes("png")
            finally:
                doc.close()
        except Exception as e:
            logger.debug("Could not render first page: %s", e)
        return None

    def extract_page_thumbnail(
        self, pdf_bytes: bytes, page_number: int, target_width: int = 800
    ) -> Optional[bytes]:
        """
        Render a page and crop it to a 16:9 header image.
        Returns JPEG bytes, or None on failure.
        page_number is 1-indexed.
        """
        try:
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            try:
                idx = max(0, min(page_number - 1, len(doc) - 1))
                page = doc[idx]
                scale = target_width / page.rect.width
                # Crop to 16:9 from the top (in page-space coordinates)
                crop_height_pts = page.rect.width * 9 / 16
                clip = fitz.Rect(0, 0, page.rect.width, min(page.rect.height, crop_height_pts))
                matrix = fitz.Matrix(scale, scale)
                pixmap = page.get_pixmap(matrix=matrix, clip=clip)
                return pixmap.tobytes("jpeg")
            finally:
                doc.close()
        except Exception as e:
            logger.warning("Could not extract thumbnail from page %d: %s", page_number, e)
            return None

    def _extract_as_images(self, doc: fitz.Document) -> List[Dict]:
        """
        Render each page as a high-resolution image for Gemini Vision.
        Uses 2x zoom for better OCR accuracy on small newspaper text.
        """
        pages = []
        zoom_matrix = fitz.Matrix(2.0, 2.0)  # 2x zoom = ~144 DPI

        for page_num, page in enumerate(doc, start=1):
            pixmap = page.get_pixmap(matrix=zoom_matrix)
            # Convert to PNG bytes and immediately release the pixmap — it holds a large
            # native memory buffer that Python's GC won't reclaim until del is called.
            img_bytes = pixmap.tobytes("png")
            del pixmap
            pages.append({
                "page_num": page_num,
                "image_bytes": img_bytes,
            })
            logger.debug("Rendered page %d as image (%d bytes)", page_num, len(img_bytes))

        return pages
