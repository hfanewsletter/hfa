import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const date = searchParams.get('date') ?? new Date().toISOString().slice(0, 10)
    const articles = await getDB().getEditorialArticles(date)
    return NextResponse.json({ articles })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to fetch editorial articles' }, { status: 500 })
  }
}
