import { NextResponse } from 'next/server'
import { getDB } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const data = await getDB().getHomepageData()
    return NextResponse.json(data)
  } catch (err) {
    console.error(err)
    return NextResponse.json({ error: 'Failed to fetch homepage data' }, { status: 500 })
  }
}
