import { createClient } from '@supabase/supabase-js'
import type { DBAdapter, Edition } from './index'
import type { Article, PDFRecord, Schedule, WeeklyEdition, HomepageData } from '@/lib/types'
import { getDateEST, advanceDateStr } from '@/lib/utils'

function rowToArticle(row: Record<string, unknown>): Article {
  const sp = row.source_pdfs
  return {
    id: row.id as number,
    slug: row.slug as string,
    title: row.title as string,
    rewritten_content: row.rewritten_content as string,
    summary: row.summary as string,
    category: (row.category as string) || 'General',
    source_pdfs: Array.isArray(sp) ? sp : [],
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

export class SupabaseAdapter implements DBAdapter {
  private client

  constructor(url: string, key: string) {
    this.client = createClient(url, key)
  }

  async getLatestArticles(limit = 20): Promise<Article[]> {
    const { data } = await this.client
      .from('articles')
      .select('*')
      .order('published_at', { ascending: false })
      .limit(limit)
    return (data ?? []).map(rowToArticle)
  }

  async getArticleBySlug(slug: string): Promise<Article | null> {
    const { data } = await this.client
      .from('articles')
      .select('*')
      .eq('slug', slug)
      .single()
    return data ? rowToArticle(data) : null
  }

  async getArticlesByCategory(category: string, limit = 20): Promise<Article[]> {
    const { data } = await this.client
      .from('articles')
      .select('*')
      .eq('category', category)
      .order('published_at', { ascending: false })
      .limit(limit)
    return (data ?? []).map(rowToArticle)
  }

  async getCategories(): Promise<string[]> {
    const { data } = await this.client
      .from('articles')
      .select('category')
      .neq('category', 'Editorial')
    const cats = Array.from(new Set((data ?? []).map((r: { category: string }) => r.category)))
    return cats.sort()
  }

  async getHomepageData(): Promise<HomepageData> {
    const today    = getDateEST()     // 'YYYY-MM-DD' in America/New_York
    const tomorrow = getDateEST(1)

    const [articlesRes, catsRes] = await Promise.all([
      this.client.from('articles').select('*')
        .neq('category', 'Editorial')
        .gte('published_at', today)
        .lt('published_at', tomorrow)
        .order('importance_score', { ascending: false })
        .order('published_at', { ascending: false })
        .limit(12),
      this.client.from('articles').select('category').neq('category', 'Editorial'),
    ])

    let articles = (articlesRes.data ?? []).map(rowToArticle)
    const categories = Array.from(new Set((catsRes.data ?? []).map((r: { category: string }) => r.category))).sort() as string[]
    let fallbackDate: string | undefined

    // No articles today — fall back to most recent available date
    if (articles.length === 0) {
      const latestRes = await this.client.from('articles')
        .select('published_at')
        .neq('category', 'Editorial')
        .lt('published_at', tomorrow)
        .order('published_at', { ascending: false })
        .limit(1)

      if (latestRes.data?.length) {
        const fd = latestRes.data[0].published_at.slice(0, 10)
        fallbackDate = fd
        const fallbackNext = advanceDateStr(fd, 1)
        const fallbackRes = await this.client.from('articles').select('*')
          .neq('category', 'Editorial')
          .gte('published_at', fd)
          .lt('published_at', fallbackNext)
          .order('importance_score', { ascending: false })
          .order('published_at', { ascending: false })
          .limit(12)
        articles = (fallbackRes.data ?? []).map(rowToArticle)
      }
    }

    // Breaking banner: first article with score >= 9; hero: highest remaining; featured: next 4
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
    // Supabase doesn't support GROUP BY via the JS client easily — use rpc or raw query fallback
    const { data } = await this.client.rpc('get_edition_dates', { p_limit: limit })
    if (!data) return []
    return (data as Record<string, unknown>[]).map(r => ({
      date: r.edition_date as string,
      count: Number(r.article_count),
      top_title: (r.top_title as string) || '',
      top_category: (r.top_category as string) || 'General',
      top_image_url: (r.top_image_url as string) || '',
    }))
  }

  async getArticlesByDate(date: string, limit = 50): Promise<Article[]> {
    const { data } = await this.client
      .from('articles')
      .select('*')
      .gte('published_at', `${date}T00:00:00`)
      .lt('published_at', `${date}T23:59:59`)
      .order('published_at', { ascending: false })
      .limit(limit)
    return (data ?? []).map(rowToArticle)
  }

  async getPDFs(): Promise<PDFRecord[]> {
    const { data } = await this.client
      .from('pdfs')
      .select('*')
      .order('uploaded_at', { ascending: false })
    return (data ?? []).map(rowToPDF)
  }

  async createPendingPDF(filename: string): Promise<void> {
    const now = new Date().toISOString()
    // Try to reset an existing record for this filename to pending
    const { data: updated } = await this.client
      .from('pdfs')
      .update({ status: 'pending', uploaded_at: now, article_count: 0, processed_at: null })
      .eq('filename', filename)
      .select('id')
      .limit(1)
    // If no existing record, insert a fresh one
    if (!updated || updated.length === 0) {
      await this.client.from('pdfs').insert({
        filename,
        storage_url: '',
        status: 'pending',
        article_count: 0,
        uploaded_at: now,
      })
    }
  }

  async dismissStuckPDFs(filenames: string[]): Promise<void> {
    if (filenames.length === 0) return
    await this.client
      .from('pdfs')
      .update({ status: 'failed' })
      .in('filename', filenames)
      .in('status', ['pending', 'processing'])
  }

  async getDigests() {
    const { data } = await this.client
      .from('digests')
      .select('batch_id, article_slugs, sent_at')
      .order('sent_at', { ascending: false })
      .limit(20)
    return (data ?? []).map(r => ({
      batch_id: r.batch_id as string,
      sent_at: r.sent_at as string,
      article_slugs: (r.article_slugs ?? []) as string[],
    }))
  }

  async getSchedules(): Promise<Schedule[]> {
    const { data } = await this.client.from('schedules').select('*').order('created_at')
    return (data ?? []).map(rowToSchedule)
  }

  async createSchedule(s: Omit<Schedule, 'id' | 'created_at'>): Promise<Schedule> {
    const { data } = await this.client
      .from('schedules')
      .insert({ ...s, created_at: new Date().toISOString() })
      .select()
      .single()
    return rowToSchedule(data)
  }

  async updateSchedule(id: number, updates: Partial<Omit<Schedule, 'id' | 'created_at'>>): Promise<void> {
    await this.client.from('schedules').update(updates).eq('id', id)
  }

  async deleteSchedule(id: number): Promise<void> {
    await this.client.from('schedules').delete().eq('id', id)
  }

  async getWeeklyEditions(limit = 10): Promise<WeeklyEdition[]> {
    const { data } = await this.client
      .from('weekly_editions')
      .select('*')
      .order('requested_at', { ascending: false })
      .limit(limit)
    return (data ?? []).map(rowToWeeklyEdition)
  }

  async getTotalArticleCount(): Promise<number> {
    const { count } = await this.client
      .from('articles')
      .select('id', { count: 'exact', head: true })
    return count ?? 0
  }

  async getProcessedPDFCount(): Promise<number> {
    const { data } = await this.client
      .from('pdfs')
      .select('filename')
      .eq('status', 'processed')
    // Deduplicate by filename (pipeline may insert multiple records per file)
    return new Set((data ?? []).map((r: { filename: string }) => r.filename)).size
  }

  async getSubscriberCount(): Promise<number> {
    const { count } = await this.client
      .from('subscribers')
      .select('id', { count: 'exact', head: true })
    return count ?? 0
  }

  async getEditorialArticles(date: string): Promise<Article[]> {
    const { data } = await this.client
      .from('articles')
      .select('*')
      .eq('category', 'Editorial')
      .gte('published_at', `${date}T00:00:00`)
      .lt('published_at', `${date}T23:59:59`)
      .order('importance_score', { ascending: false })
      .order('published_at', { ascending: false })
    return (data ?? []).map(rowToArticle)
  }

  async hasEditorialsToday(): Promise<boolean> {
    const today    = getDateEST()
    const tomorrow = getDateEST(1)
    const { count } = await this.client
      .from('articles')
      .select('id', { count: 'exact', head: true })
      .eq('category', 'Editorial')
      .gte('published_at', today)
      .lt('published_at', tomorrow)
    return (count ?? 0) > 0
  }

  async createWeeklyEditionJob(edition_date: string): Promise<WeeklyEdition> {
    const { data } = await this.client
      .from('weekly_editions')
      .insert({
        edition_date,
        status: 'pending',
        pdf_path: '',
        article_count: 0,
        requested_at: new Date().toISOString(),
      })
      .select()
      .single()
    return rowToWeeklyEdition(data)
  }
}
