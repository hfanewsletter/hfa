import logging
import os
from datetime import date, datetime, timezone
from typing import List, Optional, Dict, Set

from src.config_loader import load_config, AppConfig
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

# Directory where article thumbnails are served by Next.js
_SCRIPT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ARTICLE_IMAGES_DIR = os.path.join(_SCRIPT_DIR, "web", "public", "images", "articles")

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
        self.rewriter = Rewriter(self.llm, config.rewriter.grouping_threshold)
        self.deduplicator = Deduplicator(self.db, config.dedup_threshold)
        self.summarizer = Summarizer(self.llm)
        self.email_sender = EmailSender(config.email)
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
        pdf_bytes_cache: Dict[str, bytes] = {}     # pdf_path → bytes for thumbnail extraction
        pdf_newspaper_dates: Dict[str, date] = {}  # pdf_path → detected newspaper date
        stale_pdf_paths: Set[str] = set()          # PDFs too old to include in email
        failed_pdfs: Set[str] = set()              # PDFs that failed extraction

        os.makedirs(ARTICLE_IMAGES_DIR, exist_ok=True)

        for pdf_path in pdf_paths:
            filename = os.path.basename(pdf_path)
            pdf_record_id = None
            try:
                pdf_bytes = self.storage.read_file(pdf_path)
                pdf_bytes_cache[pdf_path] = pdf_bytes

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

        for group_articles, group_embedding in groups:
            primary = group_articles[0]

            try:
                # Cross-run duplicate check (embedding of primary article)
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
                    continue

                # Rewrite all versions into one article
                rewritten_content = self.rewriter.rewrite(group_articles)

                # Generate website URL
                slug = generate_slug(primary.title)
                website_url = f"{self.config.website.base_url}/article/{slug}"

                # Composite importance score:
                # Take the highest score from individual articles (LLM signal),
                # then add 0.5 per additional source covering the same story
                # (cross-paper consensus boost), capped at 10.
                max_score = max(a.importance_score for a in group_articles)
                final_score = min(10, round(max_score + (len(group_articles) - 1) * 0.5))

                pa = ProcessedArticle(
                    article=primary,
                    summary="",               # filled by summarizer below
                    embedding=group_embedding,
                    pdf_link=website_url,
                    is_duplicate=False,
                    rewritten_content=rewritten_content,
                    importance_score=final_score,
                )
                processed.append(pa)

            except Exception as e:
                logger.error("Failed to process group '%s': %s", primary.title, e, exc_info=True)

        # Summarize all unique articles
        processed = self.summarizer.summarize_all(processed)

        # Save unique articles to DB and update their website URLs (slug may have been
        # adjusted for uniqueness by the DB layer)
        for pa in processed:
            if pa.is_duplicate:
                continue
            try:
                slug = generate_slug(pa.article.title)
                source_pdfs = list({os.path.basename(a.source_pdf) for a in all_articles
                                     if a.title == pa.article.title or True})
                # Collect source PDFs for this group
                source_pdfs = list({os.path.basename(pa.article.source_pdf)})

                # Extract thumbnail from the article's source page
                image_url = ""
                pdf_bytes_for_img = pdf_bytes_cache.get(pa.article.source_pdf)
                if pdf_bytes_for_img:
                    thumb = self.pdf_processor.extract_page_thumbnail(
                        pdf_bytes_for_img, pa.article.page_number
                    )
                    if thumb:
                        img_filename = f"{slug}.jpg"
                        img_path = os.path.join(ARTICLE_IMAGES_DIR, img_filename)
                        try:
                            with open(img_path, "wb") as f:
                                f.write(thumb)
                            image_url = f"/images/articles/{img_filename}"
                            logger.debug("Saved thumbnail: %s", img_path)
                        except OSError as e:
                            logger.warning("Could not save thumbnail for '%s': %s", slug, e)

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
                    source_pdfs=source_pdfs,
                    published_at=published_at,
                    importance_score=pa.importance_score,
                    is_breaking=pa.importance_score >= 9,
                    website_url=pa.pdf_link,
                    image_url=image_url,
                )
                saved_slug = self.db.save_article(record)
                # Update website_url and image_url in case slug was made unique by the DB
                pa.pdf_link = f"{self.config.website.base_url}/article/{saved_slug}"
                pa.image_url = image_url

            except Exception as e:
                logger.error("Failed to save article '%s' to DB: %s", pa.article.title, e, exc_info=True)

        # --- Stage 8: Send email digest ---
        unique_count = sum(1 for a in processed if not a.is_duplicate)
        total = len(processed)
        logger.info(
            "Pipeline complete: %d stories, %d unique, %d duplicates",
            total, unique_count, total - unique_count,
        )

        # Exclude articles from stale newspapers from the email digest
        email_articles = [
            pa for pa in processed
            if not pa.is_duplicate and pa.article.source_pdf not in stale_pdf_paths
        ]

        if unique_count > 0:
            self.digest_store.save_digest(processed)

            if not email_articles:
                logger.info(
                    "All %d articles are from stale newspapers — skipping email digest.", unique_count
                )
            elif self.config.email.send_immediately:
                logger.info("Sending email digest (%d articles)...", len(email_articles))
                self.email_sender.send_digest(email_articles)
            else:
                logger.info(
                    "send_immediately=false — digest queued for scheduled send (%s)",
                    self.config.email.schedule_cron,
                )

        # --- Stage 9: Move PDFs + update records ---
        self._move_and_finalize(pdf_paths, pdf_records, article_count=unique_count, failed_pdfs=failed_pdfs)

        elapsed = time.time() - start_time
        mins, secs = divmod(int(elapsed), 60)
        logger.info("Total pipeline time: %dm %ds", mins, secs)

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
