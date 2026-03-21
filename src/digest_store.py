import sqlite3
import logging
import uuid
from datetime import datetime
from typing import List, Optional

from src.models import Article, ProcessedArticle

logger = logging.getLogger(__name__)

DB_PATH = "data/articles.db"


class DigestStore:
    """
    Persists completed digest articles to SQLite so they can be resent
    without reprocessing the PDF (e.g. if email failed).
    """

    def __init__(self):
        self._init_db()

    def _init_db(self) -> None:
        conn = sqlite3.connect(DB_PATH)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS digest_articles (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                batch_id    TEXT NOT NULL,
                title       TEXT NOT NULL,
                summary     TEXT NOT NULL,
                pdf_link    TEXT NOT NULL,
                source_pdf  TEXT NOT NULL,
                page_number INTEGER NOT NULL,
                is_duplicate INTEGER NOT NULL DEFAULT 0,
                created_at  TEXT NOT NULL
            )
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_batch_id ON digest_articles(batch_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_created_at ON digest_articles(created_at)")
        conn.commit()
        conn.close()

    def save_digest(self, articles: List[ProcessedArticle]) -> str:
        """
        Save a list of processed articles as a named batch.
        Returns the batch_id so it can be logged/referenced.
        """
        batch_id = str(uuid.uuid4())
        now = datetime.now().isoformat()
        conn = sqlite3.connect(DB_PATH)
        try:
            conn.executemany(
                """INSERT INTO digest_articles
                   (batch_id, title, summary, pdf_link, source_pdf, page_number, is_duplicate, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                [
                    (
                        batch_id,
                        a.article.title,
                        a.summary,
                        a.pdf_link,
                        a.article.source_pdf,
                        a.article.page_number,
                        int(a.is_duplicate),
                        now,
                    )
                    for a in articles
                ],
            )
            conn.commit()
            logger.info("Saved %d articles to digest store (batch: %s)", len(articles), batch_id)
        finally:
            conn.close()
        return batch_id

    def load_last_digest(self) -> Optional[List[ProcessedArticle]]:
        """
        Load the most recently saved digest batch.
        Returns None if no digests have been saved yet.
        """
        conn = sqlite3.connect(DB_PATH)
        try:
            row = conn.execute(
                "SELECT batch_id FROM digest_articles ORDER BY created_at DESC LIMIT 1"
            ).fetchone()
            if not row:
                return None
            batch_id = row[0]
            rows = conn.execute(
                """SELECT title, summary, pdf_link, source_pdf, page_number, is_duplicate, created_at
                   FROM digest_articles WHERE batch_id = ? ORDER BY id""",
                (batch_id,),
            ).fetchall()
        finally:
            conn.close()

        articles = []
        for title, summary, pdf_link, source_pdf, page_number, is_duplicate, created_at in rows:
            article = Article(
                title=title,
                content="",  # Not stored — not needed for email resend
                page_number=page_number,
                source_pdf=source_pdf,
            )
            articles.append(ProcessedArticle(
                article=article,
                summary=summary,
                embedding=[],  # Not needed for resend
                pdf_link=pdf_link,
                is_duplicate=bool(is_duplicate),
            ))

        logger.info("Loaded %d articles from last digest (batch: %s)", len(articles), batch_id)
        return articles
