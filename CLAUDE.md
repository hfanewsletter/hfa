# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project does

Watches a folder (local) or cloud bucket (Supabase Storage) for newspaper PDFs, extracts articles using Gemini AI, groups same-story articles across multiple newspapers, rewrites each group into a single unbiased 300–500 word article, stores them in a database, serves them on a Next.js website, and emails a digest to subscribers.

## Running the service

```bash
# Install Python dependencies
pip install -r requirements.txt

# Copy and fill in credentials
cp .env.example .env

# Start watching inbox/ for new PDFs
python src/main.py

# Process existing PDFs in inbox/ then watch
python src/main.py --process-existing

# Process existing PDFs and exit (no watcher)
python src/main.py --run-once

# Resend last digest email without reprocessing any PDFs
python src/main.py --resend-last

# Generate weekly edition for a specific date
python src/main.py --generate-weekly 2026-03-27
```

```bash
# Run the Next.js website (local dev)
cd web && npm install && npm run dev
# Visit http://localhost:3000
```

## Docker

```bash
docker-compose up --build
# Drop PDFs into ./inbox/ — the container picks them up automatically
```

## Configuration

All runtime behaviour is controlled by `config/config.yaml` plus environment variables in `.env`.

| Goal | What to change |
|---|---|
| Switch LLM provider | `llm.provider` in config.yaml + update `LLM_API_KEY` in .env |
| Switch storage backend | `STORAGE_PROVIDER` env var (`local` or `supabase`) |
| Change subscribers | `email.subscribers` list in config.yaml |
| Tune duplicate sensitivity | `deduplication.similarity_threshold` (0–1, default 0.85) |
| Tune story-grouping sensitivity | `rewriter.grouping_threshold` (0–1, default 0.80) |
| Production email schedule | `email.send_immediately: false` + set `email.schedule_cron` |
| Max age of newspaper to include in email | `processing.max_newspaper_age_days` (0 = disabled) |
| Website URL | `WEBSITE_BASE_URL` in .env (used in article links + email logo) |

### Required env vars for production (Railway)

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Service role key (bypasses RLS, used by both DB and Storage providers) |
| `LLM_API_KEY` | Gemini API key |
| `STORAGE_PROVIDER` | Must be `supabase` (defaults to `local` from config.yaml) |
| `WEBSITE_BASE_URL` | Netlify URL, e.g. `https://hsa-newsletter.netlify.app` (no trailing slash) |
| `EMAIL_SENDER` | Gmail address for sending digests |
| `EMAIL_PASSWORD` | Gmail App Password (16-char) |

## Architecture

```
inbox/ (local folder or Supabase Storage bucket "pdfs/inbox/")
  └─ PDF dropped here (via admin UI upload or manual copy)
       │
       ▼
src/watcher.py
  ├─ FolderWatcher        watchdog detects new .pdf (local storage only)
  └─ CloudStoragePoller   polls Supabase Storage every 30s (production)
       │
       ▼
src/pipeline.py           orchestrates the full flow
  ├─ _filter_already_processed()  skips PDFs already in DB as "processed"
  ├─ src/date_detector.py     detects newspaper date: filename → PDF metadata →
  │                            first-page text → Gemini front-page scan
  ├─ src/pdf_processor.py     pymupdf: text vs image detection, content extraction
  ├─ src/article_extractor.py sends content to LLM → List[Article]
  ├─ src/rewriter.py          groups same-story articles (cosine sim) → rewrites
  │                            each group into one unified 300-500 word article
  ├─ src/deduplicator.py      embeddings + cosine similarity → skips already-published stories
  ├─ src/summarizer.py        LLM summarizes rewritten article → 4-5 sentence email teaser
  ├─ src/providers/db/        saves articles + PDFs to SQLite (dev) or Supabase (prod)
  │    └─ data/articles.db    SQLite: articles, pdfs, digests, weekly_editions, schedules
  ├─ src/digest_store.py      saves digest record AFTER successful email delivery
  └─ src/email_sender.py      Gmail SMTP (30s timeout) → renders templates/email_digest.html
       │
       ▼
processed/ (local folder or Supabase Storage "pdfs/processed/")

web/ (Next.js website — npm run dev)
  ├─ /                     Homepage: hero story + featured grid + sidebar
  ├─ /article/:slug        Full rewritten article (no source PDFs shown to users)
  ├─ /section/:name        Articles by category
  ├─ /archive              Past editions by date
  ├─ /archive/:date        Edition page: hero + featured + sidebar (8 max) + full-width grid
  ├─ /newsletter           Email digest archive
  └─ /admin                Upload PDFs, view status, manage weekly edition schedule
```

## Provider abstractions

**LLM providers** (`src/providers/llm/`):
- `base.py` — `LLMProvider` ABC: `extract_articles()`, `get_embedding()`, `rewrite_articles()`, `summarize()`, `extract_newspaper_date()`
- `gemini.py` — active implementation (`gemini-2.5-flash` + `gemini-embedding-001`)
  - `MAX_CONCURRENT = 3` (parallel API calls — kept low to avoid 503 overload)
  - `MAX_RETRIES = 5`, backoff `[5, 15, 30, 60, 120]`s
  - Articles with titles starting "Untitled" are filtered out
