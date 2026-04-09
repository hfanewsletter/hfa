/**
 * SQLite adapter for local development.
 * Reads from the same data/articles.db that the Python pipeline writes to.
 * Requires `better-sqlite3` (installed as a dev dependency).
 *
 * This adapter is NEVER used on Vercel — only when SUPABASE env vars are absent.
 */
import path from 'path'
import type { DBAdapter, Edition } from './index'
import type { Article, PDFRecord, Schedule, WeeklyEdition, HomepageData } from '@/lib/types'
import { getDateEST, advanceDateStr } from '@/lib/utils'

function openDB() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require('better-sqlite3')
  const dbPath = process.env.SQLITE_DB_PATH
    || path.join(process.cwd(), '..', 'data', 'articles.db')
  const db = new Database(dbPath, { readonly: false })
  // WAL mode allows concurrent reads while Python writes
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  // Apply schema migrations idempotently so existing DBs work after upgrades
  const migrations = [
    "ALTER TABLE articles ADD COLUMN image_url TEXT NOT NULL DEFAULT ''",
    "ALTER TABLE articles ADD COLUMN importance_score INTEGER NOT NULL DEFAULT 5",
  ]
  for (const sql of migrations) {
    try { db.prepare(sql).run() } catch { /* column already exists */ }
  }
  return db
}

function parseSourcePdfs(val: unknown): string[] {
  if (Array.isArray(val)) return val
  if (typeof val === 'string') {
    try { return JSON.parse(val) } catch { return [] }
  }
  return []
}

function rowToArticle(row: Record<string, unknown>): Article {
  return {
    id: row.id as number,
    slug: row.slug as string,
    title: row.title as string,
    rewritten_content: row.rewritten_content as string,
    summary: row.summary as string,
    category: (row.category as string) || 'General',
    source_pdfs: parseSourcePdfs(row.source_pdfs_json ?? row.source_pdfs),
    published_at: row.published_at as string,
    importance_score: (row.importance_score as number) ?? 5,
    is_breaking: ((row.importance_score as number) ?? 0) >= 9,
    website_url: (row.website_url as string) || '',
    image_url: (row.image_url as string) || '',
  }
}

function rowToPDF(row: Record<string, unknown>): PDFRecord {
  return {
    id: row.id as number,
    filename: row.filename as string,
    storage_url: (row.storage_url as string) || '',
    status: row.status as PDFRecord['status'],
    article_count: (row.article_count as number) || 0,
    uploaded_at: row.uploaded_at as string,
    processed_at: (row.processed_at as string) || null,
  }
}

function rowToSchedule(row: Record<string, unknown>): Schedule {
  return {
    id: row.id as number,
    name: row.name as string,
    cron_expr: row.cron_expr as string,
    task: row.task as string,
    enabled: Boolean(row.enabled),
    last_run: (row.last_run as string) || null,
    created_at: row.created_at as string,
  }
}

function rowToWeeklyEdition(row: Record<string, unknown>): WeeklyEdition {
  return {
    id: row.id as number,
    edition_date: row.edition_date as string,
    status: row.status as WeeklyEdition['status'],
    pdf_path: (row.pdf_path as string) || '',
    article_count: (row.article_count as number) || 0,
    requested_at: row.requested_at as string,
    generated_at: (row.generated_at as string) || null,
  }
}

export class SQLiteAdapter implements DBAdapter {
  async getLatestArticles(limit = 20): Promise<Article[]> {
    const db = openDB()
    const rows = db.prepare(
      'SELECT * FROM articles ORDER BY published_at DESC LIMIT ?'
    ).all(limit) as Record<string, unknown>[]
    db.close()
    return rows.map(rowToArticle)
  }

  async getArticleBySlug(slug: string): Promise<Article | null> {
    const db = openDB()
    const row = db.prepare('SELECT * FROM articles WHERE slug = ?').get(slug) as
      Record<string, unknown> | undefined
    db.close()
    return row ? rowToArticle(row) : null
  }

  async getArticlesByCategory(category: string, limit = 20): Promise<Article[]> {
    const db = openDB()
    const rows = db.prepare(
      'SELECT * FROM articles WHERE category = ? ORDER BY published_at DESC LIMIT ?'
    ).all(category, limit) as Record<string, unknown>[]
    db.close()
    return rows.map(rowToArticle)
  }

  async getCategories(): Promise<string[]> {
    const db = openDB()
    const rows = db.prepare(
      "SELECT DISTINCT category FROM articles WHERE category != 'Editorial' ORDER BY category"
    ).all() as { category: string }[]
    db.close()
    return rows.map(r => r.category)
  }

