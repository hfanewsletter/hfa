from abc import ABC, abstractmethod
from datetime import date
from typing import List, Dict, Any, Optional
from src.models import Article


class LLMProvider(ABC):
    """
    Abstract base class for LLM providers.
    Implement this interface to add a new provider (e.g., OpenAI, Anthropic).
    """

    @abstractmethod
    def extract_articles(self, content: Dict[str, Any]) -> List[Article]:
        """
        Extract news/editorial articles from PDF page content.

        Args:
            content: {
                "type": "text" | "image",
                "pages": list of page dicts,
                "source_pdf": str (path to source PDF)
            }
            For type "text":
                pages = [{"page_num": int, "text": str}, ...]
            For type "image":
                pages = [{"page_num": int, "image_bytes": bytes}, ...]

        Returns:
            List of Article objects. Only news/editorial articles, no ads or classifieds.
        """

    @abstractmethod
    def get_embedding(self, text: str) -> List[float]:
        """
        Get a vector embedding for the given text.
        Used for semantic duplicate detection via cosine similarity.
        """

    @abstractmethod
    def rewrite_articles(self, articles: List[Article]) -> str:
        """
        Rewrite one or more versions of the same news story into a single, unified
        300-500 word article in the publication's own voice.

        When multiple articles are provided they cover the same event from different
        newspapers/perspectives. The output must be factually accurate, unbiased, and
        present all significant viewpoints without favouring any one source.

        Returns a plain string (the rewritten article body, no title).
        """

    @abstractmethod
    def extract_newspaper_date(self, first_page_image: bytes) -> Optional[date]:
        """
        Extract the publication date from a newspaper's front-page image.
        Called when filename and text-based detection both fail (image/scanned PDFs).
        Returns a date object, or None if the date cannot be determined.
        """

    @abstractmethod
    def summarize(self, rewritten_content: str) -> str:
        """
        Summarize the rewritten article into 4-5 sentences for the email digest.
        Must paraphrase — do not copy sentences verbatim.
        Returns a plain string (the summary).
        """
