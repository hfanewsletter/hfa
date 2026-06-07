// Dynamic ads.txt — AdSense reads this to authorize Google to sell your ad
// inventory. Auto-populates from NEXT_PUBLIC_ADSENSE_CLIENT (format
// "ca-pub-XXXXXXXXXXXXXXXX"); the ads.txt line needs the "pub-..." form.
// Returns empty until the publisher ID is set, so it's harmless before approval.

export const dynamic = 'force-dynamic'

export function GET() {
  const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT || 'ca-pub-2301673756919908'
  const pub = client.replace(/^ca-/, '') // ca-pub-1234 -> pub-1234

  const body = pub
    ? `google.com, ${pub}, DIRECT, f08c47fec0942fa0\n`
    : '# ads.txt — pending AdSense publisher ID\n'

  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
