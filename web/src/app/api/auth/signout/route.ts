import { type NextRequest, NextResponse } from 'next/server'
import { COOKIE_NAME } from '@/lib/auth'

export async function GET(req: NextRequest) {
  // req.url is the internal proxy URL on Render (localhost:10000).
  // req.nextUrl correctly reflects the public-facing origin via x-forwarded-* headers.
  const loginUrl = req.nextUrl.clone()
  loginUrl.pathname = '/admin/login'
  const res = NextResponse.redirect(loginUrl)
  res.cookies.delete(COOKIE_NAME)
  return res
}
