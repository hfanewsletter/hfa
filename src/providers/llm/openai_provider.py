import base64
import json
import logging
import time
import concurrent.futures
from datetime import date
from typing import List, Dict, Any, Optional

from src.providers.llm.base import LLMProvider
from src.models import Article

logger = logging.getLogger(__name__)

TEXT_CHUNK_SIZE = 4   # Pages per API call for text PDFs
IMAGE_CHUNK_SIZE = 2  # Pages per API call for image PDFs
MAX_RETRIES = 7
RETRY_BACKOFF       = [5,  15, 30, 60, 120, 180, 240]  # General errors
RATELIMIT_BACKOFF   = [15, 30, 60, 90, 120, 180, 240]  # TPM/RPM rate limits (need longer initial wait)


class OpenAIProvider(LLMProvider):

    def __init__(self, api_key: str, model: str = "gpt-4.1-mini", embedding_model: str = "text-embedding-3-small", max_concurrent: int = 5):
        try:
            from openai import OpenAI
        except ImportError:
            raise ImportError("openai package is required. Run: pip install openai>=1.30.0")
        self.client = OpenAI(api_key=api_key, max_retries=0)  # retries handled manually
        self.model_name = model
        self.embedding_model = embedding_model
        self.max_concurrent = max_concurrent

    def _call_with_retry(self, messages: list) -> str:
        """Call the OpenAI Chat API with automatic retry on transient failures."""
        from openai import RateLimitError, APIStatusError, APIConnectionError

        for attempt in range(MAX_RETRIES):
            try:
                response = self.client.chat.completions.create(
                    model=self.model_name,
                    messages=messages,
                )
                text = response.choices[0].message.content
                if not text:
                    raise ValueError("OpenAI returned empty response")
                return text
            except RateLimitError as e:
                wait = RATELIMIT_BACKOFF[min(attempt, len(RATELIMIT_BACKOFF) - 1)]
                logger.warning(
                    "OpenAI rate limit (attempt %d/%d): %s. Retrying in %ds...",
                    attempt + 1, MAX_RETRIES, e, wait,
                )
            except APIStatusError as e:
                if e.status_code in (400, 404):
                    raise  # Not retryable
                wait = RETRY_BACKOFF[min(attempt, len(RETRY_BACKOFF) - 1)]
                logger.warning(
                    "OpenAI API error (attempt %d/%d): %s. Retrying in %ds...",
                    attempt + 1, MAX_RETRIES, e, wait,
                )
            except Exception as e:
                wait = RETRY_BACKOFF[min(attempt, len(RETRY_BACKOFF) - 1)]
                logger.warning(
                    "Network/timeout error (attempt %d/%d): %s. Retrying in %ds...",
                    attempt + 1, MAX_RETRIES, e, wait,
                )
            time.sleep(wait)

        raise RuntimeError(f"OpenAI API failed after {MAX_RETRIES} attempts.")

    # ------------------------------------------------------------------
    # Article extraction
    # ------------------------------------------------------------------

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
        chunks = [pages[i:i + TEXT_CHUNK_SIZE] for i in range(0, total_pages, TEXT_CHUNK_SIZE)]
        logger.info(
            "Extracting text PDF: %d pages → %d chunks, up to %d parallel",
            total_pages, len(chunks), self.max_concurrent,
        )
        results: List[Optional[List[Article]]] = [None] * len(chunks)

        with concurrent.futures.ThreadPoolExecutor(max_workers=self.max_concurrent) as executor:
            future_to_idx = {
                executor.submit(self._text_chunk_worker, chunk, total_pages, source_pdf): i
                for i, chunk in enumerate(chunks)
            }
            for future in concurrent.futures.as_completed(future_to_idx):
                idx = future_to_idx[future]
                try:
                    results[idx] = future.result()
                except Exception as e:
                    logger.error("Text chunk %d failed permanently: %s", idx, e)
                    results[idx] = []

        return [a for batch in results if batch for a in batch]

    def _text_chunk_worker(self, chunk: List[Dict], total_pages: int, source_pdf: str) -> List[Article]:
        page_nums = [p["page_num"] for p in chunk]
        label = f"{page_nums[0]}-{page_nums[-1]}" if len(page_nums) > 1 else str(page_nums[0])
        logger.info("Sending pages %s of %d to OpenAI...", label, total_pages)

        combined_text = "".join(f"\n\n[PAGE {p['page_num']}]\n{p['text']}" for p in chunk)
        prompt = f"""You are analyzing pages {page_nums[0]} to {page_nums[-1]} of a newspaper PDF. Extract ALL news and editorial articles.

RULES:
- Include ONLY news articles, opinion pieces, and editorial content
- EXCLUDE: advertisements, classifieds, weather forecasts, stock tables, TV/radio listings, crossword puzzles, sports score tables
- For each article, extract its complete text (not just the headline)
- An article may continue from a previous page or onto the next; extract whatever is visible here

Return a JSON array. Each element must have exactly these fields:
- "title": The article headline (string). If no headline is printed (e.g. a continuation page), derive a concise descriptive title (5–8 words) from the article content — NEVER use "Untitled" or any variation of it.
- "content": The full article text visible in these pages (string)
- "page_number": The page where the article starts (integer)
- "category": Choose the single best fit from: Politics, Business, Sports, Local, International, Opinion, Science, Technology, Health, Entertainment, Crime, Environment. Use "General" if none fit.
- "importance_score": Integer 1-10 rating of the article's news importance:
  1-2: Trivial (community events, routine announcements)
  3-4: Moderate (local government, business news, sports results)
  5-6: Notable (significant policy changes, major local events)
  7-8: Major (significant national events, major crimes, natural disasters)
  9-10: Critical breaking news (major conflicts, election results, mass casualty events, landmark legislation, deaths of prominent public figures)

Return ONLY the JSON array, no other text. If no news articles are found on these pages, return [].

NEWSPAPER CONTENT:
{combined_text}
"""
        response_text = self._call_with_retry([{"role": "user", "content": prompt}])
        articles = self._parse_articles_response(response_text, source_pdf)
        logger.info("  → Got %d article(s) from pages %s", len(articles), label)
        return articles

    def _extract_from_images(self, pages: List[Dict], source_pdf: str) -> List[Article]:
        total_pages = len(pages)
        chunks = [pages[i:i + IMAGE_CHUNK_SIZE] for i in range(0, total_pages, IMAGE_CHUNK_SIZE)]
        logger.info(
            "Extracting image PDF: %d pages → %d chunks, up to %d parallel",
            total_pages, len(chunks), self.max_concurrent,
        )
        results: List[Optional[List[Article]]] = [None] * len(chunks)

        with concurrent.futures.ThreadPoolExecutor(max_workers=self.max_concurrent) as executor:
            future_to_idx = {
                executor.submit(self._image_chunk_worker, chunk, total_pages, source_pdf): i
                for i, chunk in enumerate(chunks)
            }
            for future in concurrent.futures.as_completed(future_to_idx):
                idx = future_to_idx[future]
                try:
                    results[idx] = future.result()
                except Exception as e:
                    logger.error("Image chunk %d failed permanently: %s", idx, e)
                    results[idx] = []

        return [a for batch in results if batch for a in batch]

    def _image_chunk_worker(self, chunk: List[Dict], total_pages: int, source_pdf: str) -> List[Article]:
        page_nums = [p["page_num"] for p in chunk]
        label = f"{page_nums[0]}-{page_nums[-1]}" if len(page_nums) > 1 else str(page_nums[0])
        logger.info("Sending image pages %s of %d to OpenAI Vision...", label, total_pages)

        prompt = f"""You are analyzing pages {page_nums[0]} to {page_nums[-1]} of a newspaper. Extract all news and editorial articles visible in these pages.

RULES:
- Include ONLY news articles, opinion pieces, and editorial content
- EXCLUDE: advertisements, classifieds, weather forecasts, stock tables, TV listings, puzzles
- Extract complete article text visible on these pages

Return a JSON array. Each element must have exactly:
- "title": Article headline (string). If no headline is printed, derive a concise descriptive title (5–8 words) — NEVER use "Untitled".
- "content": Full article text as visible on these pages (string)
- "page_number": The page where the article starts (integer)
- "category": Choose the single best fit from: Politics, Business, Sports, Local, International, Opinion, Science, Technology, Health, Entertainment, Crime, Environment. Use "General" if none fit.
- "importance_score": Integer 1-10 rating of the article's news importance:
  1-2: Trivial (community events, routine announcements)
  3-4: Moderate (local government, business news, sports results)
  5-6: Notable (significant policy changes, major local events)
  7-8: Major (significant national events, major crimes, natural disasters)
  9-10: Critical breaking news (major conflicts, election results, mass casualty events, landmark legislation, deaths of prominent public figures)

Return ONLY the JSON array, no other text. If no news articles are found, return [].
"""
        content: List[Dict] = [{"type": "text", "text": prompt}]
        for page in chunk:
            b64 = base64.b64encode(page["image_bytes"]).decode()
            content.append({
                "type": "image_url",
                "image_url": {"url": f"data:image/png;base64,{b64}", "detail": "high"},
            })

        response_text = self._call_with_retry([{"role": "user", "content": content}])
        articles = self._parse_articles_response(response_text, source_pdf)
        logger.info("  → Got %d article(s) from image pages %s", len(articles), label)
        return articles

    def _parse_articles_response(self, response_text: str, source_pdf: str) -> List[Article]:
        text = response_text.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(lines[1:-1]) if lines[-1] == "```" else "\n".join(lines[1:])
        text = text.strip()

        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            logger.warning("Failed to parse OpenAI response as JSON: %s", text[:200])
            return []

        articles = []
        for item in data:
            if not isinstance(item, dict):
                continue
            title = item.get("title", "").strip()
            content = item.get("content", "").strip()
            page_num = item.get("page_number", 1)
            category = item.get("category", "General").strip() or "General"
            importance_score = max(1, min(10, int(item.get("importance_score", 5) or 5)))
            if title.lower().startswith("untitled"):
                logger.warning("Skipping article with placeholder title '%s' on page %s", title, page_num)
                continue
            if title and content:
                articles.append(Article(
                    title=title,
                    content=content,
                    page_number=int(page_num),
                    source_pdf=source_pdf,
                    category=category,
                    importance_score=importance_score,
                ))
        return articles

    # ------------------------------------------------------------------
    # Embeddings
    # ------------------------------------------------------------------

    def get_embedding(self, text: str) -> List[float]:
        truncated = text[:8000]
        response = self.client.embeddings.create(
            model=self.embedding_model,
            input=truncated,
        )
        return response.data[0].embedding

    # ------------------------------------------------------------------
    # Rewrite
    # ------------------------------------------------------------------

    def rewrite_articles(self, articles: List[Article]) -> str:
        if len(articles) == 1:
            sources_block = f"SOURCE 1 ({articles[0].source_pdf}):\nHEADLINE: {articles[0].title}\n\n{articles[0].content}"
        else:
            sources_block = "\n\n---\n\n".join(
                f"SOURCE {i+1} ({a.source_pdf}):\nHEADLINE: {a.title}\n\n{a.content}"
                for i, a in enumerate(articles)
            )

        num_sources = len(articles)
        perspective_instruction = (
            "These come from different publications and may present different perspectives or emphasis. "
            "Your rewrite must be unbiased, represent all significant viewpoints, and not favour any single source."
            if num_sources > 1
            else "Rewrite this article in the publication's own voice."
        )

        prompt = f"""You are a staff writer for a professional news publication. Your task is to write an original news article based on the source material below.

{perspective_instruction}

REQUIREMENTS:
- Length: 300-500 words
- Tone: neutral, factual, professional (like AP or Reuters style)
- Cover the key facts: who, what, when, where, why/how
- Do NOT copy sentences verbatim from any source
- Do NOT include a headline — write only the article body
- Do NOT mention or name the source publications
- If sources disagree, present both sides fairly

SOURCE MATERIAL ({num_sources} source{'s' if num_sources > 1 else ''}):
{sources_block}

Write only the article body, nothing else.
"""
        return self._call_with_retry([{"role": "user", "content": prompt}]).strip()

    # ------------------------------------------------------------------
    # Newspaper date extraction
    # ------------------------------------------------------------------

    def extract_newspaper_date(self, first_page_image: bytes) -> Optional[date]:
        """Ask GPT-4o Vision to read the publication date from the newspaper's front page."""
        b64 = base64.b64encode(first_page_image).decode()
        messages = [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "This is the front page of a newspaper. "
                            "Find the publication date printed on it (usually in the masthead near the top). "
                            "Return ONLY the date in ISO format: YYYY-MM-DD\n"
                            "If you cannot find a clear date, return: null"
                        ),
                    },
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/png;base64,{b64}", "detail": "high"},
                    },
                ],
            }
        ]
        try:
            text = self._call_with_retry(messages).strip()
            if not text or text.lower() == "null":
                return None
            parts = text.split("-")
            if len(parts) == 3:
                return date(int(parts[0]), int(parts[1]), int(parts[2]))
        except Exception as e:
            logger.debug("OpenAI newspaper date extraction failed: %s", e)
        return None

    # ------------------------------------------------------------------
    # Summarize
    # ------------------------------------------------------------------

    def summarize(self, rewritten_content: str) -> str:
        prompt = f"""Write a 2-sentence summary of the following news article for an email newsletter.

RULES:
- Sentence 1: the core fact (who did what, or what happened).
- Sentence 2: the significance or key detail (why it matters, what happens next).
- Write in your own words — do NOT copy phrases from the original.
- Be specific and factual. No filler phrases like "This article..." or "In a significant development...".

ARTICLE:
{rewritten_content}

Write only the 2-sentence summary, nothing else.
"""
        return self._call_with_retry([{"role": "user", "content": prompt}]).strip()
