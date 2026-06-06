from abc import ABC, abstractmethod
from typing import List


class StorageProvider(ABC):
    """
    Abstract base class for file storage providers.
    Implement this to support cloud storage (S3, Azure Blob, GCS).
    """

    @abstractmethod
    def list_new_files(self) -> List[str]:
        """
        Return a list of paths/keys for PDF files in the inbox location
        that have not yet been processed.
        """

    @abstractmethod
    def read_file(self, file_path: str) -> bytes:
        """Read and return the binary contents of the file at file_path."""

    @abstractmethod
    def move_to_processed(self, file_path: str) -> str:
        """
        Move/copy the file from the inbox to the processed location.
        Returns the new path/key of the moved file.
        """

    @abstractmethod
    def move_to_failed(self, file_path: str) -> str:
        """
        Move the file from the inbox to a 'failed' location, used for PDFs that
        can never be processed (password-protected/encrypted/corrupt). Keeps them
        out of the inbox so the watcher stops retrying them, and separate from
        processed/ so they can be inspected. Returns the new path/key.
        """

    @abstractmethod
    def get_file_url(self, file_path: str) -> str:
        """
        Return a URL or URI that a user can click to open the file.
        For local files: file:///absolute/path/to/file.pdf
        For cloud: a signed URL or public URL.
        """
