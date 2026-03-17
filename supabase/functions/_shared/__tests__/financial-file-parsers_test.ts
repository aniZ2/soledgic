import { assertEquals } from 'https://deno.land/std@0.224.0/testing/asserts.ts'
import {
  detectFileFormat,
  parseOFX,
  parseCAMT053,
  parseBAI2,
  parseMT940,
  parseFinancialFile,
  normalizeMerchant,
} from '../financial-file-parsers.ts'

// ============================================================================
// Format detection
// ============================================================================

Deno.test('detectFileFormat: OFX SGML header', () => {
  assertEquals(detectFileFormat('OFXHEADER:100\nDATA:OFXSGML'), 'ofx')
})

Deno.test('detectFileFormat: OFX XML', () => {
  assertEquals(detectFileFormat('<?xml version="1.0"?><OFX>'), 'ofx')
})

Deno.test('detectFileFormat: CAMT.053', () => {
  assertEquals(detectFileFormat('<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08"><BkToCstmrStmt>'), 'camt053')
})

Deno.test('detectFileFormat: BAI2', () => {
  assertEquals(detectFileFormat('01,SENDER,RECEIVER,260315,1200,1,80,2,2/\n03,ACCT123,USD,'), 'bai2')
})

Deno.test('detectFileFormat: MT940', () => {
  assertEquals(detectFileFormat(':20:STMT260315\n:25:BANKACCT\n:60F:C260315USD1000,00'), 'mt940')
})

Deno.test('detectFileFormat: CSV fallback', () => {
  assertEquals(detectFileFormat('Date,Description,Amount\n2026-03-15,Coffee,5.00'), 'csv')
})

Deno.test('detectFileFormat: unknown', () => {
  assertEquals(detectFileFormat('random binary junk without commas'), 'unknown')
})

// ============================================================================
// OFX Parser
// ============================================================================

const SAMPLE_OFX = `OFXHEADER:100
DATA:OFXSGML
VERSION:102

<OFX>
<SIGNONMSGSRSV1><SONRS><STATUS><CODE>0</STATUS></SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<CURDEF>USD
<BANKACCTFROM>
<BANKID>121000248
<ACCTID>999888777
<ACCTTYPE>CHECKING
</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260315
<TRNAMT>-45.99
<FITID>202603150001
<NAME>GROCERY STORE
<MEMO>Weekly groceries
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260314
<TRNAMT>2500.00
<FITID>202603140001
<NAME>DIRECT DEPOSIT
</STMTTRN>
<STMTTRN>
<TRNTYPE>HOLD
<DTPOSTED>20260313
<TRNAMT>-10.00
<FITID>HOLD001
<NAME>Pending charge
</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>5432.10</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`

Deno.test('parseOFX: parses transactions correctly', () => {
  const result = parseOFX(SAMPLE_OFX)
  assertEquals(result.format, 'ofx')
  assertEquals(result.currency, 'USD')
  assertEquals(result.transactions.length, 2) // hold is skipped
  assertEquals(result.closing_balance, 5432.10)
})

Deno.test('parseOFX: first transaction is debit', () => {
  const result = parseOFX(SAMPLE_OFX)
  const txn = result.transactions[0]
  assertEquals(txn.date, '2026-03-15')
  assertEquals(txn.amount, -45.99)
  assertEquals(txn.description, 'GROCERY STORE - Weekly groceries')
  assertEquals(txn.reference, '202603150001')
  assertEquals(txn.type, 'DEBIT')
})

Deno.test('parseOFX: second transaction is credit', () => {
  const result = parseOFX(SAMPLE_OFX)
  const txn = result.transactions[1]
  assertEquals(txn.date, '2026-03-14')
  assertEquals(txn.amount, 2500.00)
  assertEquals(txn.description, 'DIRECT DEPOSIT')
})

Deno.test('parseOFX: extracts account name from last 4 digits', () => {
  const result = parseOFX(SAMPLE_OFX)
  assertEquals(result.accounts.length, 1)
  assertEquals(result.accounts[0], 'CHECKING 8777')
})

// ============================================================================
// CAMT.053 Parser
// ============================================================================

