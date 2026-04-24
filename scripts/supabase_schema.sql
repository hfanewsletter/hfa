-- Run this in the Supabase SQL editor to set up the production database schema.
-- Project: HSA Newspaper Digest

CREATE TABLE IF NOT EXISTS articles (
    id                SERIAL PRIMARY KEY,
    slug              TEXT UNIQUE NOT NULL,
    title             TEXT NOT NULL,
    rewritten_content TEXT NOT NULL,
    summary           TEXT NOT NULL,
    category          TEXT NOT NULL DEFAULT 'General',
    embedding_json    TEXT NOT NULL,
    source_pdfs       JSONB NOT NULL DEFAULT '[]',
    published_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    importance_score  INTEGER NOT NULL DEFAULT 5,
    is_breaking       BOOLEAN NOT NULL DEFAULT FALSE,
    website_url       TEXT NOT NULL DEFAULT '',
    image_url         TEXT NOT NULL DEFAULT ''
);

-- Efficient distinct categories (avoids full table scan in JS)
CREATE OR REPLACE FUNCTION get_distinct_categories()
RETURNS TABLE(category TEXT)
LANGUAGE sql STABLE AS $$
  SELECT DISTINCT category FROM articles WHERE category != 'Editorial' ORDER BY category;
$$;

-- Efficient processed PDF count with dedup (avoids fetching all rows to JS)
CREATE OR REPLACE FUNCTION get_processed_pdf_count()
RETURNS BIGINT
LANGUAGE sql STABLE AS $$
  SELECT COUNT(DISTINCT filename) FROM pdfs WHERE status = 'processed';
$$;

-- Helper function for archive edition listing (used by Supabase adapter)
CREATE OR REPLACE FUNCTION get_edition_dates(p_limit INT DEFAULT 60)
RETURNS TABLE(edition_date DATE, article_count BIGINT, top_title TEXT, top_category TEXT, top_image_url TEXT)
LANGUAGE sql STABLE AS $$
  SELECT
    DATE(published_at) AS edition_date,
    COUNT(*)           AS article_count,
    MAX(title)         AS top_title,
    MAX(category)      AS top_category,
    MAX(image_url)     AS top_image_url
  FROM articles
  GROUP BY DATE(published_at)
  ORDER BY edition_date DESC
  LIMIT p_limit;
$$;

CREATE INDEX IF NOT EXISTS idx_articles_category    ON articles(category);
CREATE INDEX IF NOT EXISTS idx_articles_published   ON articles(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_importance  ON articles(importance_score DESC);
CREATE INDEX IF NOT EXISTS idx_articles_is_breaking ON articles(is_breaking);

CREATE TABLE IF NOT EXISTS pdfs (
    id            SERIAL PRIMARY KEY,
    filename      TEXT NOT NULL,
    storage_url   TEXT NOT NULL DEFAULT '',
    status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'processing', 'processed', 'failed')),
    article_count INTEGER NOT NULL DEFAULT 0,
    uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pdfs_status ON pdfs(status);

CREATE TABLE IF NOT EXISTS digests (
    id            SERIAL PRIMARY KEY,
    batch_id      TEXT UNIQUE NOT NULL,
    article_slugs JSONB NOT NULL DEFAULT '[]',
    sent_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schedules (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL,
    cron_expr   TEXT NOT NULL,
    task        TEXT NOT NULL DEFAULT 'weekly_edition',
    enabled     BOOLEAN NOT NULL DEFAULT TRUE,
    last_run    TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS weekly_editions (
    id            SERIAL PRIMARY KEY,
    edition_date  DATE NOT NULL,
    status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'generating', 'done', 'failed')),
    pdf_path      TEXT NOT NULL DEFAULT '',
    article_count INTEGER NOT NULL DEFAULT 0,
    requested_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    generated_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_weekly_editions_status ON weekly_editions(status);
CREATE INDEX IF NOT EXISTS idx_weekly_editions_date   ON weekly_editions(edition_date DESC);

CREATE TABLE IF NOT EXISTS subscribers (
    id                SERIAL PRIMARY KEY,
    email             TEXT UNIQUE NOT NULL,
    unsubscribe_token TEXT UNIQUE NOT NULL,
    subscribed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email);
CREATE INDEX IF NOT EXISTS idx_subscribers_token ON subscribers(unsubscribe_token);
