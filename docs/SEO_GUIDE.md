# Soledgic SEO Implementation Guide (Advanced)

## Overview

This document outlines all SEO improvements implemented for the Soledgic marketing site, including advanced structured data patterns optimized for fintech E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness).

---

## Technical SEO Architecture

### Schema.org Structured Data Hierarchy

```
Organization (soledgic.com/#organization)
├── WebSite (soledgic.com/#website)
│   └── SearchAction (site search)
├── SoftwareApplication (pricing, features)
└── TechArticle (documentation pages)
    ├── BreadcrumbList
    ├── HowTo (tutorials)
    └── SoftwareSourceCode (API reference)
```

### Files Structure

```
src/
├── app/
│   ├── layout.tsx                 # Root metadata, Organization schema
│   ├── page.tsx                   # Landing page, FAQ schema
│   ├── sitemap.ts                 # Dynamic sitemap
│   ├── robots.ts                  # AI-first crawler config
│   └── (marketing)/
│       └── docs/
│           ├── layout.tsx         # Shared docs layout
│           ├── page.tsx           # Docs index, TechArticle schema
│           └── quickstart/
│               └── page.tsx       # TechArticle + HowTo schemas
└── components/
    └── seo/
        ├── index.ts               # Exports
        └── schemas.tsx            # Reusable schema components
```

---

## Schema Components

### 1. TechArticleSchema

For technical documentation - signals expertise to search engines.

```tsx
import { TechArticleSchema } from '@/components/seo'

<TechArticleSchema
  headline="Double-Entry Ledger Integration Guide"
  description="Step-by-step instructions for integrating..."
  slug="guides/marketplace"
  proficiencyLevel="Advanced"
  dependencies="Node.js 18+, Supabase account"
  datePublished="2025-01-01T00:00:00Z"
  timeRequired={15}
  keywords={['integration', 'marketplace', 'revenue splits']}
  articleSection="Guides"
  wordCount={2500}
/>
```

**Props:**
| Prop | Type | Required | Description |
|------|------|----------|-------------|
| headline | string | ✅ | Article title |
| description | string | ✅ | Meta description |
| slug | string | ✅ | URL path after /docs/ |
| proficiencyLevel | Beginner/Intermediate/Advanced/Expert | ❌ | Skill level required |
| dependencies | string | ❌ | Technical prerequisites |
| datePublished | string | ✅ | ISO date of first publish |
| dateModified | string | ❌ | ISO date of last update (defaults to now) |
| timeRequired | number | ❌ | Reading time in minutes |
| keywords | string[] | ❌ | Article keywords |
| articleSection | string | ❌ | Category (e.g., "API Reference") |
| wordCount | number | ❌ | Article word count |

### 2. BreadcrumbSchema + Breadcrumbs

For navigation hierarchy in search results.

```tsx
import { BreadcrumbSchema, Breadcrumbs } from '@/components/seo'

const items = [
  { name: 'Home', href: '/' },
  { name: 'Documentation', href: '/docs' },
  { name: 'API Reference', href: '/docs/api' },
  { name: 'Record Sale', href: '/docs/api/record-sale' },
]

// In your component:
<BreadcrumbSchema items={items} />
<Breadcrumbs items={items} />
```

### 3. HowToSchema

For step-by-step guides (enables "How To" rich snippets).

```tsx
import { HowToSchema } from '@/components/seo'

<HowToSchema
  name="How to Integrate Soledgic Accounting API"
  description="Step-by-step guide to set up double-entry accounting"
  steps={[
    { name: 'Create a Ledger', text: 'Sign up and create your first ledger...' },
    { name: 'Record Your First Sale', text: 'Use the POST /record-sale endpoint...' },
  ]}
  totalTime={5}
  estimatedCost={{ currency: 'USD', value: '0' }}
/>
```

### 4. SoftwareSourceCodeSchema

For API reference pages with code examples.

```tsx
import { SoftwareSourceCodeSchema } from '@/components/seo'

<SoftwareSourceCodeSchema
  name="Record Sale API"
  description="Create sale transactions with revenue splits"
  programmingLanguage="JavaScript"
  runtimePlatform="Node.js"
/>
```

---

## AI Crawler Configuration (robots.ts)

### Strategy

1. **Allow public docs** for AI discoverability (ChatGPT, Claude, Perplexity)
2. **Block private routes** from all crawlers
3. **Selective training access** - docs only for Google-Extended

### Crawler Rules

