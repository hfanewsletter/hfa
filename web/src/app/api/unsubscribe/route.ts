import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')

  if (!token || token.length < 10) {
    return new NextResponse(renderHTML('Invalid unsubscribe link.', false), {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    })
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return new NextResponse(renderHTML('Service unavailable. Please try again later.', false), {
      status: 503,
      headers: { 'Content-Type': 'text/html' },
    })
  }

  const { data, error } = await supabase
    .from('subscribers')
    .delete()
    .eq('unsubscribe_token', token)
    .select('email')

  if (error) {
    console.error('Unsubscribe error:', error)
    return new NextResponse(renderHTML('Something went wrong. Please try again.', false), {
      status: 500,
      headers: { 'Content-Type': 'text/html' },
    })
  }

  if (!data || data.length === 0) {
    return new NextResponse(
      renderHTML('This link has already been used or is invalid. You are not subscribed.', true),
      { status: 200, headers: { 'Content-Type': 'text/html' } }
    )
  }

  return new NextResponse(
    renderHTML('You have been successfully unsubscribed. You will no longer receive emails from us.', true),
    { status: 200, headers: { 'Content-Type': 'text/html' } }
  )
}

function renderHTML(message: string, success: boolean): string {
  const baseUrl = process.env.WEBSITE_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || ''
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${success ? 'Unsubscribed' : 'Error'} — The American Express Times</title>
  <style>
    body { font-family: Georgia, serif; background: #F0EDE6; margin: 0; padding: 40px 20px; }
    .card { max-width: 500px; margin: 60px auto; background: #fff; border-radius: 8px;
            padding: 40px; text-align: center; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
    .card h1 { color: #1B2D5E; font-size: 22px; margin-bottom: 16px; }
    .card p { color: #444; font-size: 16px; line-height: 1.6; }
    .card a { color: #B22234; text-decoration: none; font-weight: bold; }
    .stripe { height: 4px; background: #B22234; border-radius: 8px 8px 0 0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="stripe"></div>
    <h1>${success ? 'Unsubscribed' : 'Oops'}</h1>
    <p>${message}</p>
    <p style="margin-top:24px;"><a href="${baseUrl}/">Return to homepage</a></p>
  </div>
</body>
</html>`
}
