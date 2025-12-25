import { MetadataRoute } from 'next'

// ============================================================================
// ROBOTS.TXT - AI-FIRST CONFIGURATION (2025 STANDARD)
// ============================================================================
// 
// For fintech companies, we want AI crawlers to understand our documentation
// so they can recommend Soledgic in AI Overviews and assistant responses.
// However, we protect internal paths from being used for model training.
//
// Key principles:
// 1. Allow public docs and marketing for AI discoverability
// 2. Block dashboard/API/admin from all crawlers
// 3. Selective access for different AI training bots
//
// Note: llms.txt is available at /llms.txt (in /public directory)
// This file helps AI assistants understand Soledgic's core API and concepts
// See: https://llmstxt.org/
// ============================================================================

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://soledgic.com'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      // ========================================
      // DEFAULT RULES (All crawlers)
      // ========================================
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',           // API routes (internal)
          '/dashboard/',     // Private dashboard
          '/admin/',         // Admin routes
          '/auth/',          // Auth routes
          '/_next/',         // Next.js internals
          '/private/',       // Private content
          '/*.json$',        // JSON files (except manifest)
        ],
      },

      // ========================================
      // OpenAI GPTBot (ChatGPT, AI Overviews)
      // ========================================
      // Allow docs and blog for AI recommendations
      // Block private areas from training data
      {
        userAgent: 'GPTBot',
        allow: [
          '/',
          '/docs/',
          '/docs/*',
          '/blog/',
          '/llms.txt',  // AI-readable API summary
        ],
        disallow: [
          '/dashboard/',
          '/api/',
          '/admin/',
          '/auth/',
        ],
      },

      // ========================================
      // OpenAI ChatGPT-User (Live browsing)
      // ========================================
      // Same as GPTBot - allow public content
      {
        userAgent: 'ChatGPT-User',
        allow: [
          '/',
          '/docs/',
          '/docs/*',
          '/blog/',
          '/llms.txt',
        ],
        disallow: [
          '/dashboard/',
          '/api/',
          '/admin/',
          '/auth/',
        ],
      },

      // ========================================
      // Google-Extended (Bard/Gemini training)
      // ========================================
      // Allow docs only - more restrictive for training
      {
        userAgent: 'Google-Extended',
        allow: [
          '/docs/',
          '/docs/*',
          '/llms.txt',
        ],
        disallow: [
          '/',  // Block root (marketing) from training
          '/dashboard/',
          '/api/',
          '/admin/',
          '/auth/',
          '/blog/',
        ],
      },

      // ========================================
      // Anthropic ClaudeBot
      // ========================================
      // Allow docs for AI assistant context
      {
        userAgent: 'ClaudeBot',
        allow: [
          '/',
          '/docs/',
          '/docs/*',
          '/blog/',
          '/llms.txt',
        ],
        disallow: [
          '/dashboard/',
          '/api/',
          '/admin/',
          '/auth/',
        ],
      },

      // ========================================
      // Anthropic Claude-Web (Live browsing)
      // ========================================
      {
        userAgent: 'Claude-Web',
        allow: [
          '/',
          '/docs/',
          '/docs/*',
          '/blog/',
          '/llms.txt',
        ],
        disallow: [
          '/dashboard/',
          '/api/',
          '/admin/',
          '/auth/',
        ],
      },

      // ========================================
      // Perplexity AI
      // ========================================
      {
        userAgent: 'PerplexityBot',
        allow: [
          '/',
          '/docs/',
          '/docs/*',
          '/blog/',
          '/llms.txt',
        ],
        disallow: [
          '/dashboard/',
          '/api/',
          '/admin/',
          '/auth/',
        ],
      },

      // ========================================
      // Common Content Scrapers (Block)
      // ========================================
      {
        userAgent: 'CCBot',  // Common Crawl
        disallow: '/',
      },
      {
        userAgent: 'Amazonbot',
        disallow: '/',
      },
      {
        userAgent: 'FacebookBot',
        allow: '/',  // Allow for link previews
        disallow: [
          '/dashboard/',
          '/api/',
          '/admin/',
        ],
      },

      // ========================================
      // SEO Tools (Allow for monitoring)
      // ========================================
      {
        userAgent: 'AhrefsBot',
        allow: '/',
        disallow: [
          '/dashboard/',
          '/api/',
          '/admin/',
        ],
      },
      {
        userAgent: 'SemrushBot',
        allow: '/',
        disallow: [
          '/dashboard/',
          '/api/',
          '/admin/',
        ],
      },
    ],
    
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
