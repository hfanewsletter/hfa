import { NextRequest, NextResponse } from 'next/server'
import { isAuthenticated } from '@/lib/auth'
import { getDB } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    // Local dev — caller should use the regular /api/admin/upload route instead
    return NextResponse.json({ local: true })
  }

  const { filename, folder = 'inbox' } = await req.json()
  if (!filename || !filename.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'A PDF filename is required' }, { status: 400 })
  }

  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

  const { data, error } = await supabase.storage
    .from('pdfs')
    .createSignedUploadUrl(`${folder}/${filename}`, { upsert: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Create a pending PDF record (non-fatal if it fails)
  try {
    await getDB().createPendingPDF(filename)
  } catch { /* pipeline creates its own record */ }

  return NextResponse.json({ signedUrl: data.signedUrl, token: data.token, path: `${folder}/${filename}` })
}
