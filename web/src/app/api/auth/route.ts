import { NextRequest, NextResponse } from 'next/server'
import { createSession, COOKIE_NAME } from '@/lib/auth'
import { checkLoginAllowed, recordFailure, clearFailures, getClientIP } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  const ip = getClientIP(req)

  // Check rate limit before doing anything else
  const check = checkLoginAllowed(ip)
  if (!check.allowed) {
    return NextResponse.json(
      { error: `Too many failed attempts. Try again in ${Math.ceil(check.retryAfterSeconds / 60)} minute(s).` },
      {
        status: 429,
        headers: { 'Retry-After': String(check.retryAfterSeconds) },
      }
    )
  }

  const { password } = await req.json()
  const token = createSession(password)

  if (!token) {
    recordFailure(ip)
    // Small artificial delay to slow down scripted attacks
    await new Promise(r => setTimeout(r, 500))
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
  }

  // Successful login — reset the failure counter
  clearFailures(ip)

  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 8 * 60 * 60, // 8 hours
  })
  return res
}

// Logout
export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.delete(COOKIE_NAME)
  return res
}
