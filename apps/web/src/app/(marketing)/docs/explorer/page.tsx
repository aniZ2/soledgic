'use client'

import Script from 'next/script'

export default function ExplorerPage() {
  return (
    <div className="not-prose -mx-4 sm:-mx-6 lg:-mx-8">
      <Script
        src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"
        strategy="afterInteractive"
      />
      <div
        id="api-reference"
        data-url="/openapi.yaml"
        data-proxy-url="https://proxy.scalar.com"
      />
    </div>
  )
}
