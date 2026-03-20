'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLivemode, useActiveLedgerGroupId } from '@/components/livemode-provider'
import { pickActiveLedger } from '@/lib/active-ledger'
import { callLedgerFunction } from '@/lib/ledger-functions-client'
import type {
  Invoice,
  InvoiceDetail,
  InvoiceLineItem,
  ListInvoicesResponse,
  CreateInvoiceResponse,
  RecordPaymentResponse,
  ApiResponse,
} from '@/lib/api-types'
import {
  Plus,
  RefreshCw,
  FileText,
  Send,
  CreditCard,
  Ban,
  Eye,
  X,
  Trash2,
} from 'lucide-react'
import { useToast } from '@/components/notifications/toast-provider'
import { ConfirmDialog } from '@/components/settings/confirm-dialog'

interface CreateLineItem {
  description: string
  quantity: string
  unit_price: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'draft':
      return <span className="px-2 py-1 text-xs rounded bg-muted text-muted-foreground">Draft</span>
    case 'sent':
      return <span className="px-2 py-1 text-xs rounded bg-blue-500/10 text-blue-700 dark:text-blue-400">Sent</span>
    case 'paid':
      return <span className="px-2 py-1 text-xs rounded bg-green-500/10 text-green-700 dark:text-green-400">Paid</span>
    case 'overdue':
      return <span className="px-2 py-1 text-xs rounded bg-red-500/10 text-red-700 dark:text-red-400">Overdue</span>
    case 'voided':
      return <span className="px-2 py-1 text-xs rounded bg-yellow-500/10 text-yellow-700 dark:text-yellow-400">Voided</span>
    default:
      return <span className="px-2 py-1 text-xs rounded bg-muted text-muted-foreground">{status}</span>
  }
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function InvoicesPage() {
  const livemode = useLivemode()
  const activeLedgerGroupId = useActiveLedgerGroupId()
  const toast = useToast()

  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [ledgerId, setLedgerId] = useState<string | null>(null)

  // Filter
  const [statusFilter, setStatusFilter] = useState<string>('')

  // Create modal
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createForm, setCreateForm] = useState({
    customer_name: '',
    customer_email: '',
    due_date: '',
    notes: '',
  })
  const [lineItems, setLineItems] = useState<CreateLineItem[]>([
    { description: '', quantity: '1', unit_price: '' },
  ])

  // Record-payment modal
  const [paymentInvoice, setPaymentInvoice] = useState<Invoice | null>(null)
  const [recordingPayment, setRecordingPayment] = useState(false)
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    payment_method: '',
    reference_id: '',
    notes: '',
  })

  // View detail modal
  const [viewInvoice, setViewInvoice] = useState<Invoice | null>(null)
  const [viewLoading, setViewLoading] = useState(false)
  const [viewDetail, setViewDetail] = useState<InvoiceDetail | null>(null)

  // Void confirm
  const [voidInvoice, setVoidInvoice] = useState<Invoice | null>(null)

  // Action loading states
  const [sendingId, setSendingId] = useState<string | null>(null)

  // ---------------------------------------------------------------------------
  // Load data
  // ---------------------------------------------------------------------------

  const loadData = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single()

    if (!membership) return

    const { data: ledgers } = await supabase
      .from('ledgers')
      .select('id, ledger_group_id')
      .eq('organization_id', membership.organization_id)
      .eq('status', 'active')
      .eq('livemode', livemode)

    const ledger = pickActiveLedger(ledgers, activeLedgerGroupId)
    if (!ledger) return
    setLedgerId(ledger.id)

    try {
      const query: Record<string, string | number | boolean | null | undefined> = {}
      if (statusFilter) query.status = statusFilter

      const res = await callLedgerFunction('invoices', {
        ledgerId: ledger.id,
        method: 'GET',
        query,
      })

      const result: ListInvoicesResponse = await res.json()
      if (result.success) {
        setInvoices(result.data || [])
      } else {
        toast.error('Failed to load invoices', result.error)
      }
    } catch {
      toast.error('Failed to load invoices')
    } finally {
      setLoading(false)
    }
  }, [activeLedgerGroupId, livemode, statusFilter, toast])

  useEffect(() => {
    void loadData()
  }, [loadData])

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const handleCreate = async () => {
    if (!ledgerId) return

    const validItems = lineItems.filter((li) => li.description.trim() && li.unit_price)
    if (!createForm.customer_name.trim()) {
      toast.error('Customer name is required')
      return
    }
    if (validItems.length === 0) {
      toast.error('At least one line item is required')
      return
    }

    setCreating(true)
    try {
      const res = await callLedgerFunction('invoices', {
        ledgerId,
        method: 'POST',
        body: {
          customer_name: createForm.customer_name.trim(),
          customer_email: createForm.customer_email.trim() || undefined,
          due_date: createForm.due_date || undefined,
          notes: createForm.notes.trim() || undefined,
          line_items: validItems.map((li) => ({
            description: li.description.trim(),
            quantity: parseFloat(li.quantity) || 1,
            unit_price: Math.round(parseFloat(li.unit_price) * 100),
          })),
        },
      })

      const result: CreateInvoiceResponse = await res.json()
      if (result.success && result.data) {
        toast.success('Invoice created', `Invoice ${result.data.invoice_number}`)
        setShowCreateModal(false)
        resetCreateForm()
        loadData()
      } else {
        toast.error('Failed to create invoice', result.error)
      }
    } catch {
      toast.error('Failed to create invoice')
    } finally {
      setCreating(false)
    }
  }

  const handleSend = async (invoice: Invoice) => {
    if (!ledgerId) return
    setSendingId(invoice.id)

    try {
      const res = await callLedgerFunction(`invoices/${invoice.id}/send`, {
        ledgerId,
        method: 'POST',
        body: {},
      })

      const result: ApiResponse = await res.json()
      if (result.success) {
        toast.success('Invoice sent', `${invoice.invoice_number} sent successfully`)
        loadData()
      } else {
        toast.error('Failed to send invoice', result.error)
      }
    } catch {
      toast.error('Failed to send invoice')
    } finally {
      setSendingId(null)
    }
  }

  const handleRecordPayment = async () => {
    if (!ledgerId || !paymentInvoice) return

    const amountDollars = parseFloat(paymentForm.amount)
    if (!amountDollars || amountDollars <= 0) {
      toast.error('Amount must be positive')
      return
    }

    setRecordingPayment(true)
    try {
      const res = await callLedgerFunction(`invoices/${paymentInvoice.id}/record-payment`, {
        ledgerId,
        method: 'POST',
        body: {
          amount: Math.round(amountDollars * 100),
          payment_method: paymentForm.payment_method.trim() || undefined,
          reference_id: paymentForm.reference_id.trim() || undefined,
          notes: paymentForm.notes.trim() || undefined,
        },
      })

      const result: RecordPaymentResponse = await res.json()
      if (result.success) {
        toast.success('Payment recorded', result.message || 'Payment recorded successfully')
        setPaymentInvoice(null)
        resetPaymentForm()
        loadData()
      } else {
        toast.error('Failed to record payment', result.error)
      }
    } catch {
      toast.error('Failed to record payment')
    } finally {
      setRecordingPayment(false)
    }
  }

  const handleVoid = async () => {
    if (!ledgerId || !voidInvoice) return

    try {
      const res = await callLedgerFunction(`invoices/${voidInvoice.id}/void`, {
        ledgerId,
        method: 'POST',
        body: {},
      })

      const result: ApiResponse = await res.json()
      if (result.success) {
        toast.success('Invoice voided', `${voidInvoice.invoice_number} has been voided`)
        setVoidInvoice(null)
        loadData()
      } else {
        toast.error('Failed to void invoice', result.error)
      }
    } catch {
      toast.error('Failed to void invoice')
    }
  }

  const handleView = async (invoice: Invoice) => {
    if (!ledgerId) return
    setViewInvoice(invoice)
    setViewLoading(true)

    try {
      const res = await callLedgerFunction(`invoices/${invoice.id}`, {
        ledgerId,
        method: 'GET',
      })

      const result: ApiResponse<InvoiceDetail> = await res.json()
      if (result.success && result.data) {
        setViewDetail(result.data)
      } else {
        toast.error('Failed to load invoice details', result.error)
        setViewInvoice(null)
      }
    } catch {
      toast.error('Failed to load invoice details')
      setViewInvoice(null)
    } finally {
      setViewLoading(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Form helpers
  // ---------------------------------------------------------------------------

  function resetCreateForm() {
    setCreateForm({ customer_name: '', customer_email: '', due_date: '', notes: '' })
    setLineItems([{ description: '', quantity: '1', unit_price: '' }])
  }

  function resetPaymentForm() {
    setPaymentForm({ amount: '', payment_method: '', reference_id: '', notes: '' })
  }

  function addLineItem() {
    setLineItems([...lineItems, { description: '', quantity: '1', unit_price: '' }])
  }

  function removeLineItem(index: number) {
    if (lineItems.length <= 1) return
    setLineItems(lineItems.filter((_, i) => i !== index))
  }

  function updateLineItem(index: number, field: keyof CreateLineItem, value: string) {
    const updated = [...lineItems]
    updated[index] = { ...updated[index], [field]: value }
    setLineItems(updated)
  }

  function calculateLineTotal(): number {
    return lineItems.reduce((sum, li) => {
      const qty = parseFloat(li.quantity) || 0
      const price = parseFloat(li.unit_price) || 0
      return sum + qty * price
    }, 0)
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-64 bg-muted rounded" />
          <div className="h-4 w-96 bg-muted rounded" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Invoices</h1>
          <p className="text-muted-foreground mt-1">Create and manage invoices for your customers</p>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground"
          >
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="sent">Sent</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
            <option value="voided">Voided</option>
          </select>

          <button
            onClick={() => loadData()}
            className="px-3 py-2 bg-card border border-border rounded-lg hover:bg-muted/50 flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              resetCreateForm()
              setShowCreateModal(true)
            }}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Create Invoice
          </button>
        </div>
      </div>

      {/* Table */}
      {invoices.length === 0 ? (
        <div className="bg-card rounded-lg border border-border p-8 text-center">
          <FileText className="w-12 h-12 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-muted-foreground">No invoices found</p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Click &quot;Create Invoice&quot; to get started
          </p>
        </div>
      ) : (
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Invoice #</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Customer</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Due Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Created</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {invoices.map((inv) => (
                <tr key={inv.id} className={`hover:bg-muted/50 ${inv.status === 'voided' ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-3">
                    <code className="text-sm bg-muted px-2 py-1 rounded">{inv.invoice_number}</code>
                  </td>
                  <td className="px-4 py-3 text-sm">{inv.customer_name}</td>
                  <td className="px-4 py-3 text-sm text-right font-medium">{formatCents(inv.total_amount)}</td>
                  <td className="px-4 py-3">{getStatusBadge(inv.status)}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{formatDate(inv.due_date)}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{formatDate(inv.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleView(inv)}
                        className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
                        title="View"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>

                      {inv.status === 'draft' && (
                        <button
                          onClick={() => handleSend(inv)}
                          disabled={sendingId === inv.id}
                          className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 disabled:text-muted-foreground flex items-center gap-1"
                          title="Send"
                        >
                          <Send className="w-3.5 h-3.5" />
                          {sendingId === inv.id ? '...' : 'Send'}
                        </button>
                      )}

                      {inv.status === 'sent' && (
                        <button
                          onClick={() => {
                            resetPaymentForm()
                            setPaymentForm((f) => ({
                              ...f,
                              amount: (inv.amount_due / 100).toFixed(2),
                            }))
                            setPaymentInvoice(inv)
                          }}
                          className="text-sm text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300 flex items-center gap-1"
                          title="Record Payment"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          Pay
                        </button>
                      )}

                      {(inv.status === 'draft' || inv.status === 'sent') && (
                        <button
                          onClick={() => setVoidInvoice(inv)}
                          className="text-sm text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 flex items-center gap-1"
                          title="Void"
                        >
                          <Ban className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ================================================================== */}
      {/* Create Invoice Modal                                               */}
      {/* ================================================================== */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card rounded-lg border border-border shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">Create Invoice</h2>
              <button onClick={() => setShowCreateModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Customer info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Customer Name *</label>
                  <input
                    type="text"
                    value={createForm.customer_name}
                    onChange={(e) => setCreateForm({ ...createForm, customer_name: e.target.value })}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground"
                    placeholder="Acme Corp"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Customer Email</label>
                  <input
                    type="email"
                    value={createForm.customer_email}
                    onChange={(e) => setCreateForm({ ...createForm, customer_email: e.target.value })}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground"
                    placeholder="billing@acme.com"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Due Date</label>
                  <input
                    type="date"
                    value={createForm.due_date}
                    onChange={(e) => setCreateForm({ ...createForm, due_date: e.target.value })}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-1">Notes</label>
                  <input
                    type="text"
                    value={createForm.notes}
                    onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground"
                    placeholder="Optional notes"
                  />
                </div>
              </div>

              {/* Line items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-foreground">Line Items *</label>
                  <button
                    onClick={addLineItem}
                    className="text-sm text-primary hover:text-primary/80 flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Item
                  </button>
                </div>

                <div className="space-y-2">
                  {lineItems.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => updateLineItem(idx, 'description', e.target.value)}
                        className="flex-1 px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground"
                        placeholder="Description"
                      />
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => updateLineItem(idx, 'quantity', e.target.value)}
                        className="w-20 px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground"
                        placeholder="Qty"
                        min="1"
                        step="1"
                      />
                      <input
                        type="number"
                        value={item.unit_price}
                        onChange={(e) => updateLineItem(idx, 'unit_price', e.target.value)}
                        className="w-28 px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground"
                        placeholder="Price ($)"
                        min="0"
                        step="0.01"
                      />
                      {lineItems.length > 1 && (
                        <button
                          onClick={() => removeLineItem(idx)}
                          className="text-muted-foreground hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div className="mt-2 text-right text-sm font-medium text-foreground">
                  Total: {calculateLineTotal().toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-6 border-t border-border">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 bg-card border border-border rounded-lg hover:bg-muted/50 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 text-sm flex items-center gap-2"
              >
                {creating && <RefreshCw className="w-4 h-4 animate-spin" />}
                {creating ? 'Creating...' : 'Create Invoice'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* Record Payment Modal                                               */}
      {/* ================================================================== */}
      {paymentInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card rounded-lg border border-border shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">Record Payment</h2>
              <button onClick={() => setPaymentInvoice(null)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                <div className="font-medium">{paymentInvoice.invoice_number}</div>
                <div className="text-muted-foreground">{paymentInvoice.customer_name}</div>
                <div className="text-muted-foreground mt-1">
                  Amount due: {formatCents(paymentInvoice.amount_due)}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Amount ($) *</label>
                <input
                  type="number"
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground"
                  placeholder="0.00"
                  min="0.01"
                  step="0.01"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Payment Method</label>
                <input
                  type="text"
                  value={paymentForm.payment_method}
                  onChange={(e) => setPaymentForm({ ...paymentForm, payment_method: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground"
                  placeholder="e.g. bank_transfer, check, card"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Reference ID</label>
                <input
                  type="text"
                  value={paymentForm.reference_id}
                  onChange={(e) => setPaymentForm({ ...paymentForm, reference_id: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground"
                  placeholder="External reference"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Notes</label>
                <input
                  type="text"
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-background text-foreground"
                  placeholder="Optional notes"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 p-6 border-t border-border">
              <button
                onClick={() => setPaymentInvoice(null)}
                className="px-4 py-2 bg-card border border-border rounded-lg hover:bg-muted/50 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleRecordPayment}
                disabled={recordingPayment}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm flex items-center gap-2"
              >
                {recordingPayment && <RefreshCw className="w-4 h-4 animate-spin" />}
                {recordingPayment ? 'Recording...' : 'Record Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* View Invoice Modal                                                 */}
      {/* ================================================================== */}
      {viewInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-card rounded-lg border border-border shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-border">
              <h2 className="text-lg font-semibold text-foreground">
                Invoice {viewInvoice.invoice_number}
              </h2>
              <button onClick={() => { setViewInvoice(null); setViewDetail(null) }} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>

            {viewLoading ? (
              <div className="p-6">
                <div className="animate-pulse space-y-3">
                  <div className="h-4 w-48 bg-muted rounded" />
                  <div className="h-4 w-64 bg-muted rounded" />
                  <div className="h-4 w-32 bg-muted rounded" />
                </div>
              </div>
            ) : viewDetail ? (
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Customer:</span>{' '}
                    <span className="font-medium">{viewDetail.customer_name}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Email:</span>{' '}
                    <span className="font-medium">{viewDetail.customer_email || '-'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Status:</span>{' '}
                    {getStatusBadge(viewDetail.status)}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Due Date:</span>{' '}
                    <span className="font-medium">{formatDate(viewDetail.due_date)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Total:</span>{' '}
                    <span className="font-medium">{formatCents(viewDetail.total_amount)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Amount Due:</span>{' '}
                    <span className="font-medium">{formatCents(viewDetail.amount_due)}</span>
                  </div>
                </div>

                {/* Line items */}
                {viewDetail.line_items && viewDetail.line_items.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-foreground mb-2">Line Items</h3>
                    <div className="bg-muted/50 rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border">
                            <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Description</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Qty</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Unit Price</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Amount</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {viewDetail.line_items.map((li: InvoiceLineItem, i: number) => (
                            <tr key={i}>
                              <td className="px-3 py-2">{li.description}</td>
                              <td className="px-3 py-2 text-right">{li.quantity}</td>
                              <td className="px-3 py-2 text-right">{formatCents(li.unit_price)}</td>
                              <td className="px-3 py-2 text-right font-medium">{formatCents(li.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Notes */}
                {viewDetail.notes && (
                  <div>
                    <h3 className="text-sm font-medium text-foreground mb-1">Notes</h3>
                    <p className="text-sm text-muted-foreground">{viewDetail.notes}</p>
                  </div>
                )}

                {/* Payments */}
                {viewDetail.payments && viewDetail.payments.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-foreground mb-2">Payments</h3>
                    <div className="space-y-2">
                      {viewDetail.payments.map((p) => (
                        <div key={p.id} className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2 text-sm">
                          <div>
                            <span className="font-medium">{formatCents(p.amount)}</span>
                            {p.payment_method && (
                              <span className="text-muted-foreground ml-2">via {p.payment_method}</span>
                            )}
                          </div>
                          <span className="text-muted-foreground">{formatDate(p.payment_date)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* Void Confirm Dialog                                                */}
      {/* ================================================================== */}
      <ConfirmDialog
        isOpen={!!voidInvoice}
        onClose={() => setVoidInvoice(null)}
        onConfirm={handleVoid}
        title="Void Invoice"
        message={`Are you sure you want to void invoice ${voidInvoice?.invoice_number}? This action cannot be undone.`}
        confirmLabel="Void Invoice"
      />
    </div>
  )
}
