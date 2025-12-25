// ============================================================================
// TECH ARTICLE SCHEMA COMPONENT
// Generates JSON-LD structured data for technical documentation
// Improves E-E-A-T signals for fintech content
// ============================================================================

export type ProficiencyLevel = 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert'

export interface TechArticleSchemaProps {
  /** Article headline/title */
  headline: string
  /** Article description */
  description: string
  /** URL slug (e.g., 'quickstart', 'api/record-sale') */
  slug: string
  /** Proficiency level required */
  proficiencyLevel?: ProficiencyLevel
  /** Technical dependencies (e.g., "Node.js 18+, Supabase account") */
  dependencies?: string
  /** Date first published (ISO format) */
  datePublished: string
  /** Date last modified (ISO format) - defaults to now */
  dateModified?: string
  /** Estimated reading time in minutes */
  timeRequired?: number
  /** Article keywords */
  keywords?: string[]
  /** Article category */
  articleSection?: string
  /** Word count */
  wordCount?: number
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://soledgic.com'

export function TechArticleSchema({
  headline,
  description,
  slug,
  proficiencyLevel = 'Intermediate',
  dependencies,
  datePublished,
  dateModified,
  timeRequired,
  keywords,
  articleSection,
  wordCount,
}: TechArticleSchemaProps) {
  const articleUrl = `${SITE_URL}/docs/${slug}`
  
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline,
    description,
    proficiencyLevel,
    ...(dependencies && { dependencies }),
    ...(timeRequired && { timeRequired: `PT${timeRequired}M` }),
    ...(keywords && { keywords: keywords.join(', ') }),
    ...(articleSection && { articleSection }),
    ...(wordCount && { wordCount }),
    
    // Images
    image: `${SITE_URL}/og-image.png`,
    
    // Author - Organization with expertise signals
    author: {
      '@type': 'Organization',
      name: 'Soledgic Engineering',
      url: SITE_URL,
      // Link to social profiles for authority
      sameAs: [
        'https://github.com/soledgic',
        'https://twitter.com/soledgic',
        'https://linkedin.com/company/soledgic',
      ],
    },
    
    // Publisher - References main organization
    publisher: {
      '@id': `${SITE_URL}/#organization`,
    },
    
    // Dates - Critical for freshness signals
    datePublished,
    dateModified: dateModified || new Date().toISOString(),
    
    // Main entity
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': articleUrl,
    },
    
    // In language
    inLanguage: 'en-US',
    
    // License (optional - signals trust)
    license: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
    
    // Is part of documentation
    isPartOf: {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      name: 'Soledgic Documentation',
    },
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}

// ============================================================================
// BREADCRUMB SCHEMA COMPONENT
// Generates JSON-LD breadcrumb structured data
// Creates "Docs > Category > Page" links in search results
// ============================================================================

export interface BreadcrumbItem {
  name: string
  href: string
}

export interface BreadcrumbSchemaProps {
  items: BreadcrumbItem[]
}

export function BreadcrumbSchema({ items }: BreadcrumbSchemaProps) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.href.startsWith('http') ? item.href : `${SITE_URL}${item.href}`,
    })),
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}

// ============================================================================
// VISUAL BREADCRUMB COMPONENT
// Renders visible breadcrumb navigation
// ============================================================================

export function Breadcrumbs({ items }: BreadcrumbSchemaProps) {
  return (
    <nav className="mb-8" aria-label="Breadcrumb">
      <ol className="flex items-center gap-2 text-sm text-muted-foreground">
        {items.map((item, index) => (
          <li key={item.href} className="flex items-center gap-2">
            {index > 0 && <span aria-hidden="true">/</span>}
            {index === items.length - 1 ? (
              <span className="text-foreground font-medium">{item.name}</span>
            ) : (
              <a href={item.href} className="hover:text-foreground transition-colors">
                {item.name}
              </a>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}

// ============================================================================
// HOW-TO SCHEMA COMPONENT
// For step-by-step guides (like quickstart)
// ============================================================================

export interface HowToStep {
  name: string
  text: string
  image?: string
  url?: string
}

export interface HowToSchemaProps {
  name: string
  description: string
  steps: HowToStep[]
  totalTime?: number // in minutes
  estimatedCost?: { currency: string; value: string }
}

export function HowToSchema({
  name,
  description,
  steps,
  totalTime,
  estimatedCost,
}: HowToSchemaProps) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name,
    description,
    ...(totalTime && { totalTime: `PT${totalTime}M` }),
    ...(estimatedCost && {
      estimatedCost: {
        '@type': 'MonetaryAmount',
        currency: estimatedCost.currency,
        value: estimatedCost.value,
      },
    }),
    step: steps.map((step, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      name: step.name,
      text: step.text,
      ...(step.image && { image: step.image }),
      ...(step.url && { url: step.url }),
    })),
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}

// ============================================================================
// SOFTWARE SOURCE CODE SCHEMA
// For API reference pages
// ============================================================================

export interface SoftwareSourceCodeSchemaProps {
  name: string
  description: string
  programmingLanguage: string
  codeRepository?: string
  runtimePlatform?: string
}

export function SoftwareSourceCodeSchema({
  name,
  description,
  programmingLanguage,
  codeRepository,
  runtimePlatform,
}: SoftwareSourceCodeSchemaProps) {
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareSourceCode',
    name,
    description,
    programmingLanguage,
    ...(codeRepository && { codeRepository }),
    ...(runtimePlatform && { runtimePlatform }),
    author: {
      '@type': 'Organization',
      name: 'Soledgic',
    },
  }

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  )
}