| Bot | Description | Access |
|-----|-------------|--------|
| GPTBot | OpenAI training | Docs + Blog |
| ChatGPT-User | ChatGPT browsing | Docs + Blog |
| Google-Extended | Bard/Gemini training | Docs only |
| ClaudeBot | Anthropic training | Docs + Blog |
| Claude-Web | Claude browsing | Docs + Blog |
| PerplexityBot | Perplexity AI | Docs + Blog |
| CCBot | Common Crawl | Blocked |
| Amazonbot | Amazon | Blocked |

---

## E-E-A-T Optimization for Fintech

### Experience
- Real code examples in documentation
- Step-by-step tutorials with actual API responses
- "Time to read" and "Proficiency level" indicators

### Expertise
- TechArticle schema with `proficiencyLevel`
- `dependencies` field showing required knowledge
- Author credentials linked to organization

### Authoritativeness
- Organization schema with `sameAs` links to:
  - GitHub
  - Twitter/X
  - LinkedIn
- License information (CC BY-NC-SA 4.0)

### Trustworthiness
- `dateModified` pulled from actual content updates
- Immutable audit trail messaging
- Security documentation references

---

## Implementation Checklist

### Required for All Doc Pages

```tsx
// 1. Import components
import { TechArticleSchema, BreadcrumbSchema, Breadcrumbs } from '@/components/seo'

// 2. Define breadcrumbs
const breadcrumbItems = [
  { name: 'Home', href: '/' },
  { name: 'Documentation', href: '/docs' },
  { name: 'Your Page', href: '/docs/your-page' },
]

// 3. Add schemas to JSX
export default function YourPage() {
  return (
    <>
      <TechArticleSchema
        headline="Your Page Title"
        description="Your page description"
        slug="your-page"
        proficiencyLevel="Intermediate"
        datePublished="2025-01-01T00:00:00Z"
      />
      <BreadcrumbSchema items={breadcrumbItems} />
      
      <main>
        <Breadcrumbs items={breadcrumbItems} />
        {/* Your content */}
      </main>
    </>
  )
}
```

### For Tutorial Pages (Add HowTo)

```tsx
<HowToSchema
  name="How to [Task]"
  description="Learn how to..."
  steps={[...]}
  totalTime={10}
/>
```

### For API Reference Pages (Add SoftwareSourceCode)

```tsx
<SoftwareSourceCodeSchema
  name="[Endpoint] API"
  description="..."
  programmingLanguage="JavaScript"
/>
```

---

## Verification & Testing

### Rich Results Test
Test your pages: https://search.google.com/test/rich-results

Expected rich result types:
- ✅ TechArticle
- ✅ BreadcrumbList
- ✅ HowTo (for tutorials)
- ✅ FAQ (for landing page)
- ✅ SoftwareApplication (for landing page)

### Schema Validator
Validate JSON-LD: https://validator.schema.org/

### AI Crawler Testing
Check if AI bots can access your content:
```bash
# Simulate GPTBot
curl -A "GPTBot" https://soledgic.com/docs/quickstart

# Simulate ClaudeBot
curl -A "ClaudeBot" https://soledgic.com/docs/quickstart
```

---

## Date Management

### datePublished
Set once when page is created. Should be static string:
```tsx
datePublished="2025-01-15T00:00:00Z"
```

### dateModified
Options for keeping fresh:

1. **Static (Simple)**: Update manually when content changes
2. **Git-based**: Pull from last commit date
3. **CMS-based**: Pull from `updated_at` field

For Git-based approach, add to your build:
```tsx
// In getStaticProps or server component
import { execSync } from 'child_process'

const lastModified = execSync(
  `git log -1 --format=%cI -- ${filePath}`
).toString().trim()
```

---

## Content Freshness Signals

Google prioritizes "fresh" technical documentation. Ensure:

1. `dateModified` updates when content changes
2. Version numbers in API docs (e.g., "API v1.2")
3. Changelog or "Last updated" visible on page
4. Regular content audits (quarterly)

---

## Monitoring

### Google Search Console
- Monitor "Technical Article" rich results
- Check breadcrumb appearance
- Track indexing status for /docs/*

### Core Web Vitals
Target scores:
- LCP: < 2.5s
- FID: < 100ms
- CLS: < 0.1

### Keyword Tracking
Track rankings for:
- "accounting API"
- "double-entry accounting software"
- "creator platform accounting"
- "revenue split API"

---

## Future Enhancements

1. **VideoObject schema** for tutorial videos
2. **Course schema** for learning paths
3. **Person schema** for individual author pages
4. **Review schema** for testimonials (when available)
5. **Event schema** for webinars/launches
