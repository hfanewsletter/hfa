import { NextRequest, NextResponse } from 'next/server'
import { isAuthenticated } from '@/lib/auth'
import { getDB } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { filenames } = await req.json()
  if (!Array.isArray(filenames) || filenames.length === 0) {
    return NextResponse.json({ error: 'filenames array required' }, { status: 400 })
  }
  await getDB().dismissStuckPDFs(filenames)
  return NextResponse.json({ ok: true })
}
