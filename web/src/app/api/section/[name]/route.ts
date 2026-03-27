import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params
  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20'), 100)

  try {
    const categories = await getDB().getCategories()
    const decoded = decodeURIComponent(name).replace(/-/g, ' ')
    const category = categories.find(c => c.toLowerCase() === decoded.toLowerCase())
    if (!category) return NextResponse.json({ error: 'Section not found' }, { status: 404 })

    const articles = await getDB().getArticlesByCategory(category, limit)
    return NextResponse.json({ category, articles })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to fetch section' }, { status: 500 })
  }
}
