# The American Express Times — Newspaper Pipeline

An automated system that watches a folder for newspaper PDF files, extracts news articles using AI, deduplicates cross-publication stories, rewrites each into a single unified article, and emails a digest to subscribers. A Next.js website displays all articles with a full archive. Editorial content is handled via a separate inbox with its own admin upload and dedicated website section.

---

## What It Does — In Plain English

1. **Drop one or more newspaper PDFs** into the `inbox/` folder (or upload via the admin panel)
2. **The system detects them automatically** and batches all PDFs dropped at roughly the same time
3. **The publication date is detected** using a 4-step chain: filename → PDF metadata → first page text → Gemini Vision scan. Old papers are archived with the correct date rather than today's
4. **AI reads every page** — text PDFs are processed directly; scanned/image PDFs go through Gemini Vision OCR. Ads, classifieds, weather tables, and puzzles are ignored
5. **Same-story articles are grouped** — if three newspapers all cover the same event, all versions are read together
6. **Each story is assigned an importance score (1–10)** by the AI, then boosted +0.5 per additional paper that covered the same story (cross-paper consensus). Score ≥ 9 becomes Breaking News
7. **Each story is rewritten** into a single original 300–500 word article — factually accurate, unbiased, presenting all sides
8. **Already-published stories are skipped** — semantic deduplication compares embeddings against every previously published article
9. **A 4–5 sentence email summary** is generated from the rewritten article
10. **An email digest is sent** to all subscribers — articles grouped by category, each linking to the full article on the website
11. **Editorial PDFs** dropped into `editorial_inbox/` are processed separately — no cross-paper grouping, forced "Editorial" category, shown only on the `/editorial` page but included in the email digest
12. **The full rewritten articles are saved** to the database and appear on the website, sorted by importance
13. **The archive** preserves every edition — readers can browse any past date
14. **A weekly PDF newspaper** can be auto-generated on a cron schedule or triggered manually from the admin panel

---

## Prerequisites

Before running the app, gather credentials for two external services.

### 1. Google Gemini API Key (required — powers the AI)

1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Sign in with your Google account
3. Click **"Get API key"** → **"Create API key"**
4. Copy the key — you will paste it into `.env` as `LLM_API_KEY`

> The free tier is sufficient for typical usage. If you see `429 Too Many Requests` errors, wait a few minutes or upgrade your plan.

### 2. Gmail App Password (required — sends the digest email)

Gmail blocks direct password login from code. You need a special 16-character App Password:

