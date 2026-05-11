import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

interface SendGridEvent {
  event: string
  email: string
  type?: string
}

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get('secret')
  const expectedSecret = process.env.SENDGRID_WEBHOOK_SECRET

  if (!expectedSecret || secret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let events: SendGridEvent[]
  try {
    events = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  if (!Array.isArray(events) || events.length === 0) {
    return NextResponse.json({ ok: true })
  }

  const emailsToRemove = new Set<string>()

  for (const event of events) {
    const isHardBounce = event.event === 'bounce' && event.type === 'bounce'
    const isSpamReport = event.event === 'spamreport'
    const isSendGridUnsub = event.event === 'unsubscribe'

    if ((isHardBounce || isSpamReport || isSendGridUnsub) && event.email) {
      emailsToRemove.add(event.email.toLowerCase())
    }
  }

  if (emailsToRemove.size === 0) {
    return NextResponse.json({ ok: true })
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
  }

  const { error } = await supabase
    .from('subscribers')
    .delete()
    .in('email', Array.from(emailsToRemove))

  if (error) {
    console.error('Webhook: failed to remove subscribers:', error)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  console.log(`SendGrid webhook: removed ${emailsToRemove.size} subscriber(s)`, Array.from(emailsToRemove))
  return NextResponse.json({ ok: true })
}
