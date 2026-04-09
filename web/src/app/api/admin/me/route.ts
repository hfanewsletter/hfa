import { NextResponse } from 'next/server'
import { isAuthenticated } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  const admin = await isAuthenticated()
  return NextResponse.json({ isAdmin: admin })
}
