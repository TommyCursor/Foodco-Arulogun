import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    // Ant Design requires this for server components
    optimizePackageImports: ['antd', '@ant-design/icons', 'echarts-for-react'],
  },
  // Disable webpack persistent filesystem cache — fixes ENOSPC on Windows
  webpack: (config) => {
    config.cache = false
    return config
  },
  // Skip type-checking and lint during next build — run separately with tsc / eslint
  typescript: { ignoreBuildErrors: true },
  eslint:     { ignoreDuringBuilds: true },
}

export default nextConfig
