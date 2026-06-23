import { NextRequest, NextResponse } from 'next/server'
import { getDB } from '@/lib/db'
import { isAuthenticated } from '@/lib/auth'

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let payload: { title?: string; body?: string; summary?: string }
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const title = (payload.title || '').trim()
  const body = (payload.body || '').trim()
  const summary = (payload.summary || '').trim()

  if (title.length < 5) {
    return NextResponse.json({ error: 'Title must be at least 5 characters.' }, { status: 400 })
  }
  if (body.length < 200) {
    return NextResponse.json(
      { error: 'Editorial body is too short — aim for at least a few substantial paragraphs.' },
      { status: 400 }
    )
  }

  try {
    const article = await getDB().createEditorial({ title, body, summary })
    return NextResponse.json({ article }, { status: 201 })
  } catch (err) {
    console.error('Failed to create editorial:', err)
    return NextResponse.json({ error: 'Failed to publish editorial.' }, { status: 500 })
  }
}