  async getHomepageData(): Promise<HomepageData> {
    const db = openDB()

    const today = getDateEST() // 'YYYY-MM-DD' in America/New_York
    let rows = db.prepare(
      `SELECT * FROM articles WHERE DATE(published_at) = ? AND category != 'Editorial' ORDER BY importance_score DESC, published_at DESC LIMIT 12`
    ).all(today) as Record<string, unknown>[]

    const catRows = db.prepare(
      "SELECT DISTINCT category FROM articles WHERE category != 'Editorial' ORDER BY category"
    ).all() as { category: string }[]

    let fallbackDate: string | undefined

    // No articles today — fall back to most recent available date
    if (rows.length === 0) {
      const latestRow = db.prepare(
        `SELECT DATE(published_at) as pub_date FROM articles WHERE category != 'Editorial' ORDER BY published_at DESC LIMIT 1`
      ).get() as { pub_date: string } | undefined

      if (latestRow?.pub_date) {
        fallbackDate = latestRow.pub_date
        rows = db.prepare(
          `SELECT * FROM articles WHERE DATE(published_at) = ? AND category != 'Editorial' ORDER BY importance_score DESC, published_at DESC LIMIT 12`
        ).all(fallbackDate) as Record<string, unknown>[]
      }
    }

    db.close()

    const articles = rows.map(rowToArticle)
    const categories = catRows.map(r => r.category)

    const breaking = articles.find(a => a.importance_score >= 9) ?? null
    const rest = articles.filter(a => a.slug !== breaking?.slug)

    return {
      breaking,
      hero: rest[0] ?? null,
      featured: rest.slice(1, 5),
      latest: rest.slice(5, 10),
      categories,
      fallbackDate,
    }
  }

  async getEditionDates(limit = 60): Promise<Edition[]> {
    const db = openDB()
    const rows = db.prepare(`
      SELECT
        DATE(published_at) AS edition_date,
        COUNT(*) AS article_count,
        MAX(title) AS top_title,
        MAX(category) AS top_category,
        MAX(image_url) AS top_image_url
      FROM articles
      GROUP BY DATE(published_at)
      ORDER BY edition_date DESC
      LIMIT ?
    `).all(limit) as { edition_date: string; article_count: number; top_title: string; top_category: string; top_image_url: string }[]
    db.close()
    return rows.map(r => ({
      date: r.edition_date,
      count: r.article_count,
      top_title: r.top_title || '',
      top_category: r.top_category || 'General',
      top_image_url: r.top_image_url || '',
    }))
  }

  async getArticlesByDate(date: string, limit = 50): Promise<Article[]> {
    const db = openDB()
    const rows = db.prepare(
      `SELECT * FROM articles WHERE DATE(published_at) = ? ORDER BY published_at DESC LIMIT ?`
    ).all(date, limit) as Record<string, unknown>[]
    db.close()
    return rows.map(rowToArticle)
  }

  async getPDFs(): Promise<PDFRecord[]> {
    const db = openDB()
    const rows = db.prepare(
      'SELECT * FROM pdfs ORDER BY uploaded_at DESC'
    ).all() as Record<string, unknown>[]
    db.close()
    return rows.map(rowToPDF)
  }

  async createPendingPDF(filename: string): Promise<void> {
    const db = openDB()
    const now = new Date().toISOString()
    // Reset existing record to pending, or insert new one if none exists
    const result = db.prepare(
      `UPDATE pdfs SET status = 'pending', uploaded_at = ?, article_count = 0, processed_at = NULL
       WHERE id = (SELECT id FROM pdfs WHERE filename = ? ORDER BY uploaded_at DESC LIMIT 1)`
    ).run(now, filename)
    if ((result as { changes: number }).changes === 0) {
      db.prepare(
        `INSERT INTO pdfs (filename, storage_url, status, article_count, uploaded_at)
         VALUES (?, '', 'pending', 0, ?)`
      ).run(filename, now)
    }
    db.close()
  }

  async dismissStuckPDFs(filenames: string[]): Promise<void> {
    if (filenames.length === 0) return
    const db = openDB()
    const placeholders = filenames.map(() => '?').join(',')
    db.prepare(
      `UPDATE pdfs SET status = 'failed' WHERE filename IN (${placeholders}) AND status IN ('pending', 'processing')`
    ).run(...filenames)
    db.close()
  }

