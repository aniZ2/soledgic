'use client'

import { useState, useRef } from 'react'
import { Upload, X, FileText, Image, Check, AlertCircle } from 'lucide-react'

interface ReceiptUploadProps {
  ledgerId: string
  expenseId?: string
  onUpload?: (receiptId: string) => void
}

const MAX_SIZE_MB = 5
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']

export function ReceiptUpload({ ledgerId, expenseId, onUpload }: ReceiptUploadProps) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploaded, setUploaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (!selected) return

    setError(null)
    setUploaded(false)

    // Validate type
    if (!ALLOWED_TYPES.includes(selected.type)) {
      setError('Invalid file type. Use JPG, PNG, WebP, or PDF.')
      return
    }

    // Validate size
    if (selected.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`File too large. Maximum ${MAX_SIZE_MB}MB.`)
      return
    }

    setFile(selected)

    // Generate preview for images
    if (selected.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (e) => setPreview(e.target?.result as string)
      reader.readAsDataURL(selected)
    } else {
      setPreview(null)
    }
  }

  const handleUpload = async () => {
    if (!file) return

    setUploading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      if (expenseId) {
        formData.append('expense_id', expenseId)
      }

      const response = await fetch(`/api/ledgers/${ledgerId}/receipts`, {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Upload failed')
      }

      setUploaded(true)
      onUpload?.(result.receipt_id)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  const handleClear = () => {
    setFile(null)
    setPreview(null)
    setUploaded(false)
    setError(null)
    if (inputRef.current) {
      inputRef.current.value = ''
    }
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-foreground">
        Receipt (optional)
      </label>

      {!file ? (
        <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-border rounded-lg cursor-pointer hover:border-primary hover:bg-accent/50 transition-colors">
          <Upload className="h-8 w-8 text-muted-foreground mb-2" />
          <span className="text-sm text-muted-foreground">
            Click to upload or drag and drop
          </span>
          <span className="text-xs text-muted-foreground mt-1">
            JPG, PNG, WebP, PDF up to {MAX_SIZE_MB}MB
          </span>
          <input
            ref={inputRef}
            type="file"
            accept={ALLOWED_TYPES.join(',')}
            onChange={handleSelect}
            className="hidden"
          />
        </label>
      ) : (
        <div className="border border-border rounded-lg p-4">
          <div className="flex items-start gap-4">
            {/* Preview */}
            <div className="w-20 h-20 bg-muted rounded-md flex items-center justify-center overflow-hidden flex-shrink-0">
              {preview ? (
                <img src={preview} alt="Receipt" className="w-full h-full object-cover" />
              ) : (
                <FileText className="h-8 w-8 text-muted-foreground" />
              )}
            </div>

            {/* File info */}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground truncate">{file.name}</p>
              <p className="text-sm text-muted-foreground">
                {(file.size / 1024).toFixed(1)} KB
              </p>
              
              {uploaded && (
                <p className="text-sm text-green-500 flex items-center gap-1 mt-1">
                  <Check className="h-4 w-4" />
                  Uploaded
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              {!uploaded && (
                <button
                  type="button"
                  onClick={handleUpload}
                  disabled={uploading}
                  className="px-3 py-1 bg-primary text-primary-foreground rounded-md text-sm hover:bg-primary/90 disabled:opacity-50"
                >
                  {uploading ? 'Uploading...' : 'Upload'}
                </button>
              )}
              <button
                type="button"
                onClick={handleClear}
                className="p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <p className="text-sm text-destructive flex items-center gap-1">
          <AlertCircle className="h-4 w-4" />
          {error}
        </p>
      )}
    </div>
  )
}