const SAMPLE_CAMT053 = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08">
  <BkToCstmrStmt>
    <Stmt>
      <Acct><Id><IBAN>DE89370400440532013000</IBAN></Id><Ccy>EUR</Ccy></Acct>
      <Bal><Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp><Amt Ccy="EUR">10000.00</Amt><CdtDbtInd>CRDT</CdtDbtInd></Bal>
      <Bal><Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp><Amt Ccy="EUR">9750.50</Amt><CdtDbtInd>CRDT</CdtDbtInd></Bal>
      <Ntry>
        <Amt Ccy="EUR">249.50</Amt>
        <CdtDbtInd>DBIT</CdtDbtInd>
        <Sts>BOOK</Sts>
        <BookgDt><Dt>2026-03-15</Dt></BookgDt>
        <NtryDtls><TxDtls><Refs><EndToEndId>INV-2026-001</EndToEndId></Refs><RmtInf><Ustrd>Invoice payment INV-2026-001</Ustrd></RmtInf></TxDtls></NtryDtls>
      </Ntry>
      <Ntry>
        <Amt Ccy="EUR">500.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <Sts>BOOK</Sts>
        <BookgDt><Dt>2026-03-14</Dt></BookgDt>
        <NtryDtls><TxDtls><RmtInf><Ustrd>Client payment received</Ustrd></RmtInf></TxDtls></NtryDtls>
      </Ntry>
      <Ntry>
        <Amt Ccy="EUR">100.00</Amt>
        <CdtDbtInd>DBIT</CdtDbtInd>
        <Sts>PDNG</Sts>
        <BookgDt><Dt>2026-03-15</Dt></BookgDt>
        <NtryDtls><TxDtls><RmtInf><Ustrd>Pending transfer</Ustrd></RmtInf></TxDtls></NtryDtls>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>`

Deno.test('parseCAMT053: parses entries correctly', () => {
  const result = parseCAMT053(SAMPLE_CAMT053)
  assertEquals(result.format, 'camt053')
  assertEquals(result.currency, 'EUR')
  assertEquals(result.transactions.length, 2) // pending skipped
  assertEquals(result.opening_balance, 10000.00)
  assertEquals(result.closing_balance, 9750.50)
})

Deno.test('parseCAMT053: debit entry is negative', () => {
  const result = parseCAMT053(SAMPLE_CAMT053)
  const txn = result.transactions[0]
  assertEquals(txn.date, '2026-03-15')
  assertEquals(txn.amount, -249.50)
  assertEquals(txn.description, 'Invoice payment INV-2026-001')
  assertEquals(txn.reference, 'INV-2026-001')
})

Deno.test('parseCAMT053: credit entry is positive', () => {
  const result = parseCAMT053(SAMPLE_CAMT053)
  const txn = result.transactions[1]
  assertEquals(txn.amount, 500.00)
  assertEquals(txn.type, 'CREDIT')
})

Deno.test('parseCAMT053: extracts IBAN', () => {
  const result = parseCAMT053(SAMPLE_CAMT053)
  assertEquals(result.accounts[0], 'DE89370400440532013000')
})

// ============================================================================
// BAI2 Parser
// ============================================================================

const SAMPLE_BAI2 = `01,SENDER,RECEIVER,260315,1200,1,80,2,2/
02,ORIGINATOR,DEST,1,260315,1200,,2/
03,ACCT123,USD,010,100000,,,015,95000,,,/
16,195,5000,,BANKREF001,CUSTREF001,Wire transfer from client/
16,475,2500,,BANKREF002,,ACH payment to vendor/
49,102500,2/
98,102500,1,4/
99,102500,1,6/`

Deno.test('parseBAI2: parses transactions', () => {
  const result = parseBAI2(SAMPLE_BAI2)
  assertEquals(result.format, 'bai2')
  assertEquals(result.transactions.length, 2)
  assertEquals(result.accounts[0], 'ACCT123')
  assertEquals(result.currency, 'USD')
})

Deno.test('parseBAI2: credit transaction (type 195)', () => {
  const result = parseBAI2(SAMPLE_BAI2)
  const txn = result.transactions[0]
  assertEquals(txn.amount, 50.00) // 5000 cents / 100
  assertEquals(txn.description, 'Wire transfer from client')
  assertEquals(txn.reference, 'CUSTREF001')
  assertEquals(txn.type, 'CREDIT')
})

Deno.test('parseBAI2: debit transaction (type 475)', () => {
  const result = parseBAI2(SAMPLE_BAI2)
  const txn = result.transactions[1]
  assertEquals(txn.amount, -25.00)
  assertEquals(txn.description, 'ACH payment to vendor')
  assertEquals(txn.type, 'DEBIT')
})

// ============================================================================
// MT940 Parser
// ============================================================================

const SAMPLE_MT940 = `:20:STMT260315
:25:IBAN12345678
:28C:1/1
:60F:C260314EUR10000,00
:61:260315C500,00NTRFCLIENT001
:86:Payment from Client ABC for Invoice 123
:61:260315D250,50NCHKCHK999
:86:Check payment to supplier
:62F:C260315EUR10249,50
-}`

Deno.test('parseMT940: parses transactions', () => {
  const result = parseMT940(SAMPLE_MT940)
  assertEquals(result.format, 'mt940')
  assertEquals(result.transactions.length, 2)
  assertEquals(result.currency, 'EUR')
  assertEquals(result.opening_balance, 10000.00)
  assertEquals(result.closing_balance, 10249.50)
})

Deno.test('parseMT940: credit transaction', () => {
  const result = parseMT940(SAMPLE_MT940)
  const txn = result.transactions[0]
  assertEquals(txn.date, '2026-03-15')
  assertEquals(txn.amount, 500.00)
  assertEquals(txn.description, 'Payment from Client ABC for Invoice 123')
})

Deno.test('parseMT940: debit transaction', () => {
  const result = parseMT940(SAMPLE_MT940)
  const txn = result.transactions[1]
  assertEquals(txn.amount, -250.50)
  assertEquals(txn.description, 'Check payment to supplier')
})

Deno.test('parseMT940: extracts account name', () => {
  const result = parseMT940(SAMPLE_MT940)
  assertEquals(result.accounts[0], 'IBAN12345678')
})

// ============================================================================
// Universal parser entry point
// ============================================================================

Deno.test('parseFinancialFile: routes OFX correctly', () => {
  const result = parseFinancialFile(SAMPLE_OFX)
  assertEquals(result.format, 'ofx')
  assertEquals(result.transactions.length, 2)
})

Deno.test('parseFinancialFile: routes CAMT.053 correctly', () => {
  const result = parseFinancialFile(SAMPLE_CAMT053)
  assertEquals(result.format, 'camt053')
  assertEquals(result.transactions.length, 2)
})

Deno.test('parseFinancialFile: routes BAI2 correctly', () => {
  const result = parseFinancialFile(SAMPLE_BAI2)
  assertEquals(result.format, 'bai2')
  assertEquals(result.transactions.length, 2)
})

Deno.test('parseFinancialFile: routes MT940 correctly', () => {
  const result = parseFinancialFile(SAMPLE_MT940)
  assertEquals(result.format, 'mt940')
  assertEquals(result.transactions.length, 2)
})

Deno.test('parseFinancialFile: unknown returns empty', () => {
  const result = parseFinancialFile('random garbage without structure')
  assertEquals(result.format, 'unknown')
  assertEquals(result.transactions.length, 0)
})

// ============================================================================
// Merchant normalization
// ============================================================================

Deno.test('normalizeMerchant: strips POS prefix', () => {
  assertEquals(normalizeMerchant('POS GROCERY STORE'), 'GROCERY STORE')
})

Deno.test('normalizeMerchant: resolves Amazon alias', () => {
  assertEquals(normalizeMerchant('AMZN Mktp US*AB1234'), 'AMAZON')
})

Deno.test('normalizeMerchant: resolves Walmart alias', () => {
  assertEquals(normalizeMerchant('WAL-MART #1234'), 'WALMART')
})

Deno.test('normalizeMerchant: resolves Stripe alias', () => {
  assertEquals(normalizeMerchant('STRIPE TRANSFER'), 'STRIPE')
})

Deno.test('normalizeMerchant: strips trailing date', () => {
  assertEquals(normalizeMerchant('COFFEE SHOP 03/15'), 'COFFEE SHOP')
})

Deno.test('normalizeMerchant: handles PayPal prefix', () => {
  assertEquals(normalizeMerchant('PP*MERCHANT NAME'), 'PAYPAL')
})

Deno.test('normalizeMerchant: passes through unknown merchants', () => {
  assertEquals(normalizeMerchant('LOCAL BAKERY'), 'LOCAL BAKERY')
})
