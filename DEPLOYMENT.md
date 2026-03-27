# Production Deployment Guide

This guide walks you through deploying the app to production using four services:

| Service | What it does | Cost |
|---|---|---|
| **GitHub** | Hosts your code — Vercel and Railway pull from here | Free |
| **Supabase** | PostgreSQL database + PDF file storage | Free tier available |
| **Vercel** | Hosts the Next.js website | Free tier available |
| **Railway** | Runs the Python pipeline worker | ~$5/month |

---

## Overview of how they connect

```
Admin uploads PDF
       │
       ▼
Vercel (Next.js website)
  → saves PDF to Supabase Storage (inbox/ folder)
       │
       ▼
Railway (Python worker) — polls Supabase Storage every few seconds
  → downloads PDF, processes it, saves articles to Supabase DB
  → sends email digest
  → moves PDF to processed/ in Supabase Storage
       │
       ▼
Vercel (Next.js website) — reads articles from Supabase DB
  → displays on website
```

---

## Before You Start

You will need:
- An email address to create accounts (one account per service is fine)
- Your code on GitHub (Step 1 below)
- About 45–60 minutes

---

## Step 1 — Push Your Code to GitHub

GitHub is where your code lives. Vercel and Railway will automatically pull from it whenever you push changes.

1. Go to [github.com](https://github.com) and create a free account if you don't have one
2. Click the **+** icon in the top right → **New repository**
3. Name it `hsa` (or anything you like)
4. Set it to **Private**
5. Click **Create repository**
6. GitHub will show you a page with commands. Open your terminal in the project folder and run:

```bash
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/hsa.git
git push -u origin main
```

Replace `YOUR_USERNAME` with your GitHub username.

> **Check:** Go to `https://github.com/YOUR_USERNAME/hsa` in your browser. You should see all your project files listed there.

---

## Step 2 — Set Up Supabase (Database + File Storage)

Supabase stores all articles in a PostgreSQL database, and stores uploaded PDFs in a Storage bucket.

### 2.1 Create account and project

1. Go to [supabase.com](https://supabase.com) and click **Start your project**
2. Sign up with GitHub (easiest) or email
3. Click **New project**
4. Fill in:
   - **Name**: `hsa` (or anything)
   - **Database Password**: "hfanewsletterHindus@108$" Generate a strong password and save it somewhere safe
   - **Region**: Pick the one closest to you geographically
5. Click **Create new project** and wait 1–2 minutes for it to spin up

### 2.2 Create the database tables

1. In your Supabase project, click **SQL Editor** in the left sidebar
2. Click **New query**
3. Open the file `scripts/supabase_schema.sql` from your project folder in any text editor
4. Copy the entire contents and paste it into the SQL editor
5. Click **Run** (or press Ctrl+Enter)
6. You should see "Success. No rows returned" — this means the tables were created

> **Check:** Click **Table Editor** in the left sidebar. You should see tables named `articles`, `pdfs`, `digests`, `schedules`, `weekly_editions`.

### 2.3 Create the PDF storage bucket

1. Click **Storage** in the left sidebar
2. Click **New bucket**
3. Set the name to exactly: `pdfs`
4. Leave **Public bucket** turned OFF (keep it private)
5. Click **Save**

> You should now see a bucket called `pdfs` in the list.

### 2.4 Collect your Supabase credentials

You need three values from Supabase. Keep a notepad open and write them down.

**SUPABASE_URL:**
1. Click **Settings** (gear icon) in the left sidebar → **API**
2. Copy the **Project URL** — looks like `https://abcdefgh.supabase.co`
https://xjjywpcqsfaoesnxomvp.supabase.co

**SUPABASE_KEY (anon key):**
1. Same page (**Settings → API**)
2. Under **Project API keys**, copy the `anon` `public` key
anon = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhqanl3cGNxc2Zhb2VzbnhvbXZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MjQ4MTQsImV4cCI6MjA5MDIwMDgxNH0.wI36EzMCwQBcXy9UqlXvrWsInnmTTMIbLNUCyljQBSw

**SUPABASE_SERVICE_KEY (service role key):**
1. Same page (**Settings → API**)
2. Under **Project API keys**, copy the `service_role` key
3. ⚠️ This key has full database access — never put it in client-side code or commit it to Git
service_role = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhqanl3cGNxc2Zhb2VzbnhvbXZwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDYyNDgxNCwiZXhwIjoyMDkwMjAwODE0fQ.8R50KgBjAq7snj38z0EH1gqB70wRbQjihEn9uf6aUuw

---

## Step 3 — Deploy the Website to Vercel

Vercel hosts the Next.js website. It automatically redeploys whenever you push code to GitHub.

### 3.1 Create account

1. Go to [vercel.com](https://vercel.com) and click **Sign Up**
2. Sign up with GitHub (strongly recommended — it links your repos automatically)

### 3.2 Import your project

1. After signing in, click **Add New…** → **Project**
2. Find your `hsa` repository in the list and click **Import**
3. Vercel will try to auto-detect the framework. You need to override this:
   - Under **Root Directory**, click **Edit** and type `web`
   - This tells Vercel that the Next.js app is inside the `web/` folder, not the project root
4. Leave everything else as default for now
5. **Do NOT click Deploy yet** — you need to add environment variables first

### 3.3 Add environment variables

Still on the same import screen, scroll down to **Environment Variables** and add each of these one by one:

| Name | Value |
|---|---|
| `SUPABASE_URL` | Your Supabase Project URL from Step 2.4 |
| `NEXT_PUBLIC_SUPABASE_URL` | Same value as above |
| `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service role key from Step 2.4 |
| `SUPABASE_SERVICE_KEY` | Same value as the service role key |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon key from Step 2.4 |
| `ADMIN_PASSWORD` | A strong random password (run `openssl rand -base64 20` to generate one) |
| `AUTH_SECRET` | Another strong random string (run `openssl rand -base64 32`) |
| `WEBSITE_BASE_URL` | Leave blank for now — you'll fill this in after deployment |

> To add each variable: type the name in the **Name** field, paste the value, click **Add**.

### 3.4 Deploy

1. Click **Deploy**
2. Wait 2–3 minutes — Vercel is installing packages and building the app
3. When it says **Congratulations!** and shows a URL like `hsa.vercel.app`, your website is live

### 3.5 Add the website URL back to Vercel

Now that you have the URL, add it as an environment variable:

1. In your Vercel project, click **Settings** → **Environment Variables**
2. Add a new variable:
   - Name: `WEBSITE_BASE_URL`
   - Value: your Vercel URL e.g. `https://hsa.vercel.app`
3. Click **Save**
4. Go to **Deployments** tab → click the three dots on the latest deployment → **Redeploy**

> **Check:** Visit your Vercel URL in a browser. You should see the newspaper website. Visit `your-url.vercel.app/admin` — you should see a login page.

---

## Step 4 — Deploy the Python Worker to Railway

Railway runs the Python pipeline 24/7. When you drop a PDF into Supabase Storage, Railway picks it up and processes it.

### 4.1 Create account

1. Go to [railway.app](https://railway.app) and click **Login**
2. Sign up with GitHub

### 4.2 Create a new project

1. Click **New Project**
2. Click **Deploy from GitHub repo**
3. Select your `hsa` repository
4. Railway will ask what to deploy — click **Deploy Now** (we'll configure the start command next)

### 4.3 Configure the service

1. Click on the service that was just created (it will have an auto-generated name)
2. Click the **Settings** tab
3. Find **Start Command** and set it to:
   ```
   python src/main.py
   ```
4. Find **Root Directory** — leave this blank (the Python code is at the repo root)
5. Find **Watch Paths** — leave blank

### 4.4 Add environment variables

1. Click the **Variables** tab
2. Click **Raw Editor** (easier for adding many variables at once)
3. Paste in the following, replacing the placeholder values:

```
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_KEY=your_supabase_service_role_key
LLM_API_KEY=your_gemini_api_key
EMAIL_SENDER=your_gmail_address@gmail.com
EMAIL_PASSWORD=your_gmail_app_password
WEBSITE_BASE_URL=https://your-project.vercel.app
STORAGE_PROVIDER=supabase
```

4. Click **Update Variables**

### 4.5 Verify the config file

Open `config/config.yaml` in your project and make sure the storage section looks like this:

```yaml
storage:
  provider: local          # overridden by STORAGE_PROVIDER env var on Railway
  inbox_path: ./inbox
  processed_path: ./processed
  editorial_inbox_path: ./editorial_inbox
```

The `STORAGE_PROVIDER=supabase` environment variable in Railway overrides the `local` value in the yaml — no need to commit a separate config file for production.

### 4.6 Redeploy

1. Click the **Deploy** tab
2. Click **Deploy** to trigger a fresh deployment with the new variables
3. Click on the deployment to see the logs
4. You should see lines like:
   ```
   INFO  Watching for PDFs in: ...
   INFO  Press Ctrl+C to stop.
   ```
   This means the worker is running and waiting for PDFs.

> **If you see errors** — check the logs carefully. The most common issues are wrong env var values (copy-paste errors). Double-check `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`.

---

## Step 5 — Test the Full Flow End to End

1. Visit `https://your-project.vercel.app/admin` and log in with your `ADMIN_PASSWORD`
2. Upload a newspaper PDF using the **Upload PDFs** section
3. Go to Railway → your service → **Deploy** tab → click the latest deployment → view logs
4. You should see the pipeline running: extracting articles, summarizing, sending email
5. Once processing is done, visit `https://your-project.vercel.app` — the articles should appear

---

## Step 6 — Update `config/config.yaml` for Production

Open `config/config.yaml` and update these settings:

```yaml
email:
  subscribers:
    - real_subscriber1@email.com
    - real_subscriber2@email.com
  title: "The American Express Times"
  subscribe_url: "https://your-project.vercel.app/newsletter"
  unsubscribe_url: "https://your-project.vercel.app/newsletter"

website:
  base_url: "https://your-project.vercel.app"
```

Then commit and push:

```bash
git add config/config.yaml
git commit -m "update production config"
git push
```

Railway and Vercel will automatically redeploy with the new config.

---

## Step 7 — (Optional) Add a Custom Domain

If you have a domain name (e.g. `americanexpresstimes.com`):

### On Vercel:
1. Go to your Vercel project → **Settings** → **Domains**
2. Type your domain and click **Add**
3. Vercel will show you DNS records to add — follow their instructions

### Update environment variables after adding domain:
1. In Vercel: update `WEBSITE_BASE_URL` to `https://yourdomain.com`
2. In Railway: update `WEBSITE_BASE_URL` to `https://yourdomain.com`
3. Redeploy both

---

## Environment Variable Reference

### Vercel (Next.js website)

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_URL` | Same as above (needed for client-side) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (for DB writes from API routes) |
| `SUPABASE_SERVICE_KEY` | Same as above (used by upload routes) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key (for client-side reads) |
| `ADMIN_PASSWORD` | Admin panel login password (20+ random chars) |
| `AUTH_SECRET` | Secret for signing session tokens (32+ random chars) |
| `WEBSITE_BASE_URL` | Your Vercel URL or custom domain |

### Railway (Python worker)

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Service role key (for DB + Storage) |
| `LLM_API_KEY` | Gemini API key |
| `EMAIL_SENDER` | Gmail address |
| `EMAIL_PASSWORD` | Gmail App Password (16-char code) |
| `WEBSITE_BASE_URL` | Your Vercel URL or custom domain |
| `STORAGE_PROVIDER` | Set to `supabase` |

---

## Troubleshooting

### Website shows "No articles for today" after uploading a PDF
The Python worker on Railway may still be processing. Check Railway logs — the pipeline logs each step. Processing a large PDF can take 5–10 minutes.

### Railway logs show "SUPABASE_SERVICE_KEY not found"
You forgot to add that environment variable in Railway. Go to Variables tab, add it, then redeploy.

### Upload from admin panel returns "Failed to save file"
Check that `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` are set in Vercel environment variables. Also confirm the `pdfs` storage bucket exists in Supabase (Step 2.3).

### Email is not being sent
Check Railway logs for SMTP errors. Confirm `EMAIL_SENDER` and `EMAIL_PASSWORD` are correct. Remember `EMAIL_PASSWORD` must be a Gmail App Password, not your regular Gmail password.

### Railway deployment fails with "No start command"
Make sure **Start Command** is set to `python src/main.py` in Railway → Settings tab.

### Supabase storage permission error
Make sure you are using the **service role key** (not the anon key) for `SUPABASE_SERVICE_KEY`. The service role key bypasses Row Level Security and has full storage access. It starts with `eyJ...` and is longer than the anon key.

### Admin panel login blocked after a few attempts
The login is rate-limited to 5 failed attempts per 15 minutes. Wait 15 minutes and try again with the correct password.

---

## Ongoing Operations

### Deploying code changes
Just push to GitHub:
```bash
git add .
git commit -m "describe your change"
git push
```
Vercel redeploys the website automatically. Railway redeploys the Python worker automatically.

### Viewing logs
- **Website errors**: Vercel → your project → **Functions** tab
- **Pipeline logs**: Railway → your service → click the active deployment

### Resending a failed digest email
SSH into Railway or use Railway's **Run Command** feature to run:
```bash
python src/main.py --resend-last
```

### Checking the database
Go to Supabase → **Table Editor** to browse articles, PDFs, and digests directly.
