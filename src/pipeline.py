import logging
import os
from typing import List

from src.config_loader import load_config, AppConfig
from src.models import Article, ProcessedArticle
from src.providers.llm import get_llm_provider
from src.providers.storage import get_storage_provider
from src.article_extractor import ArticleExtractor
from src.deduplicator import Deduplicator
from src.summarizer import Summarizer
from src.email_sender import EmailSender
from src.digest_store import DigestStore

logger = logging.getLogger(__name__)


class Pipeline:
    """
    Orchestrates the full newspaper PDF processing workflow:
    1. Read PDF file(s) from storage
    2. Extract news articles (text or vision-based)
    3. Detect and mark duplicates via semantic similarity
    4. Summarize unique articles (paraphrased, 3-4 sentences)
    5. Send email digest to subscribers
    6. Move processed PDFs to the processed folder
    """

    def __init__(self, config: AppConfig):
        self.config = config

        # Initialize LLM provider (config-driven)
        self.llm = get_llm_provider(
            provider_name=config.llm.provider,
            api_key=config.llm.api_key,
            model=config.llm.model,
            embedding_model=config.llm.embedding_model,
        )

        # Initialize storage provider (config-driven)
        self.storage = get_storage_provider(
            provider_name=config.storage.provider,
            config={
                "inbox_path": config.storage.inbox_path,
                "processed_path": config.storage.processed_path,
            },
        )

        # Initialize pipeline components
        self.extractor = ArticleExtractor(self.llm)
        self.deduplicator = Deduplicator(self.llm, config.dedup_threshold)
        self.summarizer = Summarizer(self.llm)
        self.email_sender = EmailSender(config.email)
        self.digest_store = DigestStore()

    def run(self, pdf_paths: List[str] = None) -> None:
        """
        Run the full pipeline.

        Args:
            pdf_paths: Specific PDF paths to process. If None, processes all
                       new files found in the inbox via the storage provider.
        """
        if pdf_paths is None:
            pdf_paths = self.storage.list_new_files()

        if not pdf_paths:
            logger.info("No new PDFs to process.")
            return

        logger.info("Starting pipeline for %d PDF(s)", len(pdf_paths))
        all_processed: List[ProcessedArticle] = []

        for pdf_path in pdf_paths:
            try:
                processed = self._process_single_pdf(pdf_path)
                all_processed.extend(processed)
            except Exception as e:
                logger.error("Pipeline failed for %s: %s", pdf_path, e, exc_info=True)

        if not all_processed:
            logger.info("No articles were extracted from any PDF.")
            return

        unique_count = sum(1 for a in all_processed if not a.is_duplicate)
        logger.info(
            "Pipeline complete: %d total articles, %d unique, %d duplicates",
            len(all_processed), unique_count, len(all_processed) - unique_count
        )

        # Send email digest (only if there are unique articles)
        if unique_count > 0 and self.config.email.send_immediately:
            logger.info("Sending email digest...")
            self.email_sender.send_digest(all_processed)
        elif unique_count > 0:
            logger.info(
                "send_immediately=false — digest will be sent on schedule (%s)",
                self.config.email.schedule_cron
            )

    def _process_single_pdf(self, pdf_path: str) -> List[ProcessedArticle]:
        """Process a single PDF through the full pipeline."""
        import time
        filename = os.path.basename(pdf_path)
        start_time = time.time()
        logger.info("--- Processing: %s ---", filename)

        # 1. Read PDF bytes
        pdf_bytes = self.storage.read_file(pdf_path)
        pdf_link = self.storage.get_file_url(pdf_path)

        # 2. Extract articles
        articles = self.extractor.extract_from_pdf(pdf_bytes, pdf_path)
        if not articles:
            logger.warning("No articles extracted from %s", filename)
            self.storage.move_to_processed(pdf_path)
            elapsed = time.time() - start_time
            logger.info("Finished '%s' in %.1f seconds (0 articles).", filename, elapsed)
            return []

        logger.info("Extracted %d articles", len(articles))

        # 3. Deduplicate
        processed = self.deduplicator.process_articles(articles, pdf_link)

        # 4. Summarize (only unique articles)
        processed = self.summarizer.summarize_all(processed)

        # 5. Persist digest so it can be resent without reprocessing
        self.digest_store.save_digest(processed)

        # 6. Move to processed folder
        self.storage.move_to_processed(pdf_path)

        elapsed = time.time() - start_time
        unique = sum(1 for a in processed if not a.is_duplicate)
        mins, secs = divmod(int(elapsed), 60)
        logger.info(
            "Finished '%s' in %dm %ds — %d articles extracted, %d unique, %d duplicates.",
            filename, mins, secs, len(articles), unique, len(articles) - unique,
        )
        return processed
