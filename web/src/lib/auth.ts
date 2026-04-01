import { createHmac, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'

const COOKIE_NAME = 'hfa_admin_session'
const TOKEN_TTL_MS = 8 * 60 * 60 * 1000 // 8 hours

function secret(): string {
  const s = process.env.AUTH_SECRET
  if (!s) throw new Error('AUTH_SECRET env var is not set')
  return s
}

function makeToken(password: string): string {
  const expires = Date.now() + TOKEN_TTL_MS
  const payload = `${password}:${expires}`
  const sig = createHmac('sha256', secret()).update(payload).digest('hex')
  return Buffer.from(`${payload}:${sig}`).toString('base64url')
}

function verifyToken(token: string): boolean {
  try {
    const decoded = Buffer.from(token, 'base64url').toString()
    const parts = decoded.split(':')
    if (parts.length !== 3) return false
    const [, expires, sig] = parts
    if (Date.now() > Number(expires)) return false
    const payload = parts.slice(0, 2).join(':')
    const expected = createHmac('sha256', secret()).update(payload).digest('hex')
    return timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  } catch {
    return false
  }
}

/** Verify a submitted password and return a signed session token if correct. */
export function createSession(password: string): string | null {
  const expected = process.env.ADMIN_PASSWORD

  // Warn loudly in logs if the password is dangerously weak
  if (expected && expected.length < 16) {
    console.warn(
      '[SECURITY] ADMIN_PASSWORD is fewer than 16 characters. ' +
      'Use a randomly generated password of at least 20 characters in production.'
    )
  }
  if (expected === 'changeme' || expected === 'password' || expected === 'admin') {
    console.error(
      '[SECURITY] ADMIN_PASSWORD is set to a known default value. ' +
      'Change it immediately before deploying to production.'
    )
  }

  if (!expected || password !== expected) return null
  return makeToken(password)
}

/** Check whether the current request has a valid admin session cookie. */
export async function isAuthenticated(): Promise<boolean> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return false
  return verifyToken(token)
}

export { COOKIE_NAME }