1. Go to [myaccount.google.com](https://myaccount.google.com) → **Security**
2. Enable **2-Step Verification** if it is not already on
3. Search for **"App passwords"** on the Security page
4. Create a new App Password (select "Mail" + "Other") — copy the 16-character code
5. Paste your Gmail address as `EMAIL_SENDER` and the 16-character code as `EMAIL_PASSWORD` in `.env`

> **Do not use your regular Gmail password** — it will not work and may lock your account.

### 3. System Software

| Software | Minimum version | Download |
|---|---|---|
| Python | 3.10 | [python.org](https://www.python.org/downloads/) |
| Node.js | 18 | [nodejs.org](https://nodejs.org/) |
| Git | any | [git-scm.com](https://git-scm.com/) |

**Mac — verify installs:**
```bash
python3 --version   # should say 3.10 or higher
node --version
git --version
```

**Windows — verify installs** (open Command Prompt):
```cmd
python --version
node --version
git --version
```

> **Windows install tip:** When installing Python, check **"Add Python to PATH"** or the commands above will not work.

### 4. WeasyPrint system libraries (required for weekly PDF generation only)

**Mac:**
```bash
brew install pango cairo
```
**Debian / Ubuntu:**
```bash
sudo apt-get install libpango-1.0-0 libcairo2
```
**Windows:** WeasyPrint installs without extra steps on most machines. If you see errors, see the [WeasyPrint docs](https://doc.courtbouillon.org/weasyprint/stable/first_steps.html#windows).

---

## Quick Start

Once you have the prerequisites above, starting the entire app is a single command.

**Mac / Linux:**
```bash
git clone https://github.com/hfanewsletter/hfa.git
cd hsa
./start.sh
```

**Windows:**
```cmd
git clone https://github.com/hfanewsletter/hfa.git
cd hsa
start.bat
```

The script will:
- Create a Python virtual environment if one does not exist
- Install all Python and Node.js dependencies automatically
- Create `.env` and `web/.env.local` from the example templates if they are missing
- Create all required folders (`inbox/`, `editorial_inbox/`, `processed/`, `logs/`, `data/`)
- Start the Python pipeline worker in the background
- Start the Next.js website at **http://localhost:3000**

> **First run only:** The script will pause and ask you to fill in `.env` with your API key and email credentials before continuing. Open `.env` in any text editor, fill in the required fields, save, then press Enter to continue.

Press **Ctrl + C** to stop everything (Mac/Linux). On Windows, close both the web server window and the Python worker window.

---

## Configuration

### Required — `.env` (credentials)

The startup script creates this file from `.env.example` automatically. Open it and fill in:

```env
# ── REQUIRED ─────────────────────────────────────────────────
LLM_API_KEY=paste_your_gemini_api_key_here
EMAIL_SENDER=your_gmail_address@gmail.com
EMAIL_PASSWORD=your_16_char_gmail_app_password

# ── REQUIRED FOR PRODUCTION ───────────────────────────────────
# Generate a strong password: openssl rand -base64 20
# The app blocks login after 5 failed attempts per 15 minutes.
ADMIN_PASSWORD=CHANGE_THIS_TO_A_STRONG_RANDOM_PASSWORD

# ── OPTIONAL (defaults work for local dev) ───────────────────
WEBSITE_BASE_URL=http://localhost:3000   # change to your domain in production

# ── LEAVE BLANK for local dev (SQLite is used automatically) ─
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
STORAGE_PROVIDER=local
```

| Variable | Required | Description |
|---|---|---|
| `LLM_API_KEY` | **Yes** | Your Gemini API key from Google AI Studio |
| `EMAIL_SENDER` | **Yes** | Gmail address the digest is sent from |
| `EMAIL_PASSWORD` | **Yes** | Gmail App Password (16-char code, not your real password) |
| `ADMIN_PASSWORD` | **Yes** | Password for `/admin`. Must be 20+ random characters in production. Generate with `openssl rand -base64 20` |
| `WEBSITE_BASE_URL` | No | Base URL for "Read Full Article" links in the email. Defaults to `http://localhost:3000` |
| `SUPABASE_URL` | Production only | Supabase project URL. Leave blank for local dev (SQLite is used automatically) |
| `SUPABASE_SERVICE_KEY` | Production only | Supabase **service role** key (bypasses RLS). Required for the Python pipeline to read/write the database and storage |
| `STORAGE_PROVIDER` | Production only | Set to `supabase` for production. Defaults to `local` |

### Required — `config/config.yaml` (application settings)

#### Subscriber list
```yaml
email:
  subscribers:
    - person1@example.com
    - person2@example.com
```
Every address here receives the digest email after each batch is processed.

#### Inbox folders
```yaml
storage:
  inbox_path: ./inbox               # regular newspaper PDFs
  editorial_inbox_path: ./editorial_inbox   # editorial/opinion PDFs
```
Drop regular newspaper PDFs into `inbox/` and editorial PDFs into `editorial_inbox/`. The watcher monitors both folders simultaneously.

#### Old newspaper age limit
```yaml
processing:
  max_newspaper_age_days: 3
```
If a PDF's publication date is older than this many days, its articles are still archived — but excluded from the email digest. Set to `0` to always include all articles.

#### Other settings (safe to leave as-is for local use)

| Setting | Default | What it does |
|---|---|---|
| `llm.model` | `gemini-2.5-flash` | AI model for extraction and rewriting |
| `rewriter.grouping_threshold` | `0.80` | Cosine similarity threshold for merging same-story articles |
| `deduplication.similarity_threshold` | `0.85` | Similarity threshold for skipping already-published stories |
| `email.send_immediately` | `true` | Set to `false` to schedule sends instead of sending right after processing |
| `email.schedule_cron` | `0 8 * * *` | Cron schedule used when `send_immediately` is false |
| `website.base_url` | `http://localhost:3000` | Overridden by `WEBSITE_BASE_URL` in `.env` |

---

## Folder Structure

```
hsa/
├── start.sh                  ← Mac/Linux: run this to start everything
├── start.bat                 ← Windows: run this to start everything
├── inbox/                    ← DROP NEWSPAPER PDFs HERE
├── editorial_inbox/          ← DROP EDITORIAL PDFs HERE
├── processed/                ← Processed PDFs moved here automatically
├── logs/
│   └── app.log               ← Full processing log
├── data/
│   ├── articles.db           ← SQLite database (created automatically)
│   └── weekly_editions/      ← Generated PDF newspapers saved here
├── config/
│   └── config.yaml           ← Main settings (subscribers, thresholds, inboxes)
├── web/                      ← Next.js website source
├── src/                      ← Python pipeline source code
├── web/                      ← Next.js website
├── templates/                ← Email HTML template (Jinja2)
├── scripts/
│   └── supabase_schema.sql   ← Run in Supabase SQL editor for production setup
├── .env                      ← Your credentials (never commit this file)
├── .env.example              ← Credential template (safe to share)
└── requirements.txt          ← Python dependencies
```

---

## Processing a Newspaper

Once the app is running, **drop PDF files into the `inbox/` folder** or upload via the admin panel at `http://localhost:3000/admin`.

The pipeline will:
1. Detect the file(s) within a few seconds (5-second settle timer to batch simultaneous drops)
2. Detect the newspaper's publication date using the 4-step chain (see below)
3. Extract all articles from every page in parallel (text or Gemini Vision OCR)
4. Skip PDFs that have already been processed (prevents infinite re-processing if move fails)
5. Group same-story articles across newspapers and rewrite each into one unified article
6. Skip any stories already published in a previous run (semantic deduplication)
7. Save articles to the database with website URLs
8. Send the email digest to all subscribers (digest is only saved after confirmed delivery)
9. Move the processed PDFs to `processed/`

For **editorial PDFs** (dropped into `editorial_inbox/`):
- Each article is kept as its own story — no cross-paper grouping
- Category is forced to "Editorial" regardless of content
- Articles appear only on the `/editorial` page (not homepage)
- Editorial articles are included in the email digest

Watch progress in the terminal or open `logs/app.log` at any time.

---

## Newspaper Date Detection

The system uses a 4-step chain to find the publication date of each PDF:

| Step | Method | Example |
|---|---|---|
| 1 | **Filename** | `The Times - 25 March 2026.pdf` |
| 2 | **PDF metadata** | `creationDate` / `modDate` embedded in the PDF |
| 3 | **First page text** | Masthead date extracted from page 1 text |
| 4 | **Gemini Vision scan** | Page 1 rendered as image, Gemini reads the printed date |

If all four fail, `published_at` defaults to today's date. This ensures scanned PDFs with non-standard filenames (e.g. `The Daily Telegraph_2503.pdf`) are still dated correctly.

---

## Article Importance Scoring

Each article is assigned an importance score from 1 to 10, determining its position on the homepage.

**Step 1 — LLM score (1–10):**

| Score | Meaning | Examples |
|---|---|---|
| 1–2 | Trivial | Community events, routine announcements |
| 3–4 | Moderate | Local government decisions, sports results |
| 5–6 | Notable | Significant policy changes, major local events |
| 7–8 | Major | National events, major crimes, natural disasters |
| 9–10 | Critical | Conflicts, election results, landmark legislation |

**Step 2 — Cross-paper consensus boost:** +0.5 per additional paper covering the same story, capped at 10.

**Step 3 — Homepage placement:**
- Score ≥ 9 → **Breaking News** banner
- Highest remaining → **Hero story**
- Next 4 → **Featured grid**
- Remaining → **Latest** list

Editorial articles are excluded from the homepage scoring and appear only on `/editorial`.

---

## The Website

| URL | What you see |
|---|---|
| `/` | Homepage — today's articles only: breaking banner, hero, featured grid, latest sidebar |
| `/editorial` | Today's editorial articles (link only visible when editorials exist) |
| `/section/politics` | All articles in a category (Editorial excluded from category nav) |
| `/article/some-slug` | Full 300–500 word rewritten article |
| `/archive` | All editions grouped by month |
| `/archive/2026-03-23` | A specific past edition in full homepage layout |
| `/newsletter` | Archive of all sent email digests |
| `/admin` | Admin panel (password protected) |

### Admin Panel

- **Upload PDFs** — drag-and-drop upload for regular newspaper PDFs (triggers pipeline automatically)
- **Upload Editorial PDFs** — separate upload section for editorial/opinion content
- **Processed PDFs** — paginated list (5 per page) of all PDFs with status, article count, and timestamps
- **Weekly Edition** — trigger a one-off PDF newspaper generation or manage the recurring schedule
- **Security** — login is rate-limited to 5 attempts per 15 minutes per IP; further attempts return a 15-minute lockout

---

## Command-Line Options

```bash
# Start watching both inbox/ and editorial_inbox/ for new PDFs (default)
python src/main.py

# Process all PDFs currently in both inboxes, then start watching
python src/main.py --process-existing

# Process existing PDFs and exit (no watching, no scheduler)
python src/main.py --run-once

# Resend the last digest email without reprocessing any PDFs
python src/main.py --resend-last

# Generate a weekly edition PDF for a specific date and exit
python src/main.py --generate-weekly 2026-03-21
```

### When to use `--resend-last`
If processing succeeded but the email failed (wrong password, network issue), fix the problem and run:
```bash
python src/main.py --resend-last
```
This loads the last saved digest from the database and resends — no PDF reprocessing needed.

---

## Manual Setup (Without the Start Script)

```bash
# 1. Clone and enter the project
git clone https://github.com/hfanewsletter/hfa.git
cd hsa

# 2. Create and activate a Python virtual environment
python3 -m venv venv
source venv/bin/activate          # Mac/Linux
# venv\Scripts\activate           # Windows

# 3. Install Python dependencies
pip install -r requirements.txt

# 4. Copy and fill in credentials
cp .env.example .env
# Open .env and fill in LLM_API_KEY, EMAIL_SENDER, EMAIL_PASSWORD, ADMIN_PASSWORD

# 5. Create required folders
mkdir -p inbox editorial_inbox processed logs data data/weekly_editions

# 6. Start the Python worker
python src/main.py --process-existing

# --- In a second terminal ---
# 7. Install and start the website
cd web
npm install
cp .env.local.example .env.local
# Open web/.env.local and set ADMIN_PASSWORD and AUTH_SECRET
npm run dev
```

---

## Common Issues & Solutions

### "Permission denied" on start.sh (Mac/Linux)
```bash
chmod +x start.sh
./start.sh
```

### "No module named 'google'" or similar import errors
Your virtual environment is not active:
- Mac/Linux: `source venv/bin/activate`
- Windows: `venv\Scripts\activate`

### "404 model not found" error
The model name in `config/config.yaml` may be outdated. Try `gemini-2.5-flash-001` or check [Google AI Studio](https://aistudio.google.com/) for current model names.

### "429 Too Many Requests" from Gemini
You have hit the API rate limit. The pipeline retries automatically (up to 5 times with backoff up to 2 minutes). If it keeps failing, wait a few minutes and try again, or upgrade your Google AI plan.

### Email not sending
- Confirm `EMAIL_PASSWORD` is a **Gmail App Password** (16-character code), not your regular Gmail password
- Confirm 2-Step Verification is enabled on your Google account
- Check `logs/app.log` for the exact SMTP error

### PDF moved to `processed/` but no email received
Check `logs/app.log`. Common causes:
- Email credential issue
- No articles found in the PDF (ads-only pages, wrong language, etc.)
- `max_newspaper_age_days` is excluding the PDF — look for "is X days old" in the log

### Admin panel login blocked after a few attempts
The login is rate-limited to 5 failed attempts per 15 minutes per IP address. Wait 15 minutes, then try again.

### Admin panel shows PDF stuck as "Processing"
This happens if the Python worker crashes mid-run. The pipeline has safeguards: on the next run, it checks the database for already-processed filenames and skips them. If a PDF is genuinely stuck, delete the record from the `pdfs` table in the database and re-upload.

### "Times" label appears but Editorial nav link is missing
The "Editorial" link in the navigation only appears when there are editorial articles published today. Upload an editorial PDF via the admin panel to see it.

### WeasyPrint error when generating the weekly PDF
Install the required system libraries (see Prerequisites). On Mac: `brew install pango cairo`.

---

## Running with Docker (Optional)

If you have [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed you can skip the Python and Node setup entirely.

```bash
# Build and start
docker-compose up --build

# Stop
docker-compose down
```

Make sure `.env` is filled in before running. Drop PDFs into `inbox/` or `editorial_inbox/` as normal — Docker mounts both automatically.

---

## Architecture

```
inbox/                    ← regular newspapers
editorial_inbox/          ← editorials (each article kept separate, forced "Editorial" category)
  └─ PDFs detected by watcher (both folders monitored simultaneously)
       │
       ▼
src/watcher.py              watchdog observer on both inboxes → 5s settle timer → triggers pipeline
src/pipeline.py             orchestrates the full flow
  ├─ src/date_detector.py        4-step date chain: filename → metadata → text → Gemini Vision
  ├─ src/pdf_processor.py        pymupdf: text vs image pages, content extraction, first-page render
  ├─ src/article_extractor.py    LLM → List[Article] with title, content, category, importance_score
  ├─ src/rewriter.py             cosine-similarity grouping → rewrite_articles() → 300-500 word article
  │                              (editorial articles skip grouping — processed individually)
  ├─ src/deduplicator.py         embedding cosine similarity against DB → skip if already published
  ├─ src/summarizer.py           LLM → 4-5 sentence email summary per article
  ├─ src/providers/db/           SQLite (local) or Supabase (production)
  ├─ src/digest_store.py         saves digest batch for --resend-last
  └─ src/email_sender.py         Gmail SMTP → templates/email_digest.html (Jinja2)
       │
       ▼
processed/                  ← PDFs moved here after processing

src/weekly_scheduler.py     background thread: checks cron schedules every 60s
src/newspaper_generator.py  Jinja2 + WeasyPrint → data/weekly_editions/edition_YYYYMMDD.pdf
```

### LLM API performance settings

| Setting | Value | Notes |
|---|---|---|
| `MAX_CONCURRENT` | 3 | Parallel Gemini API calls — kept low to avoid 503 overload on large PDFs |
| `MAX_RETRIES` | 5 | Per-chunk retry attempts |
| Retry backoff | 5, 15, 30, 60, 120s | Exponential with fixed schedule |

### Deployment

| Part | Local dev | Production |
|---|---|---|
| Web frontend + API | `npm run dev` (port 3000) | Netlify |
| PDF pipeline worker | Python process | Railway |
| Database | SQLite (`data/articles.db`) | Supabase PostgreSQL |
| File storage | Local `inbox/` / `processed/` | Supabase Storage |

### Production setup

1. Run `scripts/supabase_schema.sql` in the Supabase SQL editor to create all tables, indexes, and stored procedures
2. Set these environment variables on Railway (Python worker):

| Variable | Value |
|---|---|
| `LLM_API_KEY` | Gemini API key |
| `EMAIL_SENDER` | Gmail address |
| `EMAIL_PASSWORD` | Gmail App Password |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase **service role** key (not the anon key) |
| `STORAGE_PROVIDER` | `supabase` |
| `WEBSITE_BASE_URL` | Your production domain (e.g. `https://yoursite.netlify.app`) |
| `ADMIN_PASSWORD` | Strong random password |

3. Set `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `ADMIN_PASSWORD`, and `AUTH_SECRET` in Netlify environment variables for the web frontend

> **Important:** The Python pipeline uses `SUPABASE_SERVICE_KEY` (service role key) which bypasses Row Level Security. The anon key will silently fail to write data. On Railway, the pipeline uses `CloudStoragePoller` to poll Supabase Storage every 30 seconds for new PDFs (since `watchdog` only monitors local filesystems).

---

## Switching AI Providers

To switch from Gemini to OpenAI:

1. Change `llm.provider` to `openai` in `config/config.yaml`
2. Update `LLM_API_KEY` in `.env` with your OpenAI key

No code changes are needed — the provider abstraction handles the rest.

---

## Support

Check `logs/app.log` first — it contains a timestamped record of every pipeline step, API call, and error.

---

Built by [Tanmay Karmakar](mailto:tableaulancer@gmail.com)
