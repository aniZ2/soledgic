'use client'

import React, { useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { LedgerProvider } from '@/components/ledger-context'
import { Save, Building2, CreditCard, Bell, Shield, Users, Percent } from 'lucide-react'

function SettingsContent() {
  const [activeTab, setActiveTab] = useState('general')
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState({
    businessName: 'Booklyverse',
    mode: 'marketplace',
    defaultSplit: 80,
    refundBufferDays: 14,
    taxReservePercent: 10,
    autoPromote: true,
    emailNotifications: true,
    payoutNotifications: true,
  })

  const handleSave = async () => {
    setSaving(true)
    // Simulate save
    await new Promise(r => setTimeout(r, 1000))
    setSaving(false)
    alert('Settings saved!')
  }

  const tabs = [
    { id: 'general', label: 'General', icon: Building2 },
    { id: 'splits', label: 'Splits & Tiers', icon: Percent },
    { id: 'withholding', label: 'Withholding', icon: Shield },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'billing', label: 'Billing', icon: CreditCard },
    { id: 'team', label: 'Team', icon: Users },
  ]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[#1C1917]">Settings</h1>
          <p className="text-[14px] text-stone-500 mt-1">Manage your ledger configuration</p>
        </div>
        <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-[#1C1917] text-white rounded-lg text-[13px] font-medium hover:bg-[#292524] disabled:opacity-50">
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      <div className="flex gap-6">
        {/* Tabs */}
        <div className="w-48 space-y-1">
          {tabs.map(tab => {
            const Icon = tab.icon
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] text-left ${activeTab === tab.id ? 'bg-stone-100 text-[#1C1917] font-medium' : 'text-stone-600 hover:bg-stone-50'}`}>
                <Icon className="w-4 h-4" />{tab.label}
              </button>
            )
          })}
        </div>

        {/* Content */}
        <div className="flex-1 bg-white rounded-xl border p-6">
          {activeTab === 'general' && (
            <div className="space-y-6">
              <h2 className="font-semibold text-lg">General Settings</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-[13px] font-medium text-stone-700 mb-1">Business Name</label>
                  <input type="text" value={settings.businessName} onChange={e => setSettings(s => ({ ...s, businessName: e.target.value }))}
                    className="w-full max-w-md px-3 py-2 border rounded-lg text-[14px]" />
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-stone-700 mb-1">Ledger Mode</label>
                  <select value={settings.mode} onChange={e => setSettings(s => ({ ...s, mode: e.target.value }))}
                    className="w-full max-w-md px-3 py-2 border rounded-lg text-[14px]">
                    <option value="marketplace">Marketplace (Revenue Splits)</option>
                    <option value="standard">Standard (Business Accounting)</option>
                  </select>
                  <p className="text-[12px] text-stone-500 mt-1">Determines how transactions are categorized</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'splits' && (
            <div className="space-y-6">
              <h2 className="font-semibold text-lg">Splits & Tiers</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-[13px] font-medium text-stone-700 mb-1">Default Creator Split</label>
                  <div className="flex items-center gap-2">
                    <input type="number" value={settings.defaultSplit} onChange={e => setSettings(s => ({ ...s, defaultSplit: parseInt(e.target.value) }))}
                      className="w-24 px-3 py-2 border rounded-lg text-[14px]" min="0" max="100" />
                    <span className="text-[14px] text-stone-500">% to creator</span>
                  </div>
                  <p className="text-[12px] text-stone-500 mt-1">Platform receives {100 - settings.defaultSplit}%</p>
                </div>
                <div className="pt-4 border-t">
                  <h3 className="font-medium mb-3">Tier Configuration</h3>
                  <div className="space-y-2 text-[13px]">
                    <div className="flex justify-between p-3 bg-stone-50 rounded-lg">
                      <span>Starter</span><span>80% (default)</span>
                    </div>
                    <div className="flex justify-between p-3 bg-stone-50 rounded-lg">
                      <span>Bronze ($1,000+ earnings)</span><span>82%</span>
                    </div>
                    <div className="flex justify-between p-3 bg-stone-50 rounded-lg">
                      <span>Silver ($5,000+ earnings)</span><span>85%</span>
                    </div>
                    <div className="flex justify-between p-3 bg-stone-50 rounded-lg">
                      <span>Gold ($25,000+ earnings)</span><span>88%</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-4">
                  <div>
                    <div className="text-[13px] font-medium">Auto-Promote Creators</div>
                    <div className="text-[12px] text-stone-500">Automatically upgrade tiers based on earnings</div>
                  </div>
                  <button onClick={() => setSettings(s => ({ ...s, autoPromote: !s.autoPromote }))}
                    className={`w-11 h-6 rounded-full transition-colors ${settings.autoPromote ? 'bg-emerald-500' : 'bg-stone-300'}`}>
                    <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${settings.autoPromote ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'withholding' && (
            <div className="space-y-6">
              <h2 className="font-semibold text-lg">Withholding Rules</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-[13px] font-medium text-stone-700 mb-1">Refund Buffer Period</label>
                  <div className="flex items-center gap-2">
                    <input type="number" value={settings.refundBufferDays} onChange={e => setSettings(s => ({ ...s, refundBufferDays: parseInt(e.target.value) }))}
                      className="w-24 px-3 py-2 border rounded-lg text-[14px]" min="0" max="90" />
                    <span className="text-[14px] text-stone-500">days</span>
                  </div>
                  <p className="text-[12px] text-stone-500 mt-1">Hold funds for potential refunds</p>
                </div>
                <div>
                  <label className="block text-[13px] font-medium text-stone-700 mb-1">Tax Reserve</label>
                  <div className="flex items-center gap-2">
                    <input type="number" value={settings.taxReservePercent} onChange={e => setSettings(s => ({ ...s, taxReservePercent: parseInt(e.target.value) }))}
                      className="w-24 px-3 py-2 border rounded-lg text-[14px]" min="0" max="50" />
                    <span className="text-[14px] text-stone-500">% of earnings</span>
                  </div>
                  <p className="text-[12px] text-stone-500 mt-1">Withhold for tax obligations (optional)</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <h2 className="font-semibold text-lg">Notifications</h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between py-3 border-b">
                  <div>
                    <div className="text-[13px] font-medium">Email Notifications</div>
                    <div className="text-[12px] text-stone-500">Receive daily summary emails</div>
                  </div>
                  <button onClick={() => setSettings(s => ({ ...s, emailNotifications: !s.emailNotifications }))}
                    className={`w-11 h-6 rounded-full transition-colors ${settings.emailNotifications ? 'bg-emerald-500' : 'bg-stone-300'}`}>
                    <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${settings.emailNotifications ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
                <div className="flex items-center justify-between py-3">
                  <div>
                    <div className="text-[13px] font-medium">Payout Alerts</div>
                    <div className="text-[12px] text-stone-500">Get notified when payouts are processed</div>
                  </div>
                  <button onClick={() => setSettings(s => ({ ...s, payoutNotifications: !s.payoutNotifications }))}
                    className={`w-11 h-6 rounded-full transition-colors ${settings.payoutNotifications ? 'bg-emerald-500' : 'bg-stone-300'}`}>
                    <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${settings.payoutNotifications ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'billing' && (
            <div className="space-y-6">
              <h2 className="font-semibold text-lg">Billing</h2>
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                <div className="text-[14px] font-medium text-emerald-800">Pro Plan</div>
                <div className="text-[12px] text-emerald-700 mt-1">$49/month • Unlimited transactions</div>
              </div>
              <div className="text-[13px] text-stone-600">
                <p>Next billing date: January 1, 2025</p>
                <button className="text-violet-600 font-medium mt-2 hover:underline">Manage subscription →</button>
              </div>
            </div>
          )}

          {activeTab === 'team' && (
            <div className="space-y-6">
              <h2 className="font-semibold text-lg">Team Members</h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-stone-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-violet-200 flex items-center justify-center text-[12px] font-medium">AO</div>
                    <div>
                      <div className="text-[13px] font-medium">Ani Osifo</div>
                      <div className="text-[12px] text-stone-500">Owner</div>
                    </div>
                  </div>
                  <span className="text-[12px] text-stone-500">Full access</span>
                </div>
              </div>
              <button className="text-[13px] text-violet-600 font-medium hover:underline">+ Invite team member</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <LedgerProvider mode="marketplace" ledgerId="0a885204-e07a-48c1-97e9-495ac96a2581" businessName="Booklyverse">
      <DashboardLayout>
        <SettingsContent />
      </DashboardLayout>
    </LedgerProvider>
  )
}
