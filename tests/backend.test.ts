import { before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createPublicClient, createWalletClient, http, type Hex } from 'viem'
import { anvil } from 'viem/chains'
import { easAbi, requestFor, zeroHash, type Manifest } from '../shared/ledger.ts'
import { putFile, putMetadata } from '../server/db.ts'
import type { Operation } from '../src/api.ts'
import type { DemoState } from '../src/data.ts'

const base = `${process.env.IZ_API_URL}/api`, rpc = process.env.IZ_RPC_URL!
const chain = createPublicClient({ chain: anvil, transport: http(rpc) })
let m: Manifest, orgCookie = '', reviewerCookie = ''
const client = (role: 'organization' | 'reviewer' | 'platform') => createWalletClient({ account: m.accounts[role], chain: anvil, transport: http(rpc) })
async function request(path: string, body?: unknown, cookie = '', key: string = randomUUID()) {
  return fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie, 'Idempotency-Key': key }, body: body === undefined ? undefined : JSON.stringify(body) })
}
async function ok<T>(path: string, body?: unknown, cookie = '', key?: string): Promise<T> {
  const response = await request(path, body, cookie, key)
  const data = await response.json()
  assert.equal(response.status, 200, JSON.stringify(data)); return data as T
}
async function login(role: 'organization' | 'reviewer') {
  const challenge = await ok<{ nonce: string; message: string }>('/auth/challenge', { address: m.accounts[role] })
  const signature = await client(role).signMessage({ message: challenge.message })
  const response = await request('/auth/verify', { nonce: challenge.nonce, signature })
  assert.equal(response.status, 200)
  return { cookie: response.headers.get('set-cookie')!.split(';')[0], challenge, signature }
}
async function send(op: Operation, role: 'organization' | 'reviewer') {
  const hash = await client(role).sendTransaction({ to: op.transaction.to, data: op.transaction.data, value: 0n })
  await chain.waitForTransactionReceipt({ hash })
  const result = await ok<Operation>(`/operations/${op.id}/transaction`, { hash }, role === 'organization' ? orgCookie : reviewerCookie)
  assert.equal(result.status, 'confirmed', result.error ?? ''); return result
}
async function state() { return ok<DemoState>('/state') }
before(async () => { m = await ok<Manifest>('/network'); orgCookie = (await login('organization')).cookie; reviewerCookie = (await login('reviewer')).cookie })

test('seed records are real EAS attestations with the expected actors', async () => {
  const s = await state()
  assert.equal(s.totals?.gross, 125000); assert.equal(s.invalidRecords, 0)
  const version = s.expenses[0].evidence.purchase[0]
  const a = await chain.readContract({ address: m.eas, abi: easAbi, functionName: 'getAttestation', args: [version.reviewAnchor!.uid!] })
  assert.equal(a.refUID, version.anchor!.uid)
  assert.equal(a.attester.toLowerCase(), m.accounts.reviewer.toLowerCase())
})
test('wallet login prevents signature spoofing, nonce reuse and foreign origins', async () => {
  const { challenge, signature } = await login('reviewer')
  assert.equal((await request('/auth/verify', { nonce: challenge.nonce, signature })).status, 401)
  const next = await ok<{ nonce: string; message: string }>('/auth/challenge', { address: m.accounts.organization })
  const wrong = await client('reviewer').signMessage({ message: next.message })
  assert.equal((await request('/auth/verify', { nonce: next.nonce, signature: wrong })).status, 401)
  assert.equal((await fetch(base + '/state', { headers: { Origin: 'https://unrelated.example' } })).status, 403)
})
test('donations use integer amounts and idempotency without duplicate ledger entries', async () => {
  const key = randomUUID(), first = await ok<Operation>('/donations', { amount: 123.45 }, '', key)
  const second = await ok<Operation>('/donations', { amount: 123.45 }, '', key)
  assert.equal(first.id, second.id); assert.equal(first.code, second.code)
  assert.equal((await request('/donations', { amount: 124 }, '', key)).status, 409)
  assert.equal((await request('/donations', { amount: 1.001 })).status, 400)
  let result = first
  for (let i = 0; i < 20 && result.status !== 'confirmed'; i++) { result = await ok<Operation>(`/operations/${first.id}`); await new Promise(r => setTimeout(r, 50)) }
  assert.equal(result.status, 'confirmed')
  const lookup = await ok<{ donation: { fee: number; amount: number } }>('/donations/lookup', { code: first.code })
  assert.equal(lookup.donation.amount, 123.45); assert.equal(lookup.donation.fee, 2.47)
  assert.equal((await state()).totals?.gross, 125123.45)
})
test('API rejects unauthenticated and wrong-role writes', async () => {
  assert.equal((await request('/expenses', {})).status, 401)
  assert.equal((await request('/expenses', {}, reviewerCookie)).status, 403)
  assert.equal((await request(`/evidence/${'0x' + '1'.repeat(64)}/reviews`, {}, orgCookie)).status, 403)
})

