import logging
from typing import List

from src.models import Article
from src.providers.llm.base import LLMProvider
from src.pdf_processor import PDFProcessor

logger = logging.getLogger(__name__)


class ArticleExtractor:
    """
    Orchestrates PDF content extraction and LLM-based article segmentation.
    Combines PDFProcessor (raw content) with LLMProvider (intelligent parsing).
    """

    def __init__(self, llm_provider: LLMProvider):
        self.llm = llm_provider
        self.pdf_processor = PDFProcessor()

    def extract_from_pdf(self, pdf_bytes: bytes, source_pdf: str) -> List[Article]:
        """
        Full extraction pipeline for a single PDF file.

        1. PDFProcessor detects text vs image-based and extracts raw content
        2. LLMProvider identifies and segments news articles from the content

        Returns list of Article objects (news/editorial only, no ads).
        """
        logger.info("Extracting articles from: %s", source_pdf)

        # Step 1: Extract raw content from PDF
        content = self.pdf_processor.extract_content(pdf_bytes, source_pdf)

        # Step 2: Use LLM to identify and extract articles
        content_type = content["type"]
        articles = self.llm.extract_articles(content)

        # Free the page content (potentially large image buffers) as soon as the LLM
        # is done — don't wait for Python's GC to eventually collect it.
        del content

        logger.info(
            "Extracted %d articles from %s (type: %s)",
            len(articles), source_pdf, content_type
        )
        return articles

    def extract_from_multiple_pdfs(
        self,
        pdf_files: List[tuple]  # List of (pdf_bytes, source_pdf_path)
    ) -> List[Article]:
        """
        Extract articles from multiple PDFs.
        Returns a flat list of all articles across all PDFs.
        """
        all_articles = []
        for pdf_bytes, source_pdf in pdf_files:
            try:
                articles = self.extract_from_pdf(pdf_bytes, source_pdf)
                all_articles.extend(articles)
            except Exception as e:
                logger.error("Failed to extract articles from %s: %s", source_pdf, e, exc_info=True)

        logger.info(
            "Total extracted: %d articles from %d PDFs",
            len(all_articles), len(pdf_files)
        )
        return all_articles