- `__init__.py` — `get_llm_provider(name, api_key, model, embedding_model)` factory

**Storage providers** (`src/providers/storage/`):
- `base.py` — `StorageProvider` ABC: `list_new_files()`, `list_editorial_files()`, `read_file()`, `move_to_processed()`, `get_file_url()`
- `local.py` — local filesystem (default for dev)
- `supabase_storage.py` — Supabase Storage (production). Bucket `pdfs` with folders `inbox/`, `editorial_inbox/`, `processed/`. Requires `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`.
- `__init__.py` — `get_storage_provider(name, config)` factory. Set `STORAGE_PROVIDER=supabase` for production.

**DB providers** (`src/providers/db/`):
- `base.py` — `DBProvider` ABC
- `sqlite.py` — local dev (reads/writes `data/articles.db`)
- `supabase_provider.py` — production (Supabase PostgreSQL)
- `__init__.py` — auto-selects: uses `SUPABASE_SERVICE_KEY` (preferred, bypasses RLS) or `SUPABASE_KEY` with `SUPABASE_URL`. Falls back to SQLite if neither is set.

## Key data models (`src/models.py`)

- `Article` — raw extracted article: `title`, `content`, `page_number`, `source_pdf`, `category`, `importance_score`
- `ProcessedArticle` — after pipeline: adds `summary`, `rewritten_content`, `embedding`, `pdf_link`, `is_duplicate`, `duplicate_of`, `importance_score`, `source_pdfs` (all PDFs in story group)

## Database tables (`data/articles.db` / Supabase)

- `articles` — rewritten articles: `slug`, `title`, `rewritten_content`, `summary`, `category`, `embedding_json`, `source_pdfs` (JSONB), `published_at`, `importance_score`, `is_breaking`, `website_url`, `image_url`
- `pdfs` — uploaded PDFs: `filename`, `status` (pending/processing/processed/failed), `article_count`, `uploaded_at`, `processed_at`
- `digests` — sent email digests: `batch_id`, `article_slugs`, `sent_at`. Only created after successful email delivery.
- `weekly_editions` — generated PDF newspapers
- `schedules` — cron schedules for weekly edition generation

Schema: `scripts/supabase_schema.sql`

## Pipeline safeguards

- **Skip already-processed PDFs**: Before extraction, pipeline checks DB for filenames with status "processed". Prevents re-processing loop when files stay in inbox.
- **Move-or-delete from inbox**: After processing, `move_to_processed()` moves the file. If move fails (destination exists), deletes the inbox copy instead.
- **PDF record dedup**: `save_pdf_record()` finds and updates existing pending/processing records instead of always inserting new ones.
- **Email-before-digest**: Digest record only saved to DB after at least one email is delivered successfully.

## Newspaper date detection (4-step chain)

1. **Filename** — regex parses common date formats (e.g. `The Times - 25 March 2026.pdf`)
2. **PDF metadata** — reads `creationDate` / `modDate` from PDF metadata
3. **First page text** — extracts text from page 1 and runs same date regex (catches text-based PDFs like `The Daily Telegraph_2503.pdf`)
4. **Gemini front-page scan** — renders page 1 as image, asks Gemini to read the printed date (fallback for scanned/image PDFs)

If all four fail, `published_at` defaults to today's date.

## Homepage date logic

- Homepage only shows articles where `DATE(published_at) = today`
- Old newspapers (past dates) are saved to DB but appear only in the `/archive` section
- If `processing.max_newspaper_age_days > 0`, articles from papers older than that threshold are archived-only AND excluded from the email digest

## Website UI notes

- **No newspaper images used** — avoids copyright issues with source PDFs. No thumbnails extracted from PDFs.
- **Source PDFs not shown to users** — kept in DB (`source_pdfs` column) for internal tracking but hidden from article pages and the public UI.
- Article cards are text-only: red left border (grid) or red top border (hero) as visual anchor
- Category-specific colours defined in `web/src/lib/utils.ts`
- `"Times"` in the masthead is intentionally small/subtle (30% size, 60% opacity)
- Edition page (`/archive/:date`): sidebar limited to 8 articles, remaining flow into full-width 3-column grid below

## Email digest

- Template: `templates/email_digest.html` (Jinja2)
- Logo loaded from `{{ website_base_url }}/logo.jpeg`
- Variables passed: `articles`, `date`, `total_count`, `title`, `subscribe_url`, `unsubscribe_url`, `website_base_url`
- SMTP timeout: 30 seconds. Credentials validated before connection attempt.
- `send_digest()` returns `True`/`False` — digest record only saved on success.

## Tech stack

| Part | Local dev | Production |
|---|---|---|
| Web (frontend + API) | Next.js `npm run dev` | Netlify |
| Python pipeline | Background worker (watchdog) | Railway (CloudStoragePoller) |
| Database | SQLite (`data/articles.db`) | Supabase PostgreSQL |
| File storage | Local folders (`inbox/`, `processed/`) | Supabase Storage (bucket: `pdfs`) |

## Resending a failed email

```bash
python src/main.py --resend-last
```
Loads the last saved digest from the DB and resends — no PDF reprocessing needed.
