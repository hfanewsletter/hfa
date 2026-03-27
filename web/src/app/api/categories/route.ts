import { NextResponse } from 'next/server'
import { getDB } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const categories = await getDB().getCategories()
    return NextResponse.json({ categories })
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 })
  }
}
