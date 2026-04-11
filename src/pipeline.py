import logging
import os
from datetime import date, datetime, timezone
from typing import List, Optional, Dict, Set

from src.config_loader import AppConfig
from src.models import Article, ProcessedArticle
from src.providers.llm import get_llm_provider
from src.providers.storage import get_storage_provider
from src.providers.db import get_db_provider
from src.providers.db.base import ArticleRecord, PDFRecord
from src.article_extractor import ArticleExtractor
from src.pdf_processor import PDFProcessor
from src.rewriter import Rewriter, generate_slug
from src.deduplicator import Deduplicator
from src.summarizer import Summarizer
from src.email_sender import EmailSender
from src.digest_store import DigestStore
from src.date_detector import detect_newspaper_date

logger = logging.getLogger(__name__)


class Pipeline:
    """
    Orchestrates the full newspaper PDF processing workflow:

    1. Read all pending PDF file(s) from storage
    2. Extract raw articles from every page (text or vision-based)
    3. Group same-story articles across all PDFs (semantic similarity)
    4. Cross-run duplicate check — skip stories already published
    5. Rewrite each story group → single unified 300-500 word article
    6. Summarize each rewritten article → 4-5 sentence email summary
    7. Persist articles to database + generate website URLs
    8. Send email digest to subscribers
    9. Move processed PDFs to the processed folder
    """

    def __init__(self, config: AppConfig):
        self.config = config

        self.llm = get_llm_provider(
            provider_name=config.llm.provider,
            api_key=config.llm.api_key,
            model=config.llm.model,
            embedding_model=config.llm.embedding_model,
            max_concurrent=config.llm.max_concurrent,
        )
        self.storage = get_storage_provider(
            provider_name=config.storage.provider,
            config={
                "inbox_path": config.storage.inbox_path,
                "processed_path": config.storage.processed_path,
            },
        )
        self.db = get_db_provider()

        self.extractor = ArticleExtractor(self.llm)
        self.pdf_processor = PDFProcessor()
        self.rewriter = Rewriter(self.llm, config.rewriter.grouping_threshold, max_concurrent=config.llm.max_concurrent)
        self.deduplicator = Deduplicator(self.db, config.dedup_threshold)
        self.summarizer = Summarizer(self.llm, max_concurrent=config.llm.max_concurrent)
        self.email_sender = EmailSender(config.email, db_provider=self.db)
        self.digest_store = DigestStore(self.db)

    def run(self, pdf_paths: Optional[List[str]] = None) -> None:
        """
        Run the full pipeline.

        Args:
            pdf_paths: Specific PDF paths to process. If None, processes all
                       new files found in the inbox via the storage provider.
        """
        if pdf_paths is None:
            pdf_paths = self.storage.list_new_files()

        # Skip PDFs that have already been processed (prevents infinite re-processing
        # when move_to_processed fails and the file stays in inbox/)
        if pdf_paths:
            pdf_paths = self._filter_already_processed(pdf_paths)

        # Also scan editorial inbox (separate folder, articles forced to "Editorial" category)
        editorial_pdf_set: Set[str] = set()
        editorial_inbox = self.config.storage.editorial_inbox_path
        if editorial_inbox:
            # Cloud storage providers (e.g. Supabase) expose list_editorial_files()
            if hasattr(self.storage, "list_editorial_files"):
                editorial_files = self.storage.list_editorial_files()
            else:
                abs_editorial = os.path.abspath(editorial_inbox)
                os.makedirs(abs_editorial, exist_ok=True)
                editorial_files = sorted([
                    os.path.join(abs_editorial, f)
                    for f in os.listdir(abs_editorial)
                    if f.lower().endswith(".pdf")
                ])
            editorial_pdf_set = set(editorial_files)
            pdf_paths = list(pdf_paths) + editorial_files

        if not pdf_paths:
            logger.info("No new PDFs to process.")
            return

        logger.info("Starting pipeline for %d PDF(s)", len(pdf_paths))
        import time
        start_time = time.time()

        # --- Stage 1: Extract articles from ALL PDFs ---
        all_articles: List[Article] = []
        pdf_records: List[PDFRecord] = []
        pdf_newspaper_dates: Dict[str, date] = {}  # pdf_path → detected newspaper date
        stale_pdf_paths: Set[str] = set()          # PDFs too old to include in email
        failed_pdfs: Set[str] = set()              # PDFs that failed extraction

        for pdf_idx, pdf_path in enumerate(pdf_paths, 1):
            filename = os.path.basename(pdf_path)
            logger.info("=== Processing PDF %d/%d: '%s' ===", pdf_idx, len(pdf_paths), filename)
            pdf_record_id = None
            try:
                pdf_bytes = self.storage.read_file(pdf_path)

                # Detect newspaper publication date:
                # 1. filename  2. PDF metadata  3. first page text  4. Gemini reads front page
                newspaper_date = detect_newspaper_date(filename, pdf_bytes)
                if not newspaper_date:
                    first_page_img = self.pdf_processor.render_first_page(pdf_bytes)
                    if first_page_img:
                        try:
                            newspaper_date = self.llm.extract_newspaper_date(first_page_img)
                            if newspaper_date:
                                logger.info(
                                    "Detected newspaper date via Gemini front-page scan: %s", newspaper_date
                                )
                        except Exception as e:
                            logger.debug("Gemini date fallback failed for '%s': %s", filename, e)
                if newspaper_date:
                    pdf_newspaper_dates[pdf_path] = newspaper_date
                    age_days = (date.today() - newspaper_date).days
                    max_age = self.config.max_newspaper_age_days
                    if max_age > 0 and age_days > max_age:
                        stale_pdf_paths.add(pdf_path)
                        logger.warning(
                            "'%s' is %d days old (dated %s) — articles will be archived "
                            "but excluded from today's email digest.",
                            filename, age_days, newspaper_date,
                        )

                pdf_record_id = self.db.save_pdf_record(PDFRecord(
                    filename=filename,
                    status="processing",
                    uploaded_at=datetime.now(timezone.utc),
                ))
                pdf_records.append((pdf_path, pdf_record_id, filename))

                articles = self.extractor.extract_from_pdf(pdf_bytes, pdf_path)
                logger.info("Extracted %d articles from '%s'", len(articles), filename)
                # Force category for editorial PDFs
                if pdf_path in editorial_pdf_set:
                    for a in articles:
                        a.category = "Editorial"
                all_articles.extend(articles)

            except Exception as e:
                logger.error("Extraction failed for '%s': %s", filename, e, exc_info=True)
                failed_pdfs.add(pdf_path)
                if pdf_record_id is not None:
                    try:
                        self.db.update_pdf_status(pdf_record_id, "failed", 0)
                    except Exception:
                        pass

        if not all_articles:
            logger.info("No articles extracted from any PDF.")
            self._move_and_finalize(pdf_paths, pdf_records, article_count=0, failed_pdfs=failed_pdfs)
            return

        logger.info("Total articles extracted: %d across %d PDF(s)", len(all_articles), len(pdf_paths))

        # --- Stage 2: Group same-story articles across all PDFs ---
        # Editorial articles skip cross-paper grouping — each is its own story
        regular_articles = [a for a in all_articles if a.source_pdf not in editorial_pdf_set]
        editorial_articles = [a for a in all_articles if a.source_pdf in editorial_pdf_set]

        groups = self.rewriter.group_by_story(regular_articles)

        # Add editorial articles as individual single-article groups
        if editorial_articles:
            logger.info("Adding %d editorial article(s) as individual groups", len(editorial_articles))
            for article in editorial_articles:
                embed_text = f"{article.title}\n\n{article.content[:2000]}"
                try:
                    embedding = self.llm.get_embedding(embed_text)
                    groups.append(([article], embedding))
                except Exception as e:
                    logger.error("Failed to embed editorial article '%s': %s", article.title, e)

        # --- Stage 3-7: Per-group: dedup → rewrite → summarize → save ---
        processed: List[ProcessedArticle] = []

        # Phase A: dedup check (all in-memory — fast, no LLM calls)
        to_rewrite = []   # list of (group_articles, group_embedding)
        for group_articles, group_embedding in groups:
            primary = group_articles[0]
            duplicate_of = self.deduplicator.is_duplicate(group_embedding)
            if duplicate_of:
                logger.info("  DUPLICATE (already published): '%s'", primary.title)
                processed.append(ProcessedArticle(
                    article=primary,
                    summary="",
                    embedding=group_embedding,
                    pdf_link="",
                    is_duplicate=True,
                    duplicate_of=duplicate_of,
                ))
            else:
                to_rewrite.append((group_articles, group_embedding))

        logger.info(
            "%d unique stories to rewrite (skipped %d duplicates). Rewriting %d parallel...",
            len(to_rewrite), len(processed), self.rewriter.max_concurrent,
        )

        # Phase B: rewrite all non-duplicates in parallel
        import concurrent.futures as _cf
        rewrite_results: List[Optional[str]] = [None] * len(to_rewrite)

        def _rewrite_worker(idx_articles):
            idx, group_articles = idx_articles
            try:
                return idx, self.rewriter.rewrite(group_articles)
            except Exception as e:
                primary = group_articles[0]
                logger.error("Failed to rewrite '%s': %s", primary.title, e, exc_info=True)
                return idx, None

        with _cf.ThreadPoolExecutor(max_workers=self.rewriter.max_concurrent) as executor:
            futures = {
                executor.submit(_rewrite_worker, (i, group_articles)): i
                for i, (group_articles, _) in enumerate(to_rewrite)
            }
            for future in _cf.as_completed(futures):
                idx, result = future.result()
                rewrite_results[idx] = result

        # Phase C: build ProcessedArticle list from rewrite results
        for i, (group_articles, group_embedding) in enumerate(to_rewrite):
            rewritten_content = rewrite_results[i]
            if rewritten_content is None:
                continue  # rewrite failed, skip this story

            primary = group_articles[0]
            slug = generate_slug(primary.title)
            website_url = f"{self.config.website.base_url}/article/{slug}"

            max_score = max(a.importance_score for a in group_articles)
            final_score = min(10, round(max_score + (len(group_articles) - 1) * 0.5))

            group_source_pdfs = list({
                os.path.basename(a.source_pdf) for a in group_articles
            })

            processed.append(ProcessedArticle(
                article=primary,
                summary="",               # filled by summarizer below
                embedding=group_embedding,
                pdf_link=website_url,
                is_duplicate=False,
                rewritten_content=rewritten_content,
                importance_score=final_score,
                source_pdfs=group_source_pdfs,
            ))

        # Summarize all unique articles
        processed = self.summarizer.summarize_all(processed)

        # Save unique articles to DB and update their website URLs (slug may have been
        # adjusted for uniqueness by the DB layer)
        for pa in processed:
            if pa.is_duplicate:
                continue
            try:
                slug = generate_slug(pa.article.title)

                # Use the detected newspaper date as published_at (not today's date)
                raw_date = pdf_newspaper_dates.get(pa.article.source_pdf)
                if raw_date:
                    published_at = datetime(raw_date.year, raw_date.month, raw_date.day,
                                            tzinfo=timezone.utc)
                else:
                    published_at = datetime.now(timezone.utc)

                record = ArticleRecord(
                    slug=slug,
                    title=pa.article.title,
                    rewritten_content=pa.rewritten_content,
                    summary=pa.summary,
                    category=pa.article.category,
                    embedding=pa.embedding,
                    source_pdfs=pa.source_pdfs,
                    published_at=published_at,
                    importance_score=pa.importance_score,
                    is_breaking=pa.importance_score >= 9,
                    website_url=pa.pdf_link,
                    image_url="",
                )
                saved_slug = self.db.save_article(record)
                # Update website_url in case slug was made unique by the DB
                pa.pdf_link = f"{self.config.website.base_url}/article/{saved_slug}"

            except Exception as e:
                logger.error("Failed to save article '%s' to DB: %s", pa.article.title, e, exc_info=True)

        # --- Stage 8: Send email digest ---
        unique_count = sum(1 for a in processed if not a.is_duplicate)
        total = len(processed)
        logger.info(
            "Pipeline complete: %d stories, %d unique, %d duplicates",
            total, unique_count, total - unique_count,
        )

        # Check if more PDFs are still waiting in the inbox (uploaded while this batch
        # was processing). If so, defer the email — it will be sent after all PDFs finish.
        processed_in_this_run = {os.path.basename(p) for p in pdf_paths}
        try:
            remaining_inbox = self.storage.list_new_files()
            remaining_inbox = [
                f for f in remaining_inbox
                if os.path.basename(f) not in processed_in_this_run
            ]
        except Exception:
            remaining_inbox = []

        if remaining_inbox:
            logger.info(
                "Deferring email digest — %d more PDF(s) still pending in inbox. "
                "Email will be sent after all PDFs are processed.",
                len(remaining_inbox),
            )
        elif unique_count > 0:
            # Inbox is empty — build the email from ALL of today's articles (not just
            # this run's batch), so a single digest covers every PDF uploaded today.
            from datetime import date as _date, time as _time
            today_start = datetime.combine(_date.today(), _time.min, tzinfo=timezone.utc)
            try:
                todays_records = self.db.get_articles_since(today_start, limit=200)
            except Exception as e:
                logger.warning("Could not load today's articles from DB for digest: %s", e)
                todays_records = []

            if todays_records:
                email_articles = [
                    ProcessedArticle(
                        article=Article(
                            title=r.title,
                            content="",
                            page_number=0,
                            source_pdf="",
                            category=r.category,
                        ),
                        summary=r.summary,
                        embedding=[],
                        pdf_link=r.website_url,
                        is_duplicate=False,
                        rewritten_content=r.rewritten_content,
                        importance_score=r.importance_score,
                        source_pdfs=r.source_pdfs,
                    )
                    for r in todays_records
                    if r.source_pdfs  # skip stale-archived articles with no source_pdfs
                ]
                # Exclude articles sourced exclusively from stale newspapers
                stale_filenames = {os.path.basename(p) for p in stale_pdf_paths}
                email_articles = [
                    pa for pa in email_articles
                    if not pa.source_pdfs or not all(
                        s in stale_filenames for s in (pa.source_pdfs or [])
                    )
                ]
            else:
                email_articles = []

            if not email_articles:
                logger.info("No articles eligible for today's email digest.")
            elif self.config.email.send_immediately:
                logger.info(
                    "Sending email digest (%d articles from today)...", len(email_articles)
                )
                email_sent = self.email_sender.send_digest(email_articles)
                if email_sent:
                    self.digest_store.save_digest(processed)
                else:
                    logger.warning("Digest NOT saved — email delivery failed.")
            else:
                logger.info(
                    "send_immediately=false — digest queued for scheduled send (%s)",
                    self.config.email.schedule_cron,
                )
                self.digest_store.save_digest(processed)

        # --- Stage 9: Move PDFs + update records ---
        self._move_and_finalize(pdf_paths, pdf_records, article_count=unique_count, failed_pdfs=failed_pdfs)

        elapsed = time.time() - start_time
        mins, secs = divmod(int(elapsed), 60)
        logger.info("Total pipeline time: %dm %ds", mins, secs)

    def _filter_already_processed(self, pdf_paths: List[str]) -> List[str]:
        """Filter out PDFs that already have a 'processed' record in the DB."""
        try:
            processed_filenames = self.db.get_processed_filenames()
        except Exception as e:
            logger.warning("Could not check processed PDFs in DB: %s", e)
            return pdf_paths

        filtered = []
        for path in pdf_paths:
            filename = os.path.basename(path)
            if filename in processed_filenames:
                logger.info("Skipping '%s' — already processed. Removing from inbox.", filename)
                # Clean up the stale inbox file
                try:
                    self.storage.move_to_processed(path)
                except Exception:
                    pass
            else:
                filtered.append(path)
        return filtered

    def _move_and_finalize(
        self,
        pdf_paths: List[str],
        pdf_records: List[tuple],
        article_count: int,
        failed_pdfs: set = None,
    ) -> None:
        failed_pdfs = failed_pdfs or set()
        record_map = {path: (rid, fname) for path, rid, fname in pdf_records}

        for pdf_path in pdf_paths:
            if pdf_path in failed_pdfs:
                # Already marked 'failed' in Stage 1 — leave the file in inbox for manual retry
                continue

            try:
                self.storage.move_to_processed(pdf_path)
            except Exception as e:
                logger.error("Could not move '%s' to processed: %s", pdf_path, e)

            if pdf_path in record_map:
                pdf_record_id, _ = record_map[pdf_path]
                try:
                    self.db.update_pdf_status(pdf_record_id, "processed", article_count)
                except Exception as e:
                    logger.error("Could not update PDF record %d: %s", pdf_record_id, e)
