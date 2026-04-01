import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'

const COOKIE_NAME = 'hfa_admin_session'

function verifyToken(token: string): boolean {
  try {
    const s = process.env.AUTH_SECRET
    if (!s) return false
    const decoded = Buffer.from(token, 'base64url').toString()
    const parts = decoded.split(':')
    if (parts.length !== 3) return false
    const expires = Number(parts[1])
    if (Date.now() > expires) return false
    const payload = parts.slice(0, 2).join(':')
    const sig = parts[2]
    const expected = createHmac('sha256', s).update(payload).digest('hex')
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  } catch {
    return false
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Protect all /admin routes except /admin/login
  if (pathname.startsWith('/admin') && !pathname.startsWith('/admin/login')) {
    const token = request.cookies.get(COOKIE_NAME)?.value
    if (!token || !verifyToken(token)) {
      const loginUrl = new URL('/admin/login', request.url)
      loginUrl.searchParams.set('next', pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  return NextResponse.next()
}

export const config = {
  // Matches /admin and all sub-paths (/admin/login, /admin/anything)
  matcher: ['/admin(.*)'],
}
