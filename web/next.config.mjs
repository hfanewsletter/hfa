/** @type {import('next').NextConfig} */
const nextConfig = {
  // Better-sqlite3 is only used in local dev; exclude from production bundles
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = { ...config.resolve.fallback, 'better-sqlite3': false }
    }
    return config
  },
}

export default nextConfig
