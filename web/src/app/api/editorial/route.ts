import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest) {
  try {
    const articles = await getDB().getEditorialArticles()
    return NextResponse.json({ articles })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to fetch editorial articles' }, { status: 500 })
  }
}
