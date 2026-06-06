import os
import shutil
import logging
from typing import List
from src.providers.storage.base import StorageProvider

logger = logging.getLogger(__name__)


class LocalStorageProvider(StorageProvider):
    """Local filesystem storage. Watches inbox_path for new PDFs."""

    def __init__(self, config: dict):
        self.inbox_path = os.path.abspath(config["inbox_path"])
        self.processed_path = os.path.abspath(config["processed_path"])
        self.failed_path = os.path.join(os.path.dirname(self.processed_path), "failed")
        os.makedirs(self.inbox_path, exist_ok=True)
        os.makedirs(self.processed_path, exist_ok=True)
        os.makedirs(self.failed_path, exist_ok=True)

    def list_new_files(self) -> List[str]:
        files = []
        for fname in os.listdir(self.inbox_path):
            if fname.lower().endswith(".pdf"):
                files.append(os.path.join(self.inbox_path, fname))
        return sorted(files)

    def read_file(self, file_path: str) -> bytes:
        with open(file_path, "rb") as f:
            return f.read()

    def move_to_processed(self, file_path: str) -> str:
        filename = os.path.basename(file_path)
        dest = os.path.join(self.processed_path, filename)
        # Avoid overwriting if same filename processed before
        if os.path.exists(dest):
            base, ext = os.path.splitext(filename)
            import time
            dest = os.path.join(self.processed_path, f"{base}_{int(time.time())}{ext}")
        shutil.move(file_path, dest)
        logger.info("Moved %s → %s", file_path, dest)
        return dest

    def move_to_failed(self, file_path: str) -> str:
        filename = os.path.basename(file_path)
        dest = os.path.join(self.failed_path, filename)
        if os.path.exists(dest):
            base, ext = os.path.splitext(filename)
            import time
            dest = os.path.join(self.failed_path, f"{base}_{int(time.time())}{ext}")
        shutil.move(file_path, dest)
        logger.info("Moved %s → %s (unprocessable)", file_path, dest)
        return dest

    def get_file_url(self, file_path: str) -> str:
        abs_path = os.path.abspath(file_path)
        # file:// URLs need triple slash on Unix, four on Windows
        return f"file://{abs_path}"
