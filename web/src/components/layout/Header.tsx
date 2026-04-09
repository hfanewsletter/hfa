import Link from 'next/link'
import Image from 'next/image'

export default function Header() {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  return (
    <header className="bg-white">
      {/* Thin accent stripe at very top */}
      <div className="h-1.5 bg-accent w-full" />

      <div className="max-w-7xl mx-auto px-4 py-2">

        {/* Date + tagline row */}
        <div className="flex items-center justify-between text-xs text-gray-400 mb-2 font-sans tracking-wide">
          <span>{today}</span>
          <span className="hidden sm:block uppercase tracking-widest text-[10px]">
            ★ &nbsp; Balanced &nbsp;·&nbsp; Unbiased &nbsp;·&nbsp; Independent &nbsp; ★
          </span>
          <span className="text-primary font-semibold uppercase tracking-widest text-[10px]">Est. 2026</span>
        </div>

        {/* Thin rule above masthead */}
        <div className="border-t border-gray-300 mb-2" />

        {/* Masthead — logo flanks the serif title on md+ screens */}
        <Link
          href="/"
          className="flex items-center justify-center gap-4 hover:opacity-90 transition-opacity"
        >
          {/* Logo icon — visible on md+ */}
          <div className="hidden md:block shrink-0">
            <Image
              src="/logo.jpeg"
              alt="The American Express Times"
              width={120}
              height={120}
              className="h-32 w-auto object-contain"
              priority
            />
          </div>

          {/* Newspaper title */}
          <h1 className="font-serif font-bold leading-none tracking-tight text-center">
            <span
              className="text-accent"
              style={{ fontSize: 'clamp(1.8rem, 5vw, 3.5rem)', letterSpacing: '-0.01em' }}
            >
              The American Express
            </span>
            <span
              className="font-normal align-baseline"
              style={{ fontSize: 'clamp(0.75rem, 1.4vw, 1.15rem)', letterSpacing: '0.08em', marginLeft: '0.4em', color: '#1B2D5E' }}
            >
              Times
            </span>
          </h1>

          {/* Logo icon — mirrored right side, visible on md+ */}
          <div className="hidden md:block shrink-0">
            <Image
              src="/logo.jpeg"
              alt=""
              width={120}
              height={120}
              className="h-32 w-auto object-contain"
              aria-hidden="true"
              priority
            />
          </div>
        </Link>

        {/* Double rule below masthead */}
        <div className="mt-2 border-t-4 border-double border-primary" />
      </div>
    </header>
  )
}
