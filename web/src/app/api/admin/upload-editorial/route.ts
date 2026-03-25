import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { isAuthenticated } from '@/lib/auth'

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
      // Production: upload to Supabase Storage bucket (editorial_inbox folder)
      const { createClient } = await import('@supabase/supabase-js')
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY
      )
      const { error } = await supabase.storage
        .from('pdfs')
        .upload(`editorial_inbox/${file.name}`, buffer, {
          contentType: 'application/pdf',
          upsert: true,
        })
      if (error) throw new Error(error.message)
    } else {
      // Local dev: write to editorial_inbox/ folder on disk
      const editorialInboxPath = process.env.EDITORIAL_INBOX_PATH
        ? path.resolve(process.env.EDITORIAL_INBOX_PATH)
        : path.join(process.cwd(), '..', 'editorial_inbox')
      await mkdir(editorialInboxPath, { recursive: true })
      await writeFile(path.join(editorialInboxPath, file.name), buffer)
    }

    return NextResponse.json({
      ok: true,
      filename: file.name,
      message: 'Queued for editorial processing',
    })
  } catch (err) {
    console.error('Editorial upload error:', err)
    return NextResponse.json({ error: 'Failed to save file' }, { status: 500 })
  }
}
