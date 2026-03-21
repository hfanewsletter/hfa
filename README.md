# Newspaper PDF Processor

An automated system that watches a folder for newspaper PDF files, extracts news articles using AI, removes duplicate stories, summarizes each article into a concise 3–4 sentence digest, and emails the digest to a list of subscribers.

---

## What It Does — In Plain English

1. **You drop a newspaper PDF** into a folder called `inbox/`
2. **The system detects it automatically** (no button to press)
3. **AI reads every page** of the newspaper and pulls out only the news articles (ignoring ads, classifieds, weather tables, etc.)
4. **Duplicate stories are removed** — if two newspapers cover the same event, only one version is kept
5. **Each article is summarized** into 3–4 sentences in the AI's own words
6. **An email digest is sent** to everyone on the subscriber list, with a link to open the original PDF

---

## System Requirements

Before you start, make sure you have the following installed on your computer.

### On Mac

Open the **Terminal** app (search for it in Spotlight with `Cmd + Space`) and run these commands one by one:

**1. Check if Python is installed:**
```bash
python3 --version
```
You should see something like `Python 3.11.x` or higher. If not, download it from [python.org](https://www.python.org/downloads/).

**2. Check if Git is installed:**
```bash
git --version
```
If not installed, macOS will prompt you to install developer tools — follow that prompt.

---

### On Windows

Open **Command Prompt** or **PowerShell** (search for it in the Start menu).

**1. Install Python:**
Download from [python.org](https://www.python.org/downloads/windows/). During installation, **make sure to check the box that says "Add Python to PATH"**.

**2. Verify installation:**
```cmd
python --version
```

**3. Install Git:**
Download from [git-scm.com](https://git-scm.com/download/win) and install with default settings.

> **Note for Windows users:** Everywhere this guide says `python3`, use `python` instead. Everywhere it says `source venv/bin/activate`, use `venv\Scripts\activate` instead.

---

## Step-by-Step Setup

### Step 1 — Get the Code

Open your terminal and run:

```bash
git clone https://github.com/TanmayKnight/hsa.git
cd hsa
```

This downloads the project to your computer and takes you into the project folder.

---

### Step 2 — Create a Virtual Environment

A virtual environment is an isolated workspace for this project's dependencies. Think of it as a separate box where all the tools this project needs are stored, without affecting anything else on your computer.

**Mac:**
```bash
python3 -m venv venv
source venv/bin/activate
```

**Windows:**
```cmd
python -m venv venv
venv\Scripts\activate
```

You'll know it worked when your terminal prompt starts showing `(venv)` at the beginning.

> **Important:** Every time you open a new terminal window to work on this project, you need to run the `activate` command again.

---

### Step 3 — Install Dependencies

```bash
pip install -r requirements.txt
```

This installs all the Python libraries the project needs. It may take a minute or two.

---

### Step 4 — Get Your API Keys

This project uses Google's Gemini AI. You need a free API key.

1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Sign in with your Google account
3. Click **"Get API key"** → **"Create API key"**
4. Copy the key — you'll need it in the next step

---

### Step 5 — Set Up Your Credentials

The project includes a file called `.env.example` — this is a template. You need to create your own `.env` file from it.

**Mac:**
```bash
cp .env.example .env
```

**Windows:**
```cmd
copy .env.example .env
```

Now open the `.env` file in any text editor (Notepad on Windows, TextEdit on Mac, or VS Code) and fill in your details:

```
LLM_API_KEY=paste_your_gemini_api_key_here

EMAIL_SENDER=your_gmail_address@gmail.com
EMAIL_PASSWORD=your_gmail_app_password
```

> **Gmail App Password:** Gmail requires a special "App Password" instead of your regular password when sending email from code.
> 1. Go to your Google Account → Security
> 2. Enable 2-Step Verification (if not already on)
> 3. Search for "App passwords" in the Security page
> 4. Create a new app password — copy the 16-character code and paste it as `EMAIL_PASSWORD`

---

### Step 6 — Configure Subscribers and Settings

Open `config/config.yaml` in a text editor. This is the main settings file.

**Add email subscribers** (the people who will receive the digest):
```yaml
email:
  subscribers:
    - person1@example.com
    - person2@example.com
    - manager@company.com
```

**Check the AI model** (already set to a working default):
```yaml
llm:
  model: gemini-2.5-flash
```

Everything else can be left as-is for local testing.

---

### Step 7 — Run the Application

Make sure your virtual environment is active (you see `(venv)` in your terminal), then run:

```bash
python src/main.py
```

You should see output like:
```
2026-03-19 10:00:00 [INFO] Newspaper PDF Processor starting up
2026-03-19 10:00:00 [INFO] LLM provider: gemini (gemini-2.5-flash)
2026-03-19 10:00:00 [INFO] Storage provider: local
2026-03-19 10:00:00 [INFO] Watching for PDFs in: /your/path/hsa/inbox
2026-03-19 10:00:00 [INFO] Press Ctrl+C to stop.
```

The application is now running and waiting. **Leave this terminal window open.**

---

### Step 8 — Process a Newspaper

Simply **copy or move a newspaper PDF file into the `inbox/` folder** inside the project directory.

The application will:
- Detect the file within a few seconds
- Log its progress as it reads each page
- Move the processed PDF to `processed/` when done
- Send the email digest to all subscribers

You can drop multiple PDFs at once — each one will be processed in order.

---

## Folder Structure

```
hsa/
├── inbox/          ← DROP YOUR PDFs HERE
├── processed/      ← Processed PDFs are moved here automatically
├── logs/           ← Log files (app.log)
├── config/
│   └── config.yaml ← Main settings file
├── src/            ← Application source code
├── templates/      ← Email template
├── .env            ← Your credentials (never shared, stays on your computer)
├── .env.example    ← Credential template (safe to share)
└── requirements.txt
```

---

## Monitoring Progress

While the application is running, you can watch the live progress in two ways:

**1. In the terminal** — you'll see each step as it happens:
```
Sending pages 1-2 of 30 to Gemini...
  → Got 4 article(s) from pages 1-2
Sending pages 3-4 of 30 to Gemini...
  → Got 3 article(s) from pages 3-4
...
Summarizing 45 unique articles (skipping 3 duplicates)
Digest sent to subscriber@example.com (45 articles)
```

**2. In the log file** — open `logs/app.log` in any text editor at any time to see the full history.

---

## Common Issues & Solutions

### "No module named 'google'" or similar import errors
Your virtual environment may not be active. Run the activate command again:
- Mac: `source venv/bin/activate`
- Windows: `venv\Scripts\activate`

### "404 model not found" error
The AI model name in `config/config.yaml` may be outdated. Try changing it to `gemini-2.5-flash-001` or check [Google AI Studio](https://aistudio.google.com/) for currently available model names.

### "429 Too Many Requests" error
You've hit the API rate limit. Wait a few minutes and try again, or upgrade your Google AI plan.

### Email not sending
- Make sure you're using a Gmail **App Password**, not your regular Gmail password
- Check that `EMAIL_SENDER` and `EMAIL_PASSWORD` are correctly set in your `.env` file
- Make sure 2-Step Verification is enabled on your Google account

### Application seems stuck on a page
This is handled automatically — the system will timeout after 90 seconds and retry up to 3 times. If it still fails, it moves on to the next chunk of pages.

### PDF was moved to `processed/` but no email was received
Check `logs/app.log` for error messages. The most common causes are email credential issues or no articles being found in the PDF.

---

## Stopping the Application

Press `Ctrl + C` in the terminal where the application is running.

---

## Command-Line Options

```bash
# Start watching for new PDFs (default)
python src/main.py

# Process all PDFs currently in inbox/, then start watching
python src/main.py --process-existing

# Process all PDFs in inbox/ and exit (no watching)
python src/main.py --run-once

# Resend the last digest email without reprocessing any PDFs
python src/main.py --resend-last
```

### When to use `--resend-last`

If the application successfully processed a PDF (extracted articles, removed duplicates, wrote summaries) but then failed at the email step — for example due to a wrong password or network issue — you do **not** need to reprocess the PDF. Simply fix the issue and run:

```bash
python src/main.py --resend-last
```

This reads the last completed digest from the local database and sends it directly.

---

## Running with Docker (Optional)

If you have [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed, you can run the application without setting up Python at all.

**Mac and Windows:**
```bash
# Build and start
docker-compose up --build

# Stop
docker-compose down
```

Make sure your `.env` file is set up before running Docker. Drop PDFs into the `inbox/` folder as normal — Docker mounts it automatically.

---

## Switching AI Providers

The system is designed to work with different AI providers. To switch from Gemini to another provider (e.g., OpenAI) in the future:

1. Open `config/config.yaml`
2. Change `llm.provider` to the new provider name
3. Update `LLM_API_KEY` in your `.env` file with the new provider's key

No code changes are needed.

---

## Support

Check the `logs/app.log` file first — it contains detailed information about what the application did and any errors it encountered.