function purchaseBody(invoice = 'Örnek fatura: 300 TL', shared = false) {
  return { kind: 'purchase', shared, files: [
    { kind: 'invoice', name: 'fatura.txt', mime: 'text/plain', content: Buffer.from(invoice).toString('base64') },
    { kind: 'payment', name: 'odeme.txt', mime: 'text/plain', content: Buffer.from('Örnek ödeme: 300 TL').toString('base64') },
  ] }
}
let expenseId: string, evidenceUID: Hex, evidenceDigest: string
const reviewKey = randomUUID(), reviewBody = { decision: 'requested', reason: 'Ek fatura bilgisi gerekiyor.' }
test('institution creates an expense and a private file through real wallet transactions', async () => {
  const expense = await ok<Operation>('/expenses', { title: 'API test alımı', recipient: 'Örnek alıcı', amount: 300, category: 'Gıda', description: 'Sunucu ve zincir entegrasyon kaydı.', date: '2026-09-26' }, orgCookie)
  expenseId = (await send(expense, 'organization')).recordId
  const body = purchaseBody()
  assert.equal((await request(`/expenses/${expenseId}/evidence`, { ...body, files: [body.files[0]] }, orgCookie)).status, 400)
  assert.equal((await request(`/expenses/${expenseId}/evidence`, { ...body.files[0], shared: false }, orgCookie)).status, 400)
  const evidence = await ok<Operation>(`/expenses/${expenseId}/evidence`, body, orgCookie)
  evidenceUID = (await send(evidence, 'organization')).uid!
  const s = await state(); evidenceDigest = s.expenses.find(e => e.id === expenseId)!.evidence.purchase[0].digest
  assert.equal((await request(`/evidence/${evidenceUID}/file`)).status, 403)
  assert.equal((await request(`/evidence/${evidenceUID}/file`, undefined, reviewerCookie)).status, 200)
  for (const kind of ['invoice', 'payment']) {
    assert.equal((await request(`/evidence/${evidenceUID}/files/${kind}`)).status, 403)
    assert.equal((await request(`/evidence/${evidenceUID}/files/${kind}`, undefined, reviewerCookie)).status, 200)
  }
  assert.equal((await request(`/expenses/${expenseId}/evidence`, { ...body, files: [{ ...body.files[0], mime: 'application/pdf' }, body.files[1]] }, orgCookie)).status, 400)
})
test('server detects modified document bytes and does not serve a corrupted file', async () => {
  const path = join(process.env.IZ_DATA_DIR!, 'files', evidenceDigest.slice(2)), original = readFileSync(path)
  try {
    writeFileSync(path, 'değiştirilmiş içerik')
    assert.equal((await request(`/evidence/${evidenceUID}/file`, undefined, orgCookie)).status, 409)
    assert.equal((await ok<{ contentMatches: boolean }>(`/records/${evidenceUID}/verify`)).contentMatches, false)
  } finally { writeFileSync(path, original) }
  const version = (await state()).expenses.find(e => e.id === expenseId)!.evidence.purchase[0]
  for (const file of version.files!) {
    const leafPath = join(process.env.IZ_DATA_DIR!, 'files', file.digest.slice(2)), leafBytes = readFileSync(leafPath)
    try {
      writeFileSync(leafPath, 'değiştirilmiş paket belgesi')
      assert.equal((await request(`/evidence/${evidenceUID}/files/${file.kind}`, undefined, orgCookie)).status, 409)
      assert.equal((await ok<{ contentMatches: boolean }>(`/records/${evidenceUID}/verify`)).contentMatches, false)
    } finally { writeFileSync(leafPath, leafBytes) }
  }
  assert.equal((await ok<{ contentMatches: boolean }>(`/records/${evidenceUID}/verify`)).contentMatches, true)
})
test('ready resolver rejects institution signing a reviewer attestation on chain', async () => {
  const op = await ok<Operation>(`/evidence/${evidenceUID}/reviews`, reviewBody, reviewerCookie, reviewKey)
  const deniedHash = await client('organization').sendTransaction({ to: op.transaction.to, data: op.transaction.data, value: 0n })
  assert.equal((await chain.waitForTransactionReceipt({ hash: deniedHash })).status, 'reverted')
  const reviewed = await send(op, 'reviewer')
  const a = await chain.readContract({ address: m.eas, abi: easAbi, functionName: 'getAttestation', args: [reviewed.uid!] })
  assert.equal(a.refUID, evidenceUID)
  assert.equal((await state()).expenses.find(e => e.id === expenseId)!.evidence.delivery.length, 0)
  const retried = await ok<Operation>(`/evidence/${evidenceUID}/reviews`, reviewBody, reviewerCookie, reviewKey)
  assert.equal(retried.id, reviewed.id); assert.equal(retried.status, 'confirmed')
  assert.equal((await request(`/evidence/${evidenceUID}/reviews`, { ...reviewBody, decision: 'approved' }, reviewerCookie, reviewKey)).status, 409)
})
test('new evidence preserves old decision and cannot inherit its approval', async () => {
  const op = await ok<Operation>(`/expenses/${expenseId}/evidence`, purchaseBody('Düzeltilmiş örnek fatura: 300 TL', true), orgCookie)
  const v2 = await send(op, 'organization')
  const versions = (await state()).expenses.find(e => e.id === expenseId)!.evidence.purchase
  assert.equal(versions.length, 2); assert.equal(versions[0].status, 'requested'); assert.equal(versions[1].status, 'pending')
  assert.equal((await request(`/evidence/${v2.uid}/reviews`, reviewBody, reviewerCookie, reviewKey)).status, 409)
  assert.equal((await request(`/evidence/${evidenceUID}/reviews`, { decision: 'approved', reason: 'Eski sürüm.' }, reviewerCookie)).status, 409)
  const review = await ok<Operation>(`/evidence/${v2.uid}/reviews`, { decision: 'rejected', reason: 'Tutar belgede doğrulanamıyor.' }, reviewerCookie)
  await send(review, 'reviewer')
  assert.equal((await state()).totals?.spent, 87800)
  assert.equal((await request(`/evidence/${v2.uid}/file`)).status, 200)
})
test('duplicate external EAS records do not inflate balances', async () => {
  const before = (await state()).totals
  const hash = await client('platform').writeContract({ address: m.eas, abi: easAbi, functionName: 'attest', args: [requestFor(m, 'donation', { recordId: 'demo-donation-1001', gross: 100000n, fee: 2000n, net: 98000n, currency: 'TRY-DEMO', occurredAt: 1790161200n }, m.fundUID)] })
  await chain.waitForTransactionReceipt({ hash })
  const after = await state()
  assert.deepEqual(after.totals, before); assert.equal(after.invalidRecords, 1)
})

