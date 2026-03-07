'use client'

import Script from 'next/script'

declare global {
  interface Window {
    Scalar?: {
      createApiReference: (selector: string, config: Record<string, unknown>) => void
    }
  }
}

export default function ExplorerPage() {
  return (
    <div className="not-prose -mx-4 sm:-mx-6 lg:-mx-8 min-h-screen">
      <div id="scalar-api-reference" />
      <Script
        src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"
        strategy="afterInteractive"
        onLoad={() => {
          window.Scalar?.createApiReference('#scalar-api-reference', {
            url: '/openapi.yaml',
          })
        }}
      />
    </div>
  )
}
