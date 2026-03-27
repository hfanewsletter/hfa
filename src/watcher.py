import logging
import threading
import time
import os
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler, FileCreatedEvent

from src.config_loader import AppConfig
from src.pipeline import Pipeline

logger = logging.getLogger(__name__)

# Wait this many seconds after a PDF is first detected before triggering the pipeline.
# Allows multiple PDFs dropped at roughly the same time to be batched together,
# and gives large files time to finish copying.
FILE_SETTLE_DELAY = 5.0


class PDFHandler(FileSystemEventHandler):
    """
    Watchdog handler that batches new PDFs and triggers a single pipeline run.

    When a PDF is detected:
    - A timer is (re-)started for FILE_SETTLE_DELAY seconds.
    - When the timer fires, pipeline.run() is called with no specific path —
      it picks up ALL PDFs currently in the inbox so they are processed together
      (important for multi-newspaper story grouping and perspective synthesis).
    - A threading lock prevents concurrent pipeline runs.
    """

    def __init__(self, pipeline: Pipeline):
        self.pipeline = pipeline
        self._lock = threading.Lock()
        self._timer: threading.Timer = None
        super().__init__()

    def on_created(self, event: FileCreatedEvent) -> None:
        if event.is_directory:
            return
        if not event.src_path.lower().endswith(".pdf"):
            return

        logger.info("New PDF detected: %s", os.path.basename(event.src_path))
        self._schedule_run()

    def _schedule_run(self) -> None:
        """(Re-)start the settle timer. Resets if more PDFs arrive quickly."""
        if self._timer is not None:
            self._timer.cancel()
        self._timer = threading.Timer(FILE_SETTLE_DELAY, self._run_pipeline)
        self._timer.daemon = True
        self._timer.start()

    def _run_pipeline(self) -> None:
        """Run the pipeline, ensuring only one run happens at a time."""
        if not self._lock.acquire(blocking=False):
            logger.info("Pipeline already running — new PDFs will be picked up next time.")
            return
        try:
            self.pipeline.run()   # no pdf_paths → processes all inbox PDFs as one batch
        except Exception as e:
            logger.error("Pipeline error: %s", e, exc_info=True)
        finally:
            self._lock.release()


CLOUD_POLL_INTERVAL = 30  # seconds between Supabase Storage polls


class CloudStoragePoller:
    """
    Polls cloud storage (e.g. Supabase) for new PDFs at a fixed interval.
    Used instead of FolderWatcher when STORAGE_PROVIDER != 'local', because
    watchdog can only monitor the local filesystem, not cloud buckets.
    """

    def __init__(self, config: AppConfig):
        self.pipeline = Pipeline(config)
        self._lock = threading.Lock()

    def start(self) -> None:
        """Poll cloud storage in a loop. Blocks until interrupted."""
        logger.info("Polling cloud storage for new PDFs every %ds", CLOUD_POLL_INTERVAL)
        logger.info("Press Ctrl+C to stop.")
        try:
            while True:
                self._check_and_run()
                time.sleep(CLOUD_POLL_INTERVAL)
        except (KeyboardInterrupt, SystemExit):
            logger.info("Cloud storage poller stopped.")

    def _check_and_run(self) -> None:
        if not self._lock.acquire(blocking=False):
            logger.info("Pipeline already running — skipping poll.")
            return
        try:
            self.pipeline.run()
        except Exception as e:
            logger.error("Pipeline error: %s", e, exc_info=True)
        finally:
            self._lock.release()


class FolderWatcher:
    """Watches the inbox folder for new PDF files."""

    def __init__(self, config: AppConfig):
        self.config = config
        self.pipeline = Pipeline(config)
        inbox_path = os.path.abspath(config.storage.inbox_path)
        os.makedirs(inbox_path, exist_ok=True)
        self.inbox_path = inbox_path

    def start(self) -> None:
        """Start watching. Blocks until interrupted (Ctrl+C or SIGTERM)."""
        handler = PDFHandler(self.pipeline)
        observer = Observer()
        observer.schedule(handler, self.inbox_path, recursive=False)

        editorial_inbox = getattr(self.config.storage, "editorial_inbox_path", "")
        if editorial_inbox:
            abs_editorial = os.path.abspath(editorial_inbox)
            os.makedirs(abs_editorial, exist_ok=True)
            observer.schedule(handler, abs_editorial, recursive=False)
            logger.info("Watching for editorial PDFs in: %s", abs_editorial)

        observer.start()

        logger.info("Watching for PDFs in: %s", self.inbox_path)
        logger.info("Press Ctrl+C to stop.")

        try:
            while True:
                time.sleep(1)
        except (KeyboardInterrupt, SystemExit):
            logger.info("Shutting down watcher...")
        finally:
            observer.stop()
            observer.join()
            logger.info("Watcher stopped.")