  async getDigests() {
    const db = openDB()
    const rows = db.prepare(
      'SELECT batch_id, article_slugs, sent_at FROM digests ORDER BY sent_at DESC LIMIT 20'
    ).all() as { batch_id: string; article_slugs: string; sent_at: string }[]
    db.close()
    return rows.map(r => ({
      batch_id: r.batch_id,
      sent_at: r.sent_at,
      article_slugs: JSON.parse(r.article_slugs) as string[],
    }))
  }

  async getSchedules(): Promise<Schedule[]> {
    const db = openDB()
    // Table may not exist yet on first run
    try {
      db.prepare(`
        CREATE TABLE IF NOT EXISTS schedules (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          name       TEXT NOT NULL,
          cron_expr  TEXT NOT NULL,
          task       TEXT NOT NULL DEFAULT 'weekly_edition',
          enabled    INTEGER NOT NULL DEFAULT 1,
          last_run   TEXT,
          created_at TEXT NOT NULL
        )
      `).run()
      const rows = db.prepare('SELECT * FROM schedules ORDER BY created_at').all() as
        Record<string, unknown>[]
      db.close()
      return rows.map(rowToSchedule)
    } catch {
      db.close()
      return []
    }
  }

  async createSchedule(s: Omit<Schedule, 'id' | 'created_at'>): Promise<Schedule> {
    const db = openDB()
    const now = new Date().toISOString()
    const result = db.prepare(`
      INSERT INTO schedules (name, cron_expr, task, enabled, last_run, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(s.name, s.cron_expr, s.task, s.enabled ? 1 : 0, s.last_run, now)
    const row = db.prepare('SELECT * FROM schedules WHERE id = ?').get(result.lastInsertRowid) as
      Record<string, unknown>
    db.close()
    return rowToSchedule(row)
  }

  async updateSchedule(id: number, updates: Partial<Omit<Schedule, 'id' | 'created_at'>>): Promise<void> {
    const db = openDB()
    const fields = Object.keys(updates)
      .map(k => `${k} = ?`)
      .join(', ')
    const values = Object.values(updates).map(v => (typeof v === 'boolean' ? (v ? 1 : 0) : v))
    db.prepare(`UPDATE schedules SET ${fields} WHERE id = ?`).run(...values, id)
    db.close()
  }

  async deleteSchedule(id: number): Promise<void> {
    const db = openDB()
    db.prepare('DELETE FROM schedules WHERE id = ?').run(id)
    db.close()
  }

  async getWeeklyEditions(limit = 10): Promise<WeeklyEdition[]> {
    const db = openDB()
    try {
      const rows = db.prepare(
        'SELECT * FROM weekly_editions ORDER BY requested_at DESC LIMIT ?'
      ).all(limit) as Record<string, unknown>[]
      db.close()
      return rows.map(rowToWeeklyEdition)
    } catch {
      db.close()
      return []
    }
  }

  async getTotalArticleCount(): Promise<number> {
    const db = openDB()
    const row = db.prepare('SELECT COUNT(*) as count FROM articles').get() as { count: number }
    db.close()
    return row.count
  }

  async getProcessedPDFCount(): Promise<number> {
    const db = openDB()
    const row = db.prepare(
      "SELECT COUNT(DISTINCT filename) as count FROM pdfs WHERE status = 'processed'"
    ).get() as { count: number }
    db.close()
    return row.count
  }

  async getEditorialArticles(date: string): Promise<Article[]> {
    const db = openDB()
    const rows = db.prepare(
      `SELECT * FROM articles WHERE category = 'Editorial' AND DATE(published_at) = ? ORDER BY importance_score DESC, published_at DESC`
    ).all(date) as Record<string, unknown>[]
    db.close()
    return rows.map(rowToArticle)
  }

  async hasEditorialsToday(): Promise<boolean> {
    const db = openDB()
    const today = getDateEST() // America/New_York
    const row = db.prepare(
      `SELECT COUNT(*) as count FROM articles WHERE category = 'Editorial' AND DATE(published_at) = ?`
    ).get(today) as { count: number }
    db.close()
    return row.count > 0
  }

  async createWeeklyEditionJob(edition_date: string): Promise<WeeklyEdition> {
    const db = openDB()
    const now = new Date().toISOString()
    const result = db.prepare(
      `INSERT INTO weekly_editions (edition_date, status, pdf_path, article_count, requested_at)
       VALUES (?, 'pending', '', 0, ?)`
    ).run(edition_date, now)
    const row = db.prepare('SELECT * FROM weekly_editions WHERE id = ?')
      .get(result.lastInsertRowid) as Record<string, unknown>
    db.close()
    return rowToWeeklyEdition(row)
  }
}
