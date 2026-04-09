'use client'

export default function SignOutButton() {
  async function handleSignOut() {
    await fetch('/api/auth', { method: 'DELETE' })
    window.location.href = '/admin/login'
  }
  return (
    <button
      onClick={handleSignOut}
      className="text-xs text-gray-400 hover:text-gray-700 underline"
    >
      Sign out
    </button>
  )
}
