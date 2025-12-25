'use client'

import React, { ReactNode, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowDownLeft, ArrowUpRight, Users, FileText, Settings, Receipt, Landmark, Command, Search, Shield, LayoutDashboard, X, Upload, Loader2, Link2 } from 'lucide-react'
import { useLedger } from '@/components/ledger-context'
import { CommandPalette, useCommandPalette } from '@/components/command-palette'

function ReceiptUploadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setSuccess(false)
    if (f.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = (e) => setPreview(e.target?.result as string)
      reader.readAsDataURL(f)
    } else {
      setPreview(null)
    }
  }

  const handleUpload = async () => {
    if (!file) return
    setUploading(true)
    // Simulate upload
    await new Promise(r => setTimeout(r, 1500))
    setUploading(false)
    setSuccess(true)
    setTimeout(() => {
      setFile(null)
      setPreview(null)
      setSuccess(false)
      onClose()
    }, 1500)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="font-semibold text-lg">Upload Receipt</h2>
          <button onClick={onClose} className="p-1 hover:bg-stone-100 rounded"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5">
          {!file ? (
            <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-stone-300 rounded-xl cursor-pointer hover:border-stone-400 hover:bg-stone-50 transition-colors">
              <Upload className="w-10 h-10 text-stone-400 mb-3" />
              <span className="text-[14px] text-stone-600 font-medium">Click to upload receipt</span>
              <span className="text-[12px] text-stone-400 mt-1">JPG, PNG, PDF up to 5MB</span>
              <input type="file" accept="image/*,application/pdf" onChange={handleFileChange} className="hidden" />
            </label>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 bg-stone-50 rounded-lg">
                {preview ? (
                  <img src={preview} alt="Receipt" className="w-16 h-16 object-cover rounded-lg" />
                ) : (
                  <div className="w-16 h-16 bg-stone-200 rounded-lg flex items-center justify-center">
                    <FileText className="w-8 h-8 text-stone-400" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-medium truncate">{file.name}</p>
                  <p className="text-[12px] text-stone-500">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
                {success && <span className="text-emerald-600 text-[13px] font-medium">✓ Uploaded</span>}
              </div>
              <div className="flex gap-3">
                <button onClick={() => { setFile(null); setPreview(null) }} className="flex-1 px-4 py-2 border rounded-lg text-[14px] font-medium hover:bg-stone-50">
                  Clear
                </button>
                <button onClick={handleUpload} disabled={uploading || success} className="flex-1 px-4 py-2 bg-stone-900 text-white rounded-lg text-[14px] font-medium hover:bg-stone-800 disabled:opacity-50 flex items-center justify-center gap-2">
                  {uploading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {success ? 'Done!' : uploading ? 'Uploading...' : 'Upload'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const { mode, businessName, labels } = useLedger()
  const commandPalette = useCommandPalette()
  const [receiptModalOpen, setReceiptModalOpen] = useState(false)

  const navigation = [
    { name: 'Overview', href: '/dashboard', icon: LayoutDashboard },
    { name: labels.inflowTab, href: '/dashboard/inflow', icon: ArrowDownLeft },
    { name: labels.outflowTab, href: '/dashboard/outflow', icon: ArrowUpRight },
    { name: labels.directoryTab, href: '/dashboard/directory', icon: Users },
    { name: 'Reconciliation', href: '/dashboard/reconciliation', icon: Link2 },
    { name: 'Reports', href: '/dashboard/reports', icon: FileText },
    { name: 'Audit', href: '/dashboard/audit', icon: Shield },
  ]

  const isActive = (href: string) => href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href)

  return (
    <div className="min-h-screen bg-[#FAFAF9]">
      <CommandPalette isOpen={commandPalette.isOpen} onClose={commandPalette.close} />
      <ReceiptUploadModal open={receiptModalOpen} onClose={() => setReceiptModalOpen(false)} />

      <header className="fixed top-0 left-0 right-0 h-14 bg-white border-b z-50">
        <div className="h-full px-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="w-7 h-7 bg-[#1C1917] rounded-md flex items-center justify-center">
                <Landmark className="w-4 h-4 text-white" strokeWidth={2.5} />
              </div>
              <span className="font-semibold text-[15px]">Soledgic</span>
            </Link>
            <div className="w-px h-5 bg-stone-200" />
            <span className="text-[13px] text-stone-600">{businessName}</span>
            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${mode === 'marketplace' ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'}`}>
              {mode === 'marketplace' ? 'Platform' : 'Business'}
            </span>
          </div>

          <button onClick={commandPalette.open} className="flex items-center gap-2 px-3 py-1.5 bg-stone-100 hover:bg-stone-200 rounded-lg text-[13px] text-stone-500">
            <Search className="w-4 h-4" />
            <span className="hidden sm:inline">Search...</span>
            <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-white rounded border text-[11px]"><Command className="w-3 h-3" />K</kbd>
          </button>

          <Link href="/dashboard/settings" className="p-2 text-stone-500 hover:text-stone-900"><Settings className="w-5 h-5" /></Link>
        </div>
      </header>

      <aside className="fixed top-14 left-0 bottom-0 w-56 bg-white border-r">
        <nav className="p-3 space-y-1">
          {navigation.map((item) => {
            const Icon = item.icon
            const active = isActive(item.href)
            return (
              <Link key={item.name} href={item.href} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] ${active ? 'bg-stone-100 text-[#1C1917] font-medium' : 'text-stone-600 hover:bg-stone-50'}`}>
                <Icon className={`w-4 h-4 ${active ? 'text-[#1C1917]' : 'text-stone-400'}`} />
                {item.name}
              </Link>
            )
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-3 border-t">
          <button onClick={() => setReceiptModalOpen(true)} className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-stone-600 hover:bg-stone-50 rounded-lg">
            <Receipt className="w-4 h-4 text-stone-400" />Upload Receipt
          </button>
          <button onClick={commandPalette.open} className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-stone-600 hover:bg-stone-50 rounded-lg">
            <ArrowDownLeft className="w-4 h-4 text-stone-400" />{labels.recordInflowAction}
          </button>
        </div>
      </aside>

      <main className="pt-14 pl-56"><div className="p-6">{children}</div></main>
    </div>
  )
}
