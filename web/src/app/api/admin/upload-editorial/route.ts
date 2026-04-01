import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import { isAuthenticated } from '@/lib/auth'

function sanitizeFilename(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[^\w\s.\-()]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^\-+|\-+$/g, '')
}

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
  const safeName = sanitizeFilename(file.name)

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
        .upload(`editorial_inbox/${safeName}`, buffer, {
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
      await writeFile(path.join(editorialInboxPath, safeName), buffer)
    }

    return NextResponse.json({
      ok: true,
      filename: safeName,
      message: 'Queued for editorial processing',
    })
  } catch (err) {
    console.error('Editorial upload error:', err)
    return NextResponse.json({ error: 'Failed to save file' }, { status: 500 })
  }
}
