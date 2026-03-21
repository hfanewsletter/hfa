import json
import logging
import time
from typing import List, Dict, Any
from google import genai
from google.genai import types
from google.genai import errors as genai_errors

from src.providers.llm.base import LLMProvider
from src.models import Article

logger = logging.getLogger(__name__)

CHUNK_SIZE = 2        # Pages per API call
REQUEST_TIMEOUT = 90  # Seconds before a single API call is considered hung
MAX_RETRIES = 3       # Retry attempts per chunk on transient failures
RETRY_BACKOFF = [5, 15, 30]  # Seconds to wait between retries


class GeminiProvider(LLMProvider):

    def __init__(self, api_key: str, model: str = "gemini-2.5-flash", embedding_model: str = "gemini-embedding-001"):
        self.client = genai.Client(
            api_key=api_key,
            http_options=types.HttpOptions(timeout=REQUEST_TIMEOUT * 1000),  # milliseconds
        )
        self.model_name = model
        self.embedding_model = embedding_model

    def _call_with_retry(self, contents) -> str:
        """
        Call the Gemini API with automatic retry on transient failures.
        Retries on: network errors, timeouts, 429 rate limits, 500/503 server errors.
        Does NOT retry on: 404 (model not found), 400 (bad request).
        """
        for attempt in range(MAX_RETRIES):
            try:
                response = self.client.models.generate_content(
                    model=self.model_name,
                    contents=contents,
                )
                return response.text
            except genai_errors.ClientError as e:
                status = e.status_code if hasattr(e, "status_code") else 0
                if status in (404, 400):
                    raise  # Not retryable
                wait = RETRY_BACKOFF[attempt] if attempt < len(RETRY_BACKOFF) else RETRY_BACKOFF[-1]
                logger.warning(
                    "Gemini API error (attempt %d/%d): %s. Retrying in %ds...",
                    attempt + 1, MAX_RETRIES, e, wait,
                )
            except Exception as e:
                wait = RETRY_BACKOFF[attempt] if attempt < len(RETRY_BACKOFF) else RETRY_BACKOFF[-1]
                logger.warning(
                    "Network/timeout error (attempt %d/%d): %s. Retrying in %ds...",
                    attempt + 1, MAX_RETRIES, e, wait,
                )
            time.sleep(wait)

        raise RuntimeError(f"Gemini API failed after {MAX_RETRIES} attempts.")

    def extract_articles(self, content: Dict[str, Any]) -> List[Article]:
        source_pdf = content["source_pdf"]
        content_type = content["type"]
        pages = content["pages"]

        if content_type == "text":
            return self._extract_from_text(pages, source_pdf)
        elif content_type == "image":
            return self._extract_from_images(pages, source_pdf)
        else:
            raise ValueError(f"Unknown content type: {content_type}")

    def _extract_from_text(self, pages: List[Dict], source_pdf: str) -> List[Article]:
        total_pages = len(pages)
        all_articles = []

        # Process in small chunks to avoid token limits and timeouts
        for chunk_start in range(0, total_pages, CHUNK_SIZE):
            chunk = pages[chunk_start: chunk_start + CHUNK_SIZE]
            page_nums = [p["page_num"] for p in chunk]
            logger.info(
                "Sending pages %s of %d to Gemini...",
                f"{page_nums[0]}-{page_nums[-1]}" if len(page_nums) > 1 else str(page_nums[0]),
                total_pages,
            )

            combined_text = ""
            for page in chunk:
                combined_text += f"\n\n[PAGE {page['page_num']}]\n{page['text']}"

            prompt = f"""You are analyzing pages {page_nums[0]} to {page_nums[-1]} of a newspaper PDF. Extract ALL news and editorial articles.

RULES:
- Include ONLY news articles, opinion pieces, and editorial content
- EXCLUDE: advertisements, classifieds, weather forecasts, stock tables, TV/radio listings, crossword puzzles, sports score tables
- For each article, extract its complete text (not just the headline)
- An article may continue from a previous page or onto the next; extract whatever is visible here

Return a JSON array. Each element must have exactly these fields:
- "title": The article headline (string)
- "content": The full article text visible in these pages (string)
- "page_number": The page where the article starts (integer)

Return ONLY the JSON array, no other text. If no news articles are found on these pages, return [].

NEWSPAPER CONTENT:
{combined_text}
"""
            response_text = self._call_with_retry(prompt)
            articles = self._parse_articles_response(response_text, source_pdf)
            logger.info(
                "  → Got %d article(s) from pages %s",
                len(articles),
                f"{page_nums[0]}-{page_nums[-1]}" if len(page_nums) > 1 else str(page_nums[0]),
            )
            all_articles.extend(articles)

        return all_articles

    def _extract_from_images(self, pages: List[Dict], source_pdf: str) -> List[Article]:
        total_pages = len(pages)
        all_articles = []

        # Process in small chunks to avoid token limits and timeouts
        for chunk_start in range(0, total_pages, CHUNK_SIZE):
            chunk = pages[chunk_start: chunk_start + CHUNK_SIZE]
            page_nums = [p["page_num"] for p in chunk]
            logger.info(
                "Sending image pages %s of %d to Gemini Vision...",
                f"{page_nums[0]}-{page_nums[-1]}" if len(page_nums) > 1 else str(page_nums[0]),
                total_pages,
            )

            prompt = f"""You are analyzing pages {page_nums[0]} to {page_nums[-1]} of a newspaper. Extract all news and editorial articles visible in these pages.

RULES:
- Include ONLY news articles, opinion pieces, and editorial content
- EXCLUDE: advertisements, classifieds, weather forecasts, stock tables, TV listings, puzzles
- Extract complete article text visible on these pages

Return a JSON array. Each element must have exactly:
- "title": Article headline (string)
- "content": Full article text as visible on these pages (string)
- "page_number": The page where the article starts (integer)

Return ONLY the JSON array, no other text. If no news articles are found, return [].
"""
            contents = [prompt]
            for page in chunk:
                contents.append(types.Part.from_bytes(
                    data=page["image_bytes"],
                    mime_type="image/png",
                ))

            response_text = self._call_with_retry(contents)
            articles = self._parse_articles_response(response_text, source_pdf)
            logger.info(
                "  → Got %d article(s) from image pages %s",
                len(articles),
                f"{page_nums[0]}-{page_nums[-1]}" if len(page_nums) > 1 else str(page_nums[0]),
            )
            all_articles.extend(articles)

        return all_articles

    def _parse_articles_response(self, response_text: str, source_pdf: str) -> List[Article]:
        text = response_text.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(lines[1:-1]) if lines[-1] == "```" else "\n".join(lines[1:])
        text = text.strip()

        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            logger.warning("Failed to parse Gemini response as JSON: %s", text[:200])
            return []

        articles = []
        for item in data:
            if not isinstance(item, dict):
                continue
            title = item.get("title", "").strip()
            content = item.get("content", "").strip()
            page_num = item.get("page_number", 1)
            if title and content:
                articles.append(Article(
                    title=title,
                    content=content,
                    page_number=int(page_num),
                    source_pdf=source_pdf,
                ))
        return articles

    def get_embedding(self, text: str) -> List[float]:
        truncated = text[:8000]
        result = self.client.models.embed_content(
            model=self.embedding_model,
            contents=truncated,
        )
        return result.embeddings[0].values

    def summarize(self, article: Article) -> str:
        prompt = f"""Summarize the following news article in exactly 3 to 4 sentences.

IMPORTANT INSTRUCTIONS:
- Write entirely in your own words. Do NOT copy any phrases or sentences from the original.
- Paraphrase all information to create 100% original content.
- Cover the essential facts: who, what, when, where, and why/how.
- Be concise and factual.
- Do not start with phrases like "This article..." or "The article discusses..."

ARTICLE TITLE: {article.title}

ARTICLE CONTENT:
{article.content}

Write only the summary, nothing else.
"""
        return self._call_with_retry(prompt).strip()
