import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20'), 100)

  try {
    const articles = await getDB().getLatestArticles(limit)
    return NextResponse.json({ articles })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to fetch articles' }, { status: 500 })
  }
}
