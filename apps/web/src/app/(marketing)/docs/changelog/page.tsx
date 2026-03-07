import { changelog, type ChangeType } from './changelog-data'

const typeLabels: Record<ChangeType, { label: string; color: string }> = {
  added: { label: 'Added', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  changed: { label: 'Changed', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  fixed: { label: 'Fixed', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
  deprecated: { label: 'Deprecated', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' },
  removed: { label: 'Removed', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  security: { label: 'Security', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' },
}

export const metadata = {
  title: 'API Changelog — Soledgic',
  description: 'Track changes to the Soledgic API across versions.',
}

export default function ChangelogPage() {
  return (
    <div className="max-w-3xl">
      <h1>API Changelog</h1>
      <p className="text-xl text-muted-foreground mb-8">
        Track changes, additions, and deprecations across Soledgic API versions.
      </p>

      <div className="not-prose rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/30 mb-8">
        <p className="text-sm text-blue-800 dark:text-blue-300">
          <strong>Version pinning:</strong> Include the{' '}
          <code className="rounded bg-blue-100 px-1.5 py-0.5 text-xs font-mono dark:bg-blue-900/50 dark:text-blue-200">
            Soledgic-Version
          </code>{' '}
          header in your requests to pin your integration to a specific API version.
          If omitted, the current version is used.
        </p>
      </div>

      <div className="space-y-12">
        {changelog.map((entry) => (
          <section key={entry.version} className="not-prose">
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-xl font-semibold text-foreground m-0">
                {entry.version}
              </h2>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  entry.status === 'current'
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400'
                }`}
              >
                {entry.status === 'current' ? 'Current' : 'Deprecated'}
              </span>
              <span className="text-sm text-muted-foreground">{entry.date}</span>
            </div>

            <p className="text-muted-foreground mb-6">{entry.summary}</p>

            <div className="space-y-6">
              {entry.changes.map((section) => {
                const { label, color } = typeLabels[section.type]
                return (
                  <div key={section.type}>
                    <h3
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium mb-3 ${color}`}
                    >
                      {label}
                    </h3>
                    <ul className="list-disc pl-5 space-y-1.5 text-sm text-foreground">
                      {section.items.map((item, index) => (
                        <li key={`${section.type}-${index}`}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}
