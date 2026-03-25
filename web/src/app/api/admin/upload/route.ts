import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { isAuthenticated } from '@/lib/auth'
import { getDB } from '@/lib/db'

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const form = await req.formData()
  const file = form.get('pdf') as File | null

  if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'A PDF file is required' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  try {
    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
      // Production: upload to Supabase Storage bucket
      const { createClient } = await import('@supabase/supabase-js')
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY
      )
      const { error } = await supabase.storage
        .from('pdfs')
        .upload(`inbox/${file.name}`, buffer, {
          contentType: 'application/pdf',
          upsert: true,
        })
      if (error) throw new Error(error.message)
    } else {
      // Local dev: write to inbox/ folder on disk
      const inboxPath = process.env.INBOX_PATH
        ? path.resolve(process.env.INBOX_PATH)
        : path.join(process.cwd(), '..', 'inbox')
      await mkdir(inboxPath, { recursive: true })
      await writeFile(path.join(inboxPath, file.name), buffer)
    }

    try {
      await getDB().createPendingPDF(file.name)
    } catch {
      // Non-fatal — pipeline creates its own record when it starts
    }

    return NextResponse.json({ ok: true, filename: file.name, message: 'Queued for processing' })
  } catch (err) {
    console.error('Upload error:', err)
    return NextResponse.json({ error: 'Failed to save file' }, { status: 500 })
  }
}
