"""
Detects the publication date of a newspaper from its filename and PDF metadata.
Used by the pipeline to correctly date-stamp articles and identify stale newspapers.
"""
import re
import logging
from datetime import date
from typing import Optional

logger = logging.getLogger(__name__)

MONTH_NAMES = {
    'january': 1, 'jan': 1,
    'february': 2, 'feb': 2,
    'march': 3, 'mar': 3,
    'april': 4, 'apr': 4,
    'may': 5,
    'june': 6, 'jun': 6,
    'july': 7, 'jul': 7,
    'august': 8, 'aug': 8,
    'september': 9, 'sep': 9, 'sept': 9,
    'october': 10, 'oct': 10,
    'november': 11, 'nov': 11,
    'december': 12, 'dec': 12,
}

MONTH_PATTERN = '|'.join(MONTH_NAMES.keys())


def detect_newspaper_date(filename: str, pdf_bytes: Optional[bytes] = None) -> Optional[date]:
    """
    Try to detect the publication date using these fallbacks in order:
      1. Filename patterns
      2. PDF metadata (creationDate / modDate)
      3. Text content of the first page (works for text-based PDFs)
    Returns a date object or None if all three fail.
    """
    detected = _parse_filename_date(filename)
    if detected:
        logger.info("Detected newspaper date from filename '%s': %s", filename, detected)
        return detected

    if pdf_bytes:
        detected = _parse_pdf_metadata_date(pdf_bytes)
        if detected:
            logger.info("Detected newspaper date from PDF metadata: %s", detected)
            return detected

        detected = _parse_pdf_first_page_text(pdf_bytes)
        if detected:
            logger.info("Detected newspaper date from first page text: %s", detected)
            return detected

    logger.info("Could not detect newspaper date from '%s' via filename/metadata/text", filename)
    return None


def _parse_filename_date(filename: str) -> Optional[date]:
    """
    Try common date patterns found in newspaper filenames.
    Examples handled:
      "The Times UK - 23 March 2026.pdf"
      "The Guardian - March 23 2026.pdf"
      "newspaper-2026-03-23.pdf"
      "paper_23-03-2026.pdf"
    """
    stem = filename.rsplit('.', 1)[0]

    # "23 March 2026" or "23 March, 2026"
    m = re.search(
        rf'(\d{{1,2}})\s+({MONTH_PATTERN})[,\s]+(\d{{4}})',
        stem, re.IGNORECASE
    )
    if m:
        d = _make_date(int(m.group(3)), MONTH_NAMES.get(m.group(2).lower(), 0), int(m.group(1)))
        if d:
            return d

    # "March 23 2026" or "March 23, 2026"
    m = re.search(
        rf'({MONTH_PATTERN})\s+(\d{{1,2}})[,\s]+(\d{{4}})',
        stem, re.IGNORECASE
    )
    if m:
        d = _make_date(int(m.group(3)), MONTH_NAMES.get(m.group(1).lower(), 0), int(m.group(2)))
        if d:
            return d

    # "2026-03-23"
    m = re.search(r'(\d{4})-(\d{2})-(\d{2})', stem)
    if m:
        d = _make_date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        if d:
            return d

    # "23-03-2026" or "23/03/2026"
    m = re.search(r'(\d{2})[-/](\d{2})[-/](\d{4})', stem)
    if m:
        day, month, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if 1 <= month <= 12:
            d = _make_date(year, month, day)
            if d:
                return d

    return None


def _parse_pdf_metadata_date(pdf_bytes: bytes) -> Optional[date]:
    """Extract date from PDF creation/modification metadata."""
    try:
        import fitz
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        metadata = doc.metadata
        doc.close()
        # PDF date format: D:20260323120000+00'00'
        raw = metadata.get('creationDate') or metadata.get('modDate') or ''
        if raw.startswith('D:') and len(raw) >= 10:
            date_str = raw[2:10]
            return _make_date(int(date_str[:4]), int(date_str[4:6]), int(date_str[6:8]))
    except Exception as e:
        logger.debug("PDF metadata date parse failed: %s", e)
    return None


def _parse_pdf_first_page_text(pdf_bytes: bytes) -> Optional[date]:
    """
    Extract the publication date from the text content of the first page.
    Newspapers print their date in the masthead (e.g. 'Tuesday 25 March 2026').
    Only works for text-based PDFs; returns None for scanned/image PDFs.
    """
    try:
        import fitz
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        if not doc.page_count:
            doc.close()
            return None
        # Focus on the top portion of page 1 where the masthead date lives
        page = doc[0]
        text = page.get_text()
        doc.close()
        if not text.strip():
            return None
        # Reuse the same date patterns as filename parsing
        return _parse_filename_date(text)
    except Exception as e:
        logger.debug("PDF first page text date parse failed: %s", e)
    return None


def _make_date(year: int, month: int, day: int) -> Optional[date]:
    try:
        if 2000 <= year <= 2100 and 1 <= month <= 12 and 1 <= day <= 31:
            return date(year, month, day)
    except ValueError:
        pass
    return None
