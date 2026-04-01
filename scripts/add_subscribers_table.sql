-- Run this in the Supabase SQL editor to add the subscribers table.
-- Safe to run multiple times (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS subscribers (
    id                SERIAL PRIMARY KEY,
    email             TEXT UNIQUE NOT NULL,
    unsubscribe_token TEXT UNIQUE NOT NULL,
    subscribed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscribers_email ON subscribers(email);
CREATE INDEX IF NOT EXISTS idx_subscribers_token ON subscribers(unsubscribe_token);
