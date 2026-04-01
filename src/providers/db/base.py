from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Optional, Dict, Any, Tuple


@dataclass
class ArticleRecord:
    """An article as stored in the database."""
    slug: str
    title: str
    rewritten_content: str
    summary: str
    category: str
    embedding: List[float]
    source_pdfs: List[str]          # filenames of all source PDFs
    published_at: datetime
    importance_score: int = 5
    is_breaking: bool = False       # derived: importance_score >= 9
    website_url: str = ""
    image_url: str = ""
    id: Optional[int] = None


@dataclass
class WeeklyEditionJob:
    """Tracks a weekly newspaper PDF generation job."""
    edition_date: str           # YYYY-MM-DD — the date the edition covers
    status: str = "pending"     # pending | generating | done | failed
    pdf_path: str = ""          # local path or Supabase Storage URL when done
    article_count: int = 0
    requested_at: datetime = field(default_factory=datetime.now)
    generated_at: Optional[datetime] = None
    id: Optional[int] = None


@dataclass
class PDFRecord:
    """A PDF upload record tracked in the database."""
    filename: str
    status: str = "pending"         # pending | processing | processed | failed
    storage_url: str = ""
    article_count: int = 0
    uploaded_at: datetime = field(default_factory=datetime.now)
    processed_at: Optional[datetime] = None
    id: Optional[int] = None


class DBProvider(ABC):
    """
    Abstract base class for database providers.
    SQLiteDBProvider (local dev) and SupabaseDBProvider (production) both implement this.
    """

    @abstractmethod
    def save_article(self, record: ArticleRecord) -> str:
        """
        Persist a rewritten article.
        Returns the slug (may be modified to ensure uniqueness).
        """

    @abstractmethod
    def find_similar_article(self, embedding: List[float], threshold: float) -> Optional[str]:
        """
        Check whether an article with a semantically similar embedding already exists.
        Returns the title of the matching article, or None.
        """

    @abstractmethod
    def get_article(self, slug: str) -> Optional[ArticleRecord]:
        """Fetch a single article by slug."""

    @abstractmethod
    def get_latest_articles(self, limit: int = 20) -> List[ArticleRecord]:
        """Fetch the most recently published articles."""

    @abstractmethod
    def get_articles_by_category(self, category: str, limit: int = 20) -> List[ArticleRecord]:
        """Fetch articles for a given category."""

    @abstractmethod
    def save_pdf_record(self, record: PDFRecord) -> int:
        """Persist a PDF upload record. Returns the assigned id."""

    @abstractmethod
    def update_pdf_status(self, pdf_id: int, status: str, article_count: int = 0) -> None:
        """Update the processing status of a PDF record."""

    @abstractmethod
    def get_pending_pdfs(self) -> List[PDFRecord]:
        """Return all PDFs with status='pending' (used by Supabase storage provider)."""

    def get_processed_filenames(self) -> set:
        """Return a set of filenames that have status='processed'. Used to skip re-processing."""
        return set()

    @abstractmethod
    def save_digest(self, batch_id: str, article_slugs: List[str]) -> None:
        """Record that a digest email was sent for these article slugs."""

    @abstractmethod
    def load_last_digest_slugs(self) -> Optional[List[str]]:
        """Return the article slugs from the most recently saved digest, or None."""

    # ------------------------------------------------------------------
    # Weekly edition jobs
    # ------------------------------------------------------------------

    @abstractmethod
    def get_articles_since(self, since: datetime, limit: int = 60) -> List[ArticleRecord]:
        """Fetch articles published on or after `since`, newest first."""

    @abstractmethod
    def create_weekly_edition_job(self, edition_date: str) -> int:
        """Insert a pending weekly edition job. Returns the job id."""

    @abstractmethod
    def get_pending_weekly_jobs(self) -> List[WeeklyEditionJob]:
        """Return all weekly edition jobs with status='pending'."""

    @abstractmethod
    def update_weekly_edition(
        self, job_id: int, status: str,
        pdf_path: str = "", article_count: int = 0
    ) -> None:
        """Update status, pdf_path, article_count and generated_at for a job."""

    @abstractmethod
    def get_weekly_editions(self, limit: int = 10) -> List[WeeklyEditionJob]:
        """Return the most recent weekly edition jobs, newest first."""

    # ------------------------------------------------------------------
    # Schedules (Python-side read — complements the Next.js write path)
    # ------------------------------------------------------------------

    @abstractmethod
    def get_active_schedules(self) -> List[Dict[str, Any]]:
        """Return all enabled schedules (id, name, cron_expr, last_run)."""

    @abstractmethod
    def update_schedule_last_run(self, schedule_id: int) -> None:
        """Set last_run = now for the given schedule."""

    # ------------------------------------------------------------------
    # Subscribers
    # ------------------------------------------------------------------

    @abstractmethod
    def get_subscribers(self) -> List[Tuple[str, str]]:
        """Return all subscribers as (email, unsubscribe_token) tuples."""

    @abstractmethod
    def add_subscriber(self, email: str, unsubscribe_token: str) -> bool:
        """Add a subscriber. Returns False if email already exists."""

    @abstractmethod
    def remove_subscriber_by_token(self, token: str) -> bool:
        """Remove a subscriber by unsubscribe token. Returns True if found and deleted."""

    def subscriber_exists(self, email: str) -> bool:
        """Check if an email is already subscribed."""
        return False