test('a mined transaction is recovered when the browser never reports its hash', async () => {
  const body = { title: 'Bildirimi kaybolan harcama', recipient: 'Örnek alıcı', amount: 50, category: 'Gıda', description: 'İşlem gönderildi ancak API bildirimi ulaşmadı.', date: '2026-09-26' }
  const before = await state(), key = randomUUID()
  const op = await ok<Operation>('/expenses', body, orgCookie, key)
  const unsigned = await ok<Operation>('/expenses', { ...body, title: 'Henüz imzalanmayan harcama' }, orgCookie)
  const hash = await client('organization').sendTransaction({ to: op.transaction.to, data: op.transaction.data, value: 0n })
  await chain.waitForTransactionReceipt({ hash })
  const recovered = await ok<Operation>(`/operations/${op.id}`, undefined, orgCookie)
  assert.equal(recovered.status, 'confirmed'); assert.equal(recovered.hash, hash); assert.ok(recovered.uid)
  assert.equal((await ok<Operation>(`/operations/${unsigned.id}`, undefined, orgCookie)).status, 'awaiting_signature')
  assert.equal((await ok<Operation>('/expenses', body, orgCookie, key)).id, op.id)
  assert.equal((await ok<Operation>(`/operations/${op.id}/transaction`, { hash }, orgCookie)).uid, recovered.uid)
  const after = await state()
  assert.equal(after.expenses.length, before.expenses.length + 1)
  assert.equal(after.totals!.spent, before.totals!.spent + 50)
  assert.equal((await ok<{ contentMatches: boolean }>(`/records/${recovered.uid}/verify`)).contentMatches, true)
})

test('legacy payment and invoice approvals remain historical and do not become a purchase approval', async () => {
  const expense = (await state()).expenses.find(e => e.title === 'Bildirimi kaybolan harcama')!
  for (const [index, kind] of ['payment', 'invoice'].entries()) {
    const hash = await client('organization').writeContract({ address: m.eas, abi: easAbi, functionName: 'attest', args: [requestFor(m, 'evidence', {
      recordId: `legacy-${kind}`, kind: index, previousVersionUID: zeroHash, shared: true,
      fileHash: putFile(Buffer.from(`Eski ${kind} belgesi`), 'text/plain'),
      metadataHash: putMetadata({ name: `eski-${kind}.txt`, mime: 'text/plain', createdAt: '2026-09-26T10:00:00Z' }),
    }, expense.anchor!.uid!)] })
    await chain.waitForTransactionReceipt({ hash })
    const target = (await state()).expenses.find(e => e.id === expense.id)!.evidence[kind as 'payment' | 'invoice'][0]
    assert.equal((await request(`/evidence/${target.anchor!.uid}/reviews`, { decision: 'approved', reason: 'Eski ayrı karar.' }, reviewerCookie)).status, 409)
    const reviewHash = await client('reviewer').writeContract({ address: m.eas, abi: easAbi, functionName: 'attest', args: [requestFor(m, 'review', { recordId: `legacy-${kind}-review`, decision: 0, reasonHash: putMetadata({ reason: 'Önceki ayrı belge onayı.' }) }, target.anchor!.uid!)] })
    await chain.waitForTransactionReceipt({ hash: reviewHash })
  }
  const result = (await state()).expenses.find(e => e.id === expense.id)!
  assert.equal(result.evidence.payment[0].status, 'approved')
  assert.equal(result.evidence.invoice[0].status, 'approved')
  assert.equal(result.evidence.purchase.length, 0)
})
