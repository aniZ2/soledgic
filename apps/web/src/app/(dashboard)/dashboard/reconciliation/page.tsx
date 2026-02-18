'use client'

import Link from 'next/link'
import { Upload, ExternalLink } from 'lucide-react'

export default function ReconciliationPage() {
  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">Reconciliation</h1>
        <p className="text-muted-foreground mt-1">
          Import transactions and match them to your ledger to keep books clean.
        </p>
      </div>

      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Import Transactions</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Upload a CSV export from your bank or accounting system, then review matches.
            </p>
          </div>
          <Link
            href="/dashboard/reconciliation/import"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 text-sm"
          >
            <Upload className="w-4 h-4" />
            Import CSV
          </Link>
        </div>

        <div className="mt-4 text-sm text-muted-foreground">
          <Link href="/docs/api#import-transactions" className="inline-flex items-center gap-1 text-primary hover:underline">
            <ExternalLink className="w-4 h-4" />
            View import API docs
          </Link>
        </div>
      </div>
    </div>
  )
}

