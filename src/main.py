"""
Entry point for the newspaper PDF processing service.

Usage:
    python src/main.py                          # Start watching inbox/ for PDFs
    python src/main.py --process-existing       # Process all existing PDFs in inbox, then watch
    python src/main.py --run-once               # Process existing PDFs and exit (no watching)
    python src/main.py --resend-last            # Resend last digest email without reprocessing PDFs
    python src/main.py --generate-weekly DATE   # Generate weekly edition for DATE (YYYY-MM-DD) and exit
"""

import argparse
import logging
import os
import sys

# Ensure project root is in path when running as a script
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.config_loader import load_config
from src.watcher import FolderWatcher, CloudStoragePoller
from src.pipeline import Pipeline
from src.digest_store import DigestStore
from src.email_sender import EmailSender
from src.providers.db import get_db_provider
from src.weekly_scheduler import WeeklyScheduler


def setup_logging(log_level: str, log_file: str) -> None:
    os.makedirs(os.path.dirname(log_file), exist_ok=True)

    fmt = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
    datefmt = "%Y-%m-%d %H:%M:%S"

    handlers = [
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(log_file, encoding="utf-8"),
    ]

    logging.basicConfig(
        level=getattr(logging, log_level.upper(), logging.INFO),
        format=fmt,
        datefmt=datefmt,
        handlers=handlers,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Newspaper PDF processor")
    parser.add_argument(
        "--process-existing",
        action="store_true",
        help="Process all PDFs currently in the inbox before watching for new ones",
    )
    parser.add_argument(
        "--run-once",
        action="store_true",
        help="Process existing PDFs in inbox and exit without watching",
    )
    parser.add_argument(
        "--resend-last",
        action="store_true",
        help="Resend the last digest email without reprocessing any PDFs",
    )
    parser.add_argument(
        "--generate-weekly",
        metavar="DATE",
        help="Generate weekly edition PDF for DATE (YYYY-MM-DD) and exit",
    )
    args = parser.parse_args()

    config = load_config()
    setup_logging(config.log_level, config.log_file)

    logger = logging.getLogger(__name__)

    db = get_db_provider()

    if args.generate_weekly:
        edition_date = args.generate_weekly
        logger.info("Generating weekly edition for %s...", edition_date)
        from src.newspaper_generator import NewspaperGenerator
        job_id = db.create_weekly_edition_job(edition_date)
        from src.providers.db.base import WeeklyEditionJob
        job = WeeklyEditionJob(id=job_id, edition_date=edition_date)
        generator = NewspaperGenerator()
        try:
            generator.run_job(job)
            logger.info("Done.")
        except Exception as exc:
            logger.error("Failed: %s", exc)
            sys.exit(1)
        return

    if args.resend_last:
        logger.info("Resending last digest...")
        articles = DigestStore(db).load_last_digest()
        if not articles:
            logger.error("No saved digest found. Process a PDF first.")
            sys.exit(1)
        unique = [a for a in articles if not a.is_duplicate]
        logger.info("Loaded %d unique articles from last digest.", len(unique))
        EmailSender(config.email).send_digest(articles)
        logger.info("Done.")
        return

    logger.info("Newspaper PDF Processor starting up")
    logger.info("LLM provider: %s (%s)", config.llm.provider, config.llm.model)
    logger.info("Storage provider: %s", config.storage.provider)

    if args.run_once or args.process_existing:
        pipeline = Pipeline(config)
        pipeline.run()  # Process all existing inbox files

    if not args.run_once:
        scheduler = WeeklyScheduler()
        scheduler.start()
        if config.storage.provider == 'local':
            watcher = FolderWatcher(config)
            watcher.start()
        else:
            poller = CloudStoragePoller(config)
            poller.start()


if __name__ == "__main__":
    main()
