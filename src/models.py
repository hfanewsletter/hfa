from dataclasses import dataclass, field
from typing import List, Optional
from datetime import datetime


@dataclass
class Article:
    """Represents a raw extracted news article from a PDF."""
    title: str
    content: str          # Full article text
    page_number: int      # Page in the source PDF where article was found
    source_pdf: str       # Absolute path to the source PDF file
    category: str = "General"  # Category assigned by LLM (e.g. Politics, Business, Sports)


@dataclass
class ProcessedArticle:
    """Represents a fully processed article with summary and dedup metadata."""
    article: Article
    summary: str                  # 3-4 line paraphrased summary
    embedding: List[float]        # Vector embedding for semantic dedup
    pdf_link: str                 # URL or file:// link to source PDF
    is_duplicate: bool = False
    duplicate_of: Optional[str] = None   # title of original if duplicate
    processed_at: datetime = field(default_factory=datetime.now)
