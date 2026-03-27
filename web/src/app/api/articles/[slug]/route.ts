import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  try {
    const article = await getDB().getArticleBySlug(slug)
    if (!article) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ article })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to fetch article' }, { status: 500 })
  }
}
