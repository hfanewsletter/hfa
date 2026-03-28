"""
Supabase PostgreSQL implementation of DBProvider.

To activate:
1. Create a Supabase project at https://supabase.com
2. Run the SQL in scripts/supabase_schema.sql in the Supabase SQL editor
3. Set SUPABASE_URL and SUPABASE_KEY in your .env file

The factory in __init__.py automatically uses this provider when those env vars are set.
"""

import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

import numpy as np
from sklearn.metrics.pairwise import cosine_similarity

from src.providers.db.base import ArticleRecord, DBProvider, PDFRecord, WeeklyEditionJob

logger = logging.getLogger(__name__)


class SupabaseDBProvider(DBProvider):
    """
    Production database provider backed by Supabase (PostgreSQL).
    """

    def __init__(self, supabase_url: str, supabase_key: str):
        try:
            from supabase import create_client
        except ImportError:
            raise ImportError(
                "supabase package is required for SupabaseDBProvider. "
                "Run: pip install supabase"
            )
        self.client = create_client(supabase_url, supabase_key)

    # ------------------------------------------------------------------
    # Articles
    # ------------------------------------------------------------------

    def save_article(self, record: ArticleRecord) -> str:
        slug = self._unique_slug(record.slug)
        self.client.table("articles").upsert({
            "slug": slug,
            "title": record.title,
            "rewritten_content": record.rewritten_content,
            "summary": record.summary,
            "category": record.category,
            "embedding_json": json.dumps(record.embedding),
            "source_pdfs": record.source_pdfs,
            "published_at": record.published_at.isoformat(),
            "importance_score": record.importance_score,
            "is_breaking": record.is_breaking,
            "website_url": record.website_url,
            "image_url": record.image_url,
        }).execute()
        return slug

    def _unique_slug(self, base_slug: str) -> str:
        response = (
            self.client.table("articles")
            .select("slug")
            .like("slug", f"{base_slug}%")
            .execute()
        )
        taken = {row["slug"] for row in (response.data or [])}
        if base_slug not in taken:
            return base_slug
        counter = 2
        while f"{base_slug}-{counter}" in taken:
            counter += 1
        return f"{base_slug}-{counter}"

    def find_similar_article(self, embedding: List[float], threshold: float) -> Optional[str]:
        response = self.client.table("articles").select("title, embedding_json").execute()
        rows = response.data or []

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
        response = (
            self.client.table("articles").select("*").eq("slug", slug).single().execute()
        )
        return self._row_to_article(response.data) if response.data else None

    def get_latest_articles(self, limit: int = 20) -> List[ArticleRecord]:
        response = (
            self.client.table("articles")
            .select("*")
            .order("importance_score", desc=True)
            .order("published_at", desc=True)
            .limit(limit)
            .execute()
        )
        return [self._row_to_article(r) for r in (response.data or [])]

    def get_articles_by_category(self, category: str, limit: int = 20) -> List[ArticleRecord]:
        response = (
            self.client.table("articles")
            .select("*")
            .eq("category", category)
            .order("published_at", desc=True)
            .limit(limit)
            .execute()
        )
        return [self._row_to_article(r) for r in (response.data or [])]

    def _row_to_article(self, row: dict) -> ArticleRecord:
        source_pdfs = row.get("source_pdfs") or []
        if isinstance(source_pdfs, str):
            source_pdfs = json.loads(source_pdfs)
        importance_score = int(row.get("importance_score") or 5)
        return ArticleRecord(
            id=row.get("id"),
            slug=row["slug"],
            title=row["title"],
            rewritten_content=row["rewritten_content"],
            summary=row["summary"],
            category=row["category"],
            embedding=json.loads(row["embedding_json"]),
            source_pdfs=source_pdfs,
            published_at=datetime.fromisoformat(row["published_at"]),
            importance_score=importance_score,
            is_breaking=importance_score >= 9,
            website_url=row.get("website_url", ""),
            image_url=row.get("image_url", ""),
        )

    # ------------------------------------------------------------------
    # PDFs
    # ------------------------------------------------------------------

    def save_pdf_record(self, record: PDFRecord) -> int:
        # Try to find and update an existing record (created by the web UI upload)
        existing = (
            self.client.table("pdfs")
            .select("id")
            .eq("filename", record.filename)
            .in_("status", ["pending", "processing"])
            .order("uploaded_at", desc=True)
            .limit(1)
            .execute()
        )
        if existing.data:
            pdf_id = existing.data[0]["id"]
            self.client.table("pdfs").update({
                "status": record.status,
                "article_count": record.article_count,
            }).eq("id", pdf_id).execute()
            return pdf_id

        response = self.client.table("pdfs").insert({
            "filename": record.filename,
            "storage_url": record.storage_url,
            "status": record.status,
            "article_count": record.article_count,
            "uploaded_at": record.uploaded_at.isoformat(),
            "processed_at": record.processed_at.isoformat() if record.processed_at else None,
        }).execute()
        return response.data[0]["id"]

    def update_pdf_status(self, pdf_id: int, status: str, article_count: int = 0) -> None:
        update_data = {"status": status, "article_count": article_count}
        if status == "processed":
            update_data["processed_at"] = datetime.now().isoformat()
        self.client.table("pdfs").update(update_data).eq("id", pdf_id).execute()

    def get_pending_pdfs(self) -> List[PDFRecord]:
        response = (
            self.client.table("pdfs")
            .select("*")
            .eq("status", "pending")
            .order("uploaded_at")
            .execute()
        )
        return [self._row_to_pdf(r) for r in (response.data or [])]

    def get_processed_filenames(self) -> set:
        response = (
            self.client.table("pdfs")
            .select("filename")
            .eq("status", "processed")
            .execute()
        )
        return {r["filename"] for r in (response.data or [])}

    def _row_to_pdf(self, row: dict) -> PDFRecord:
        return PDFRecord(
            id=row.get("id"),
            filename=row["filename"],
            storage_url=row.get("storage_url", ""),
            status=row["status"],
            article_count=row.get("article_count", 0),
            uploaded_at=datetime.fromisoformat(row["uploaded_at"]),
            processed_at=datetime.fromisoformat(row["processed_at"]) if row.get("processed_at") else None,
        )

    # ------------------------------------------------------------------
    # Digests
    # ------------------------------------------------------------------

    def save_digest(self, batch_id: str, article_slugs: List[str]) -> None:
        self.client.table("digests").upsert({
            "batch_id": batch_id,
            "article_slugs": article_slugs,
            "sent_at": datetime.now().isoformat(),
        }).execute()

    def load_last_digest_slugs(self) -> Optional[List[str]]:
        response = (
            self.client.table("digests")
            .select("article_slugs")
            .order("sent_at", desc=True)
            .limit(1)
            .execute()
        )
        if not response.data:
            return None
        slugs = response.data[0]["article_slugs"]
        return slugs if isinstance(slugs, list) else json.loads(slugs)

    # ------------------------------------------------------------------
    # Weekly editions
    # ------------------------------------------------------------------

    def get_articles_since(self, since: datetime, limit: int = 60) -> List[ArticleRecord]:
        response = (
            self.client.table("articles")
            .select("*")
            .gte("published_at", since.isoformat())
            .order("importance_score", desc=True)
            .order("published_at", desc=True)
            .limit(limit)
            .execute()
        )
        return [self._row_to_article(r) for r in (response.data or [])]

    def create_weekly_edition_job(self, edition_date: str) -> int:
        response = self.client.table("weekly_editions").insert({
            "edition_date": edition_date,
            "status": "pending",
            "requested_at": datetime.now().isoformat(),
        }).execute()
        return response.data[0]["id"]

    def get_pending_weekly_jobs(self) -> List[WeeklyEditionJob]:
        response = (
            self.client.table("weekly_editions")
            .select("*")
            .eq("status", "pending")
            .order("requested_at")
            .execute()
        )
        return [self._row_to_edition(r) for r in (response.data or [])]

    def update_weekly_edition(
        self, job_id: int, status: str,
        pdf_path: str = "", article_count: int = 0
    ) -> None:
        update_data: Dict[str, Any] = {
            "status": status,
            "pdf_path": pdf_path,
            "article_count": article_count,
        }
        if status in ("done", "failed"):
            update_data["generated_at"] = datetime.now().isoformat()
        self.client.table("weekly_editions").update(update_data).eq("id", job_id).execute()

    def get_weekly_editions(self, limit: int = 10) -> List[WeeklyEditionJob]:
        response = (
            self.client.table("weekly_editions")
            .select("*")
            .order("requested_at", desc=True)
            .limit(limit)
            .execute()
        )
        return [self._row_to_edition(r) for r in (response.data or [])]

    def _row_to_edition(self, row: dict) -> WeeklyEditionJob:
        return WeeklyEditionJob(
            id=row.get("id"),
            edition_date=row["edition_date"],
            status=row["status"],
            pdf_path=row.get("pdf_path") or "",
            article_count=row.get("article_count") or 0,
            requested_at=datetime.fromisoformat(row["requested_at"]),
            generated_at=datetime.fromisoformat(row["generated_at"]) if row.get("generated_at") else None,
        )

    # ------------------------------------------------------------------
    # Schedules
    # ------------------------------------------------------------------

    def get_active_schedules(self) -> List[Dict[str, Any]]:
        try:
            response = (
                self.client.table("schedules")
                .select("id, name, cron_expr, last_run")
                .eq("enabled", True)
                .execute()
            )
            return response.data or []
        except Exception:
            return []

    def update_schedule_last_run(self, schedule_id: int) -> None:
        self.client.table("schedules").update({
            "last_run": datetime.now().isoformat(),
        }).eq("id", schedule_id).execute()
