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

  try {
    const editorialInboxPath = process.env.EDITORIAL_INBOX_PATH
      ? path.resolve(process.env.EDITORIAL_INBOX_PATH)
      : path.join(process.cwd(), '..', 'editorial_inbox')

    await mkdir(editorialInboxPath, { recursive: true })

    const buffer = Buffer.from(await file.arrayBuffer())
    const dest = path.join(editorialInboxPath, file.name)
    await writeFile(dest, buffer)

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
