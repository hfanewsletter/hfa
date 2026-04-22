import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000 // 1 hour
const MAX_SUBSCRIBES_PER_IP = 5
const subscribeAttempts = new Map<string, { count: number; windowStart: number }>()

// Common disposable email domains to reject
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'tempmail.com', 'throwaway.email',
  'yopmail.com', 'sharklasers.com', 'guerrillamailblock.com', 'grr.la',
  'dispostable.com', 'trashmail.com', 'tempail.com', 'fakeinbox.com',
  'mailnesia.com', 'maildrop.cc', 'discard.email', 'temp-mail.org',
])

function getClientIP(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return 'unknown'
}

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = subscribeAttempts.get(ip)

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    subscribeAttempts.set(ip, { count: 1, windowStart: now })
    return false
  }

  entry.count++
  return entry.count > MAX_SUBSCRIBES_PER_IP
}

function isValidEmail(email: string): boolean {
  // Basic format check — no need for a full RFC 5322 parser
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
  return re.test(email) && email.length <= 254
}

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  // Try all known service key env var names before falling back to anon key.
  // The anon key cannot INSERT into tables without an explicit RLS policy.
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export async function POST(req: NextRequest) {
  const ip = getClientIP(req)

  // Rate limiting temporarily disabled — re-enable when bulk onboarding is complete
  // if (isRateLimited(ip)) {
  //   return NextResponse.json(
  //     { error: 'Too many requests. Please try again later.' },
  //     { status: 429 }
  //   )
  // }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  // Honeypot field — bots tend to fill hidden fields
  if (body.website || body.name) {
    // Silently accept to not tip off bots
    return NextResponse.json({ ok: true })
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''

  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
  }

  // Reject disposable email domains
  const domain = email.split('@')[1]
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return NextResponse.json({ error: 'Please use a permanent email address.' }, { status: 400 })
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Service unavailable.' }, { status: 503 })
  }

  // Check if already subscribed
  const { data: existing } = await supabase
    .from('subscribers')
    .select('id')
    .eq('email', email)
    .limit(1)

  if (existing && existing.length > 0) {
    return NextResponse.json({ ok: true, message: 'You are already subscribed!' })
  }

  const unsubscribeToken = randomUUID()

  const { error } = await supabase.from('subscribers').insert({
    email,
    unsubscribe_token: unsubscribeToken,
    subscribed_at: new Date().toISOString(),
  })

  if (error) {
    if (error.code === '23505') {
      // Unique violation — race condition, already subscribed
      return NextResponse.json({ ok: true, message: 'You are already subscribed!' })
    }
    console.error('Subscribe error:', error)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, message: 'You have been subscribed!' })
}
