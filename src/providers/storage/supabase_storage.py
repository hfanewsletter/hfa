import os
import logging
from typing import List
from src.providers.storage.base import StorageProvider

logger = logging.getLogger(__name__)

BUCKET = "pdfs"


class SupabaseStorageProvider(StorageProvider):
    """
    Supabase Storage provider.

    Bucket layout inside the 'pdfs' bucket:
        inbox/              ← PDFs waiting to be processed
        editorial_inbox/    ← Editorial PDFs waiting to be processed
        processed/          ← PDFs moved here after processing

    Required env vars:
        SUPABASE_URL          — project URL (same as for the DB)
        SUPABASE_SERVICE_KEY  — service role key (allows bypassing RLS for storage)
    """

    def __init__(self, config: dict):
        from supabase import create_client
        url = os.environ["SUPABASE_URL"]
        key = os.environ["SUPABASE_SERVICE_KEY"]
        self.client = create_client(url, key)

    # ── public StorageProvider interface ──────────────────────────────────────

    def list_new_files(self) -> List[str]:
        """Return storage paths of all PDFs in the inbox/ folder."""
        return self._list_folder("inbox")

    def list_editorial_files(self) -> List[str]:
        """Return storage paths of all PDFs in the editorial_inbox/ folder."""
        return self._list_folder("editorial_inbox")

    def read_file(self, file_path: str) -> bytes:
        """Download and return raw bytes for a storage path (e.g. 'inbox/file.pdf')."""
        data = self.client.storage.from_(BUCKET).download(file_path)
        return bytes(data)

    def move_to_processed(self, file_path: str) -> str:
        """Move a storage path from inbox/ (or editorial_inbox/) to processed/."""
        filename = os.path.basename(file_path)
        dest = f"processed/{filename}"
        try:
            self.client.storage.from_(BUCKET).move(file_path, dest)
            logger.info("Moved %s → %s", file_path, dest)
        except Exception as e:
            logger.warning("Could not move %s to processed: %s", file_path, e)
        return dest

    def get_file_url(self, file_path: str) -> str:
        """Return a 1-hour signed URL for the given storage path."""
        try:
            result = self.client.storage.from_(BUCKET).create_signed_url(file_path, 3600)
            return result.get("signedURL", "")
        except Exception:
            return ""

    # ── helpers ───────────────────────────────────────────────────────────────

    def _list_folder(self, folder: str) -> List[str]:
        try:
            raw = self.client.storage.from_(BUCKET).list(folder)
            logger.info("Storage list('%s') raw response type=%s value=%s", folder, type(raw).__name__, raw)
            items = raw or []
            paths = [
                f"{folder}/{item['name']}"
                for item in items
                if isinstance(item, dict) and item.get("name", "").lower().endswith(".pdf")
            ]
            logger.info("Storage list('%s') found PDFs: %s", folder, paths)
            return sorted(paths)
        except Exception as e:
            logger.error("Failed to list Supabase Storage folder '%s': %s", folder, e)
            return []
