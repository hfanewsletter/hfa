import type { Article, PDFRecord, Schedule, WeeklyEdition, HomepageData } from '@/lib/types'

export interface Edition {
  date: string         // YYYY-MM-DD
  count: number
  top_title: string
  top_category: string
  top_image_url: string
}

export interface DBAdapter {
  getLatestArticles(limit?: number): Promise<Article[]>
  getArticleBySlug(slug: string): Promise<Article | null>
  getArticlesByCategory(category: string, limit?: number): Promise<Article[]>
  getCategories(): Promise<string[]>
  getHomepageData(): Promise<HomepageData>
  getEditionDates(limit?: number): Promise<Edition[]>
  getArticlesByDate(date: string, limit?: number): Promise<Article[]>
  getPDFs(): Promise<PDFRecord[]>
  createPendingPDF(filename: string): Promise<void>
  dismissStuckPDFs(filenames: string[]): Promise<void>
  getDigests(): Promise<{ batch_id: string; sent_at: string; article_slugs: string[] }[]>
  getSchedules(): Promise<Schedule[]>
  createSchedule(s: Omit<Schedule, 'id' | 'created_at'>): Promise<Schedule>
  updateSchedule(id: number, updates: Partial<Omit<Schedule, 'id' | 'created_at'>>): Promise<void>
  deleteSchedule(id: number): Promise<void>
  getWeeklyEditions(limit?: number): Promise<WeeklyEdition[]>
  createWeeklyEditionJob(edition_date: string): Promise<WeeklyEdition>
  getEditorialArticles(date: string): Promise<Article[]>
  hasEditorialsToday(): Promise<boolean>
  getTotalArticleCount(): Promise<number>
  getProcessedPDFCount(): Promise<number>
}

let _adapter: DBAdapter | null = null

export function getDB(): DBAdapter {
  if (_adapter) return _adapter

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey  = process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (supabaseUrl && supabaseKey) {
    const { SupabaseAdapter } = require('./supabase')
    _adapter = new SupabaseAdapter(supabaseUrl, supabaseKey)
  } else {
    const { SQLiteAdapter } = require('./sqlite')
    _adapter = new SQLiteAdapter()
  }

  return _adapter!
}
