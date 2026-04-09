export interface Article {
  id?: number
  slug: string
  title: string
  rewritten_content: string
  summary: string
  category: string
  source_pdfs: string[]
  published_at: string   // ISO date string
  importance_score: number  // 1-10 composite importance (LLM score + cross-paper boost)
  is_breaking: boolean      // derived: importance_score >= 9
  website_url: string
  image_url?: string
}

export interface PDFRecord {
  id?: number
  filename: string
  storage_url: string
  status: 'pending' | 'processing' | 'processed' | 'failed'
  article_count: number
  uploaded_at: string
  processed_at: string | null
}

export interface Schedule {
  id?: number
  name: string
  cron_expr: string
  task: string
  enabled: boolean
  last_run: string | null
  created_at: string
}

export interface WeeklyEdition {
  id?: number
  edition_date: string   // YYYY-MM-DD
  status: 'pending' | 'generating' | 'done' | 'failed'
  pdf_path: string
  article_count: number
  requested_at: string
  generated_at: string | null
}

export interface HomepageData {
  breaking: Article | null
  hero: Article | null
  featured: Article[]
  latest: Article[]
  categories: string[]
  /** Set when showing a past edition because today has no articles yet */
  fallbackDate?: string  // 'YYYY-MM-DD'
}
