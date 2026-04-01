import json
import logging
import os
import sqlite3
from datetime import datetime
from typing import List, Optional, Dict, Any

import numpy as np
from sklearn.metrics.pairwise import cosine_similarity

from src.providers.db.base import ArticleRecord, DBProvider, PDFRecord, WeeklyEditionJob

logger = logging.getLogger(__name__)

DB_PATH = "data/articles.db"


class SQLiteDBProvider(DBProvider):
    """
    SQLite implementation of DBProvider for local development.
    No cloud credentials required — data lives in data/articles.db.
    """

    def __init__(self, db_path: str = DB_PATH):
        self.db_path = db_path
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        conn = self._connect()
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS articles (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                slug             TEXT    UNIQUE NOT NULL,
                title            TEXT    NOT NULL,
                rewritten_content TEXT   NOT NULL,
                summary          TEXT    NOT NULL,
                category         TEXT    NOT NULL DEFAULT 'General',
                embedding_json   TEXT    NOT NULL,
                source_pdfs_json TEXT    NOT NULL DEFAULT '[]',
                published_at     TEXT    NOT NULL,
                is_breaking      INTEGER NOT NULL DEFAULT 0,
                website_url      TEXT    NOT NULL DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS pdfs (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                filename     TEXT    NOT NULL,
                storage_url  TEXT    NOT NULL DEFAULT '',
                status       TEXT    NOT NULL DEFAULT 'pending',
                article_count INTEGER NOT NULL DEFAULT 0,
                uploaded_at  TEXT    NOT NULL,
                processed_at TEXT
            );

            CREATE TABLE IF NOT EXISTS digests (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                batch_id      TEXT    UNIQUE NOT NULL,
                article_slugs TEXT    NOT NULL,
                sent_at       TEXT    NOT NULL
            );

            -- Legacy tables kept for backward compatibility
            CREATE TABLE IF NOT EXISTS processed_articles (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                title         TEXT    NOT NULL,
                content_hash  TEXT    NOT NULL,
                embedding_json TEXT   NOT NULL,
                source_pdf    TEXT    NOT NULL,
                page_number   INTEGER NOT NULL,
                processed_at  TEXT    NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_content_hash
                ON processed_articles(content_hash);

            CREATE TABLE IF NOT EXISTS digest_articles (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                batch_id     TEXT    NOT NULL,
                title        TEXT    NOT NULL,
                summary      TEXT    NOT NULL,
                pdf_link     TEXT    NOT NULL,
                source_pdf   TEXT    NOT NULL,
                page_number  INTEGER NOT NULL,
                is_duplicate INTEGER NOT NULL DEFAULT 0,
                created_at   TEXT    NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_batch_id ON digest_articles(batch_id);
            CREATE INDEX IF NOT EXISTS idx_created_at ON digest_articles(created_at);

            CREATE TABLE IF NOT EXISTS weekly_editions (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                edition_date  TEXT    NOT NULL,
                status        TEXT    NOT NULL DEFAULT 'pending',
                pdf_path      TEXT    NOT NULL DEFAULT '',
                article_count INTEGER NOT NULL DEFAULT 0,
                requested_at  TEXT    NOT NULL,
                generated_at  TEXT
            );

            CREATE TABLE IF NOT EXISTS schedules (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                name       TEXT    NOT NULL,
                cron_expr  TEXT    NOT NULL,
                task       TEXT    NOT NULL DEFAULT 'weekly_edition',
                enabled    INTEGER NOT NULL DEFAULT 1,
                last_run   TEXT,
                created_at TEXT    NOT NULL
            );

            CREATE TABLE IF NOT EXISTS subscribers (
                id                INTEGER PRIMARY KEY AUTOINCREMENT,
                email             TEXT    UNIQUE NOT NULL,
                unsubscribe_token TEXT    UNIQUE NOT NULL,
                subscribed_at     TEXT    NOT NULL
            );
        """)
        conn.commit()
        # Migrations: add new columns to existing tables idempotently
        for migration in [
            "ALTER TABLE articles ADD COLUMN image_url TEXT NOT NULL DEFAULT ''",
            "ALTER TABLE articles ADD COLUMN importance_score INTEGER NOT NULL DEFAULT 5",
        ]:
            try:
                conn.execute(migration)
                conn.commit()
            except sqlite3.OperationalError:
                pass  # Column already exists
        conn.close()

    # ------------------------------------------------------------------
    # Articles
    # ------------------------------------------------------------------

    def save_article(self, record: ArticleRecord) -> str:
        slug = self._unique_slug(record.slug)
        conn = self._connect()
        try:
            conn.execute(
                """INSERT OR REPLACE INTO articles
                   (slug, title, rewritten_content, summary, category,
                    embedding_json, source_pdfs_json, published_at,
                    importance_score, is_breaking, website_url, image_url)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    slug,
                    record.title,
                    record.rewritten_content,
                    record.summary,
                    record.category,
                    json.dumps(record.embedding),
                    json.dumps(record.source_pdfs),
                    record.published_at.isoformat(),
                    record.importance_score,
                    int(record.is_breaking),
                    record.website_url,
                    record.image_url,
                ),
            )
            conn.commit()
        finally:
            conn.close()
        return slug

    def _unique_slug(self, base_slug: str) -> str:
        """Append a counter to slug if it already exists."""
        conn = self._connect()
        try:
            existing = conn.execute(
                "SELECT slug FROM articles WHERE slug LIKE ?", (f"{base_slug}%",)
            ).fetchall()
        finally:
            conn.close()

        taken = {row["slug"] for row in existing}
        if base_slug not in taken:
            return base_slug
        counter = 2
        while f"{base_slug}-{counter}" in taken:
            counter += 1
        return f"{base_slug}-{counter}"

    def find_similar_article(self, embedding: List[float], threshold: float) -> Optional[str]:
        conn = self._connect()
        rows = conn.execute("SELECT title, embedding_json FROM articles").fetchall()
        conn.close()

        if not rows:
            return None

        stored_vecs = np.array([json.loads(r["embedding_json"]) for r in rows])
        query_vec = np.array(embedding).reshape(1, -1)
        sims = cosine_similarity(query_vec, stored_vecs)[0]
        max_idx = int(np.argmax(sims))

        if float(sims[max_idx]) >= threshold:
            return rows[max_idx]["title"]
        return None

    def get_article(self, slug: str) -> Optional[ArticleRecord]:
        conn = self._connect()
        row = conn.execute("SELECT * FROM articles WHERE slug = ?", (slug,)).fetchone()
        conn.close()
        return self._row_to_article(row) if row else None

    def get_latest_articles(self, limit: int = 20) -> List[ArticleRecord]:
        conn = self._connect()
        rows = conn.execute(
            "SELECT * FROM articles ORDER BY importance_score DESC, published_at DESC LIMIT ?", (limit,)
        ).fetchall()
        conn.close()
        return [self._row_to_article(r) for r in rows]

    def get_articles_by_category(self, category: str, limit: int = 20) -> List[ArticleRecord]:
        conn = self._connect()
        rows = conn.execute(
            "SELECT * FROM articles WHERE category = ? ORDER BY published_at DESC LIMIT ?",
            (category, limit),
        ).fetchall()
        conn.close()
        return [self._row_to_article(r) for r in rows]

    def _row_to_article(self, row: sqlite3.Row) -> ArticleRecord:
        row_dict = dict(row)
        importance_score = int(row_dict.get("importance_score") or 5)
        return ArticleRecord(
            id=row_dict["id"],
            slug=row_dict["slug"],
            title=row_dict["title"],
            rewritten_content=row_dict["rewritten_content"],
            summary=row_dict["summary"],
            category=row_dict["category"],
            embedding=json.loads(row_dict["embedding_json"]),
            source_pdfs=json.loads(row_dict["source_pdfs_json"]),
            published_at=datetime.fromisoformat(row_dict["published_at"]),
            importance_score=importance_score,
            is_breaking=importance_score >= 9,
            website_url=row_dict.get("website_url", ""),
            image_url=row_dict.get("image_url", ""),
        )

    # ------------------------------------------------------------------
    # PDFs
    # ------------------------------------------------------------------

    def save_pdf_record(self, record: PDFRecord) -> int:
        conn = self._connect()
        try:
            # Try to find and update an existing record (created by the web UI upload)
            row = conn.execute(
                "SELECT id FROM pdfs WHERE filename = ? AND status IN ('pending', 'processing') ORDER BY uploaded_at DESC LIMIT 1",
                (record.filename,),
            ).fetchone()
            if row:
                conn.execute(
                    "UPDATE pdfs SET status = ?, article_count = ? WHERE id = ?",
                    (record.status, record.article_count, row["id"]),
                )
                conn.commit()
                return row["id"]

            cursor = conn.execute(
                """INSERT INTO pdfs (filename, storage_url, status, article_count, uploaded_at, processed_at)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (
                    record.filename,
                    record.storage_url,
                    record.status,
                    record.article_count,
                    record.uploaded_at.isoformat(),
                    record.processed_at.isoformat() if record.processed_at else None,
                ),
            )
            conn.commit()
            return cursor.lastrowid
        finally:
            conn.close()

    def update_pdf_status(self, pdf_id: int, status: str, article_count: int = 0) -> None:
        conn = self._connect()
        try:
            processed_at = datetime.now().isoformat() if status == "processed" else None
            conn.execute(
                "UPDATE pdfs SET status = ?, article_count = ?, processed_at = ? WHERE id = ?",
                (status, article_count, processed_at, pdf_id),
            )
            conn.commit()
        finally:
            conn.close()

    def get_pending_pdfs(self) -> List[PDFRecord]:
        conn = self._connect()
        rows = conn.execute(
            "SELECT * FROM pdfs WHERE status = 'pending' ORDER BY uploaded_at ASC"
        ).fetchall()
        conn.close()
        return [self._row_to_pdf(r) for r in rows]

    def get_processed_filenames(self) -> set:
        conn = self._connect()
        rows = conn.execute(
            "SELECT DISTINCT filename FROM pdfs WHERE status = 'processed'"
        ).fetchall()
        conn.close()
        return {r["filename"] for r in rows}

    def _row_to_pdf(self, row: sqlite3.Row) -> PDFRecord:
        return PDFRecord(
            id=row["id"],
            filename=row["filename"],
            storage_url=row["storage_url"],
            status=row["status"],
            article_count=row["article_count"],
            uploaded_at=datetime.fromisoformat(row["uploaded_at"]),
            processed_at=datetime.fromisoformat(row["processed_at"]) if row["processed_at"] else None,
        )

    # ------------------------------------------------------------------
    # Digests
    # ------------------------------------------------------------------

    def save_digest(self, batch_id: str, article_slugs: List[str]) -> None:
        conn = self._connect()
        try:
            conn.execute(
                "INSERT OR REPLACE INTO digests (batch_id, article_slugs, sent_at) VALUES (?, ?, ?)",
                (batch_id, json.dumps(article_slugs), datetime.now().isoformat()),
            )
            conn.commit()
        finally:
            conn.close()

    def load_last_digest_slugs(self) -> Optional[List[str]]:
        conn = self._connect()
        row = conn.execute(
            "SELECT article_slugs FROM digests ORDER BY sent_at DESC LIMIT 1"
        ).fetchone()
        conn.close()
        return json.loads(row["article_slugs"]) if row else None

    # ------------------------------------------------------------------
    # Weekly editions
    # ------------------------------------------------------------------

    def get_articles_since(self, since: datetime, limit: int = 60) -> List[ArticleRecord]:
        conn = self._connect()
        rows = conn.execute(
            "SELECT * FROM articles WHERE published_at >= ? ORDER BY importance_score DESC, published_at DESC LIMIT ?",
            (since.isoformat(), limit),
        ).fetchall()
        conn.close()
        return [self._row_to_article(r) for r in rows]

    def create_weekly_edition_job(self, edition_date: str) -> int:
        conn = self._connect()
        try:
            cursor = conn.execute(
                "INSERT INTO weekly_editions (edition_date, status, requested_at) VALUES (?, 'pending', ?)",
                (edition_date, datetime.now().isoformat()),
            )
            conn.commit()
            return cursor.lastrowid
        finally:
            conn.close()

    def get_pending_weekly_jobs(self) -> List[WeeklyEditionJob]:
        conn = self._connect()
        rows = conn.execute(
            "SELECT * FROM weekly_editions WHERE status = 'pending' ORDER BY requested_at ASC"
        ).fetchall()
        conn.close()
        return [self._row_to_edition(r) for r in rows]

    def update_weekly_edition(
        self, job_id: int, status: str,
        pdf_path: str = "", article_count: int = 0
    ) -> None:
        conn = self._connect()
        generated_at = datetime.now().isoformat() if status in ("done", "failed") else None
        try:
            conn.execute(
                """UPDATE weekly_editions
                   SET status = ?, pdf_path = ?, article_count = ?, generated_at = ?
                   WHERE id = ?""",
                (status, pdf_path, article_count, generated_at, job_id),
            )
            conn.commit()
        finally:
            conn.close()

    def get_weekly_editions(self, limit: int = 10) -> List[WeeklyEditionJob]:
        conn = self._connect()
        rows = conn.execute(
            "SELECT * FROM weekly_editions ORDER BY requested_at DESC LIMIT ?", (limit,)
        ).fetchall()
        conn.close()
        return [self._row_to_edition(r) for r in rows]

    def _row_to_edition(self, row: sqlite3.Row) -> WeeklyEditionJob:
        return WeeklyEditionJob(
            id=row["id"],
            edition_date=row["edition_date"],
            status=row["status"],
            pdf_path=row["pdf_path"] or "",
            article_count=row["article_count"] or 0,
            requested_at=datetime.fromisoformat(row["requested_at"]),
            generated_at=datetime.fromisoformat(row["generated_at"]) if row["generated_at"] else None,
        )

    # ------------------------------------------------------------------
    # Schedules (Python read path)
    # ------------------------------------------------------------------

    def get_active_schedules(self) -> List[Dict[str, Any]]:
        conn = self._connect()
        try:
            rows = conn.execute(
                "SELECT id, name, cron_expr, last_run FROM schedules WHERE enabled = 1"
            ).fetchall()
        except Exception:
            conn.close()
            return []
        conn.close()
        return [dict(r) for r in rows]

    def update_schedule_last_run(self, schedule_id: int) -> None:
        conn = self._connect()
        try:
            conn.execute(
                "UPDATE schedules SET last_run = ? WHERE id = ?",
                (datetime.now().isoformat(), schedule_id),
            )
            conn.commit()
        finally:
            conn.close()

    # ------------------------------------------------------------------
    # Subscribers
    # ------------------------------------------------------------------

    def get_subscribers(self):
        conn = self._connect()
        rows = conn.execute("SELECT email, unsubscribe_token FROM subscribers").fetchall()
        conn.close()
        return [(r["email"], r["unsubscribe_token"]) for r in rows]

    def add_subscriber(self, email: str, unsubscribe_token: str) -> bool:
        conn = self._connect()
        try:
            conn.execute(
                "INSERT INTO subscribers (email, unsubscribe_token, subscribed_at) VALUES (?, ?, ?)",
                (email, unsubscribe_token, datetime.now().isoformat()),
            )
            conn.commit()
            return True
        except sqlite3.IntegrityError:
            return False
        finally:
            conn.close()

    def remove_subscriber_by_token(self, token: str) -> bool:
        conn = self._connect()
        try:
            cursor = conn.execute(
                "DELETE FROM subscribers WHERE unsubscribe_token = ?", (token,)
            )
            conn.commit()
            return cursor.rowcount > 0
        finally:
            conn.close()

    def subscriber_exists(self, email: str) -> bool:
        conn = self._connect()
        row = conn.execute(
            "SELECT 1 FROM subscribers WHERE email = ? LIMIT 1", (email,)
        ).fetchone()
        conn.close()
        return row is not None
