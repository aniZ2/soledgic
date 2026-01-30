'use client'

import { useState } from 'react'
import s from './landing.module.css'

const tabs = ['charge', 'split', 'payout'] as const
type Tab = (typeof tabs)[number]

const code: Record<Tab, React.ReactNode> = {
  charge: (
    <pre className={s.codeBody}>
      <span className={s.keyword}>const</span> charge = <span className={s.keyword}>await</span>{' '}
      <span className={s.function}>soledgic.charges.create</span>({'{\n'}
      {'  '}<span className={s.property}>amount</span>: <span className={s.number}>9900</span>,{'\n'}
      {'  '}<span className={s.property}>currency</span>: <span className={s.string}>&quot;usd&quot;</span>,{'\n'}
      {'  '}<span className={s.property}>customer</span>: <span className={s.string}>&quot;cus_4f8a2b&quot;</span>,{'\n'}
      {'  '}<span className={s.property}>splits</span>: [{'\n'}
      {'    '}{'{ '}<span className={s.property}>account</span>: <span className={s.string}>&quot;acct_seller_01&quot;</span>, <span className={s.property}>amount</span>: <span className={s.number}>8415</span>{' },'}{'\n'}
      {'    '}{'{ '}<span className={s.property}>account</span>: <span className={s.string}>&quot;acct_referrer&quot;</span>, <span className={s.property}>amount</span>: <span className={s.number}>495</span>{' },'}{'\n'}
      {'    '}{'{ '}<span className={s.property}>account</span>: <span className={s.string}>&quot;acct_platform&quot;</span>, <span className={s.property}>amount</span>: <span className={s.number}>990</span>{' },'}{'\n'}
      {'  '}],{'\n'}
      {'  '}<span className={s.property}>hold</span>: {'{ '}<span className={s.property}>days</span>: <span className={s.number}>7</span>, <span className={s.property}>release</span>: <span className={s.string}>&quot;auto&quot;</span>{' },'}{'\n'}
      {'}'});{'\n'}
      <span className={s.comment}>{'// Payment accepted. Revenue split. Ledger updated.'}</span>
    </pre>
  ),
  split: (
    <pre className={s.codeBody}>
      <span className={s.comment}>{'// Define revenue splits at charge time or after'}</span>{'\n'}
      <span className={s.keyword}>await</span>{' '}
      <span className={s.function}>soledgic.splits.create</span>({'{\n'}
      {'  '}<span className={s.property}>charge</span>: <span className={s.string}>&quot;ch_9x82mf&quot;</span>,{'\n'}
      {'  '}<span className={s.property}>rules</span>: [{'\n'}
      {'    '}{'{ '}<span className={s.property}>account</span>: <span className={s.string}>&quot;acct_seller_01&quot;</span>, <span className={s.property}>percent</span>: <span className={s.number}>85</span>{' },'}{'\n'}
      {'    '}{'{ '}<span className={s.property}>account</span>: <span className={s.string}>&quot;acct_referrer&quot;</span>,{'  '}<span className={s.property}>percent</span>: <span className={s.number}>5</span>{' },'}{'\n'}
      {'    '}{'{ '}<span className={s.property}>account</span>: <span className={s.string}>&quot;acct_platform&quot;</span>,{'  '}<span className={s.property}>percent</span>: <span className={s.number}>10</span>{' },'}{'\n'}
      {'  '}],{'\n'}
      {'}'});{'\n'}
      <span className={s.comment}>{'// Every split is double-entry recorded.'}</span>
    </pre>
  ),
  payout: (
    <pre className={s.codeBody}>
      <span className={s.comment}>{'// Pay out on schedule or on-demand'}</span>{'\n'}
      <span className={s.keyword}>const</span> payout = <span className={s.keyword}>await</span>{' '}
      <span className={s.function}>soledgic.payouts.create</span>({'{\n'}
      {'  '}<span className={s.property}>account</span>: <span className={s.string}>&quot;acct_seller_01&quot;</span>,{'\n'}
      {'  '}<span className={s.property}>amount</span>: <span className={s.number}>84150</span>,{'\n'}
      {'  '}<span className={s.property}>method</span>: <span className={s.string}>&quot;bank_transfer&quot;</span>,{'\n'}
      {'  '}<span className={s.property}>metadata</span>: {'{\n'}
      {'    '}<span className={s.property}>period</span>: <span className={s.string}>&quot;2026-01-20..2026-01-26&quot;</span>,{'\n'}
      {'  '}{'}\n'}
      {'}'});{'\n'}
      <span className={s.comment}>{'// Payout sent. Ledger balanced. Tax-ready.'}</span>
    </pre>
  ),
}

export function CodeTabs() {
  const [active, setActive] = useState<Tab>('charge')

  return (
    <div className={s.heroCode}>
      <div className={s.codeHeader}>
        <div className={s.codeDots}>
          <span className={s.codeDot} />
          <span className={s.codeDot} />
          <span className={s.codeDot} />
        </div>
        <div className={s.codeTabs}>
          {tabs.map((tab) => (
            <button
              key={tab}
              className={`${s.codeTab} ${active === tab ? s.codeTabActive : ''}`}
              onClick={() => setActive(tab)}
            >
              {tab}.ts
            </button>
          ))}
        </div>
      </div>
      {tabs.map((tab) => (
        <div
          key={tab}
          className={`${s.codePanel} ${active === tab ? s.codePanelActive : ''}`}
        >
          {code[tab]}
        </div>
      ))}
    </div>
  )
}
