import logging
import concurrent.futures
from typing import List

from src.models import ProcessedArticle
from src.providers.llm.base import LLMProvider

logger = logging.getLogger(__name__)

_SUMMARIZE_CONCURRENT_DEFAULT = 3  # Fallback if not set via config


class Summarizer:
    """
    Generates 4-5 sentence email summaries from the rewritten article content.
    Skips duplicate articles to avoid unnecessary API calls.
    """

    def __init__(self, llm_provider: LLMProvider, max_concurrent: int = _SUMMARIZE_CONCURRENT_DEFAULT):
        self.llm = llm_provider
        self.max_concurrent = max_concurrent

    def summarize_all(self, processed_articles: List[ProcessedArticle]) -> List[ProcessedArticle]:
        """
        Generate email summaries for all non-duplicate articles in parallel.
        Modifies articles in-place and returns the same list.
        """
        unique = [a for a in processed_articles if not a.is_duplicate]
        logger.info(
            "Summarizing %d unique articles (%d parallel, skipping %d duplicates)",
            len(unique),
            self.max_concurrent,
            len(processed_articles) - len(unique),
        )

        def _summarize_one(pa: ProcessedArticle) -> None:
            try:
                pa.summary = self.llm.summarize(pa.rewritten_content)
                logger.info("Summarized: '%s'", pa.article.title)
            except Exception as e:
                logger.error(
                    "Failed to summarize '%s': %s", pa.article.title, e, exc_info=True
                )
                pa.summary = pa.rewritten_content[:500].rsplit(" ", 1)[0] + "..."

        with concurrent.futures.ThreadPoolExecutor(max_workers=self.max_concurrent) as executor:
            futures = [executor.submit(_summarize_one, pa) for pa in unique]
            concurrent.futures.wait(futures)

        return processed_articles
