import logging
import re
import concurrent.futures
from datetime import datetime
from typing import List, Tuple

import numpy as np
from sklearn.metrics.pairwise import cosine_similarity

from src.models import Article
from src.providers.llm.base import LLMProvider

EMBEDDING_CONCURRENT = 5  # Parallel embedding API calls

logger = logging.getLogger(__name__)


def generate_slug(title: str, date: datetime = None) -> str:
    """Convert an article title + date into a URL-safe slug."""
    if date is None:
        date = datetime.now()
    slug = title.lower()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug.strip())
    slug = slug[:55].rstrip("-")
    date_str = date.strftime("%Y-%m-%d")
    return f"{slug}-{date_str}"


class Rewriter:
    """
    Groups same-story articles from multiple newspapers and rewrites each
    group into a single unified, unbiased 300-500 word article.

    Two-step process:
    1. group_by_story()  — clusters articles by semantic similarity
    2. rewrite()         — calls the LLM to produce one article per group
    """

    def __init__(self, llm_provider: LLMProvider, grouping_threshold: float = 0.80):
        self.llm = llm_provider
        self.grouping_threshold = grouping_threshold

    def group_by_story(
        self, articles: List[Article]
    ) -> List[Tuple[List[Article], List[float]]]:
        """
        Cluster articles by semantic similarity.

        Returns a list of (group, representative_embedding) tuples where:
        - group  = list of Article objects covering the same story
        - representative_embedding = embedding of the first/primary article in the group
          (reused later for cross-run duplicate detection to avoid redundant API calls)
        """
        if not articles:
            return []

        logger.info("Generating embeddings for %d articles to group by story (%d parallel)...",
                     len(articles), EMBEDDING_CONCURRENT)
        embed_texts = [f"{a.title}\n\n{a.content[:2000]}" for a in articles]
        embeddings: List[List[float]] = [None] * len(articles)

        with concurrent.futures.ThreadPoolExecutor(max_workers=EMBEDDING_CONCURRENT) as executor:
            future_to_idx = {
                executor.submit(self.llm.get_embedding, text): i
                for i, text in enumerate(embed_texts)
            }
            for future in concurrent.futures.as_completed(future_to_idx):
                idx = future_to_idx[future]
                try:
                    embeddings[idx] = future.result()
                except Exception as e:
                    logger.error("Embedding failed for article '%s': %s", articles[idx].title, e)
                    embeddings[idx] = []

        # Remove articles with failed embeddings
        valid = [(a, e) for a, e in zip(articles, embeddings) if e]
        if len(valid) < len(articles):
            logger.warning("Dropped %d articles with failed embeddings", len(articles) - len(valid))
        articles, embeddings = ([v[0] for v in valid], [v[1] for v in valid]) if valid else ([], [])

        assigned = [False] * len(articles)
        groups: List[Tuple[List[Article], List[float]]] = []

        for i in range(len(articles)):
            if assigned[i]:
                continue

            group = [articles[i]]
            assigned[i] = True

            vec_i = np.array(embeddings[i]).reshape(1, -1)
            for j in range(i + 1, len(articles)):
                if assigned[j]:
                    continue
                vec_j = np.array(embeddings[j]).reshape(1, -1)
                sim = float(cosine_similarity(vec_i, vec_j)[0][0])
                if sim >= self.grouping_threshold:
                    group.append(articles[j])
                    assigned[j] = True
                    logger.info(
                        "  Grouped '%s' with '%s' (similarity: %.3f)",
                        articles[i].title,
                        articles[j].title,
                        sim,
                    )

            groups.append((group, embeddings[i]))

        multi = sum(1 for g, _ in groups if len(g) > 1)
        logger.info(
            "Grouped %d articles into %d stories (%d multi-source groups)",
            len(articles),
            len(groups),
            multi,
        )
        return groups

    def rewrite(self, articles: List[Article]) -> str:
        """
        Rewrite a group of articles (same story, possibly from different sources)
        into one unified 300-500 word article.
        """
        titles = " / ".join(a.title for a in articles)
        logger.info("Rewriting: '%s' (%d source(s))", titles[:80], len(articles))
        return self.llm.rewrite_articles(articles)
