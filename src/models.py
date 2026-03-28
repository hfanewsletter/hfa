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
    category: str = "General"       # Category assigned by LLM (e.g. Politics, Business, Sports)
    importance_score: int = 5       # 1-10 score assigned by LLM (1=trivial, 10=historic breaking)


@dataclass
class ProcessedArticle:
    """Represents a fully processed article with summary and dedup metadata."""
    article: Article
    summary: str                  # 4-5 line email summary (generated from rewritten_content)
    embedding: List[float]        # Vector embedding for semantic dedup
    pdf_link: str                 # Website URL for "Read Full Article" link in email
    is_duplicate: bool = False
    duplicate_of: Optional[str] = None   # title of original if duplicate
    rewritten_content: str = ""   # 300-500 word unified article for the website
    processed_at: datetime = field(default_factory=datetime.now)
    importance_score: int = 5       # 1-10 final score (boosted for cross-paper consensus)
    source_pdfs: List[str] = field(default_factory=list)  # all source PDF filenames in the group
