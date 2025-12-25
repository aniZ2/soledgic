/** @type {import('next').NextConfig} */
const nextConfig = {
  // ============================================================================
  // SEO OPTIMIZATIONS
  // ============================================================================
  
  // Generate static pages for better SEO
  output: 'standalone',
  
  // Trailing slashes - pick one and stick with it
  trailingSlash: false,
  
  // Compress responses
  compress: true,
  
  // Generate ETags for caching
  generateEtags: true,
  
  // ============================================================================
  // SECURITY HEADERS
  // ============================================================================
  async headers() {
    return [
      {
        // Apply to all routes
        source: '/:path*',
        headers: [
          // Security headers
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          // Content Security Policy
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.stripe.com https://cdn.plaid.com https://www.googletagmanager.com https://www.google-analytics.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https://*.stripe.com https://*.supabase.co https://www.google-analytics.com",
              "font-src 'self' https://fonts.gstatic.com",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://*.plaid.com https://www.google-analytics.com",
              "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://cdn.plaid.com",
              "form-action 'self'",
              "base-uri 'self'",
              "object-src 'none'",
            ].join('; '),
          },
          // HSTS for production only
          ...(process.env.NODE_ENV === 'production' ? [{
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          }] : []),
        ],
      },
      // Cache static assets aggressively
      {
        source: '/(.*).(ico|png|jpg|jpeg|gif|webp|svg|woff|woff2)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      // Cache JS/CSS with revalidation
      {
        source: '/_next/static/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ]
  },
  
  // ============================================================================
  // REDIRECTS (SEO - handle old URLs, trailing slashes, etc.)
  // ============================================================================
  async redirects() {
    return [
      // Redirect common typos/old URLs
      {
        source: '/documentation',
        destination: '/docs',
        permanent: true,
      },
      {
        source: '/api-docs',
        destination: '/docs',
        permanent: true,
      },
      {
        source: '/pricing',
        destination: '/#pricing',
        permanent: true,
      },
      {
        source: '/features',
        destination: '/#features',
        permanent: true,
      },
      // Redirect www to non-www (or vice versa) - pick one
      ...(process.env.NODE_ENV === 'production' ? [
        {
          source: '/:path*',
          has: [
            {
              type: 'host',
              value: 'www.soledgic.com',
            },
          ],
          destination: 'https://soledgic.com/:path*',
          permanent: true,
        },
      ] : []),
    ]
  },
  
  // ============================================================================
  // REWRITES (SEO-friendly URLs)
  // ============================================================================
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: [],
      fallback: [],
    }
  },
  
  // Remove X-Powered-By header
  poweredByHeader: false,
  
  // Strict mode for React
  reactStrictMode: true,
  
  // ============================================================================
  // IMAGE OPTIMIZATION
  // ============================================================================
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
    dangerouslyAllowSVG: false,
    // Modern formats for better performance
    formats: ['image/avif', 'image/webp'],
    // Device sizes for responsive images
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  
  // ============================================================================
  // EXPERIMENTAL FEATURES (for SEO)
  // ============================================================================
  experimental: {
    // Optimize package imports
    optimizePackageImports: ['lucide-react'],
  },
}

module.exports = nextConfig
