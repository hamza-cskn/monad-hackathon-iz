import { parseEventLogs, type Hex } from 'viem'
import { checkDeployment, publicClient, readManifest, wallet } from '../server/config.ts'
import { createOperation, db, hashBytes, operation, putFile, putMetadata } from '../server/db.ts'
import { createLedger } from '../server/ledger.ts'
import { actors, decisions, easAbi, evidenceKinds, json, requestFor, zeroHash, type Fields, type RecordKind } from '../shared/ledger.ts'
import { evidenceBytes, initialState } from '../src/data.ts'

const m = readManifest()
await checkDeployment(m)
const ledger = createLedger(m)
await ledger.sync()
async function attest(kind: RecordKind, fields: Fields, ref: Hex, tracking?: string) {
  const op = createOperation('seed', `seed-${kind}-${fields.recordId}`, hashBytes(json(fields)), kind, fields, ref, actors[kind], tracking)
  if (op.status === 'confirmed') return op.uid!
  if (!op.tx) {
    const hash = await wallet(m.accounts[actors[kind]]).writeContract({ address: m.eas, abi: easAbi, functionName: 'attest', args: [requestFor(m, kind, fields, ref)] })
    db.prepare("UPDATE operations SET tx=?,status='submitted' WHERE id=?").run(hash, op.id)
  }
  const receipt = await publicClient.waitForTransactionReceipt({ hash: operation(op.id)!.tx!, pollingInterval: 100 })
  if (receipt.status !== 'success') throw new Error('Örnek kayıt işlemi başarısız.')
  await ledger.sync()
  if (operation(op.id)!.status !== 'confirmed') throw new Error(operation(op.id)!.error ?? 'Örnek kayıt doğrulanamadı.')
  const uid = parseEventLogs({ abi: easAbi, eventName: 'Attested', logs: receipt.logs })[0].args.uid
  console.log('Örnek kayıt:', kind, fields.recordId)
  return uid
}
for (const [recordId, gross, tracking] of [['demo-donation-1001', 100000n, 'IZ-DEMO-1001'], ['demo-opening-fund', 12400000n, undefined]] as const) {
  const fee = gross * 2n / 100n
  await attest('donation', { recordId, gross, fee, net: gross - fee, currency: 'TRY-DEMO', occurredAt: 1790161200n }, m.fundUID, tracking)
}
for (const expense of initialState().expenses) {
  const { title, category, recipient, description, date } = expense
  const uid = await attest('expense', { recordId: expense.id, amount: BigInt(Math.round(expense.amount * 100)), currency: 'TRY-DEMO', metadataHash: putMetadata({ title, category, recipient, description, date }) }, m.fundUID)
  const invoice = expense.evidence.invoice[0], payment = expense.evidence.payment[0]
  const files = ([['invoice', invoice], ['payment', payment]] as const).map(([kind, version]) => ({ kind, name: version.name, mime: 'text/plain', digest: putFile(evidenceBytes(version), 'text/plain') }))
  expense.evidence.purchase = [{ ...invoice, id: `${expense.id}-purchase-v1`, name: `Satın alma · ${invoice.name}`, mime: 'application/json', digest: putFile(Buffer.from(json({ files })), 'application/json'), reason: `${payment.reason} ${invoice.reason}` }]
  for (const kind of ['purchase', 'delivery'] as const) {
    for (const version of expense.evidence[kind]) {
      const metadataHash = putMetadata({ name: version.name, mime: version.mime ?? 'text/plain', createdAt: version.createdAt })
      const evidenceUID = await attest('evidence', { recordId: version.id, kind: evidenceKinds.indexOf(kind), fileHash: kind === 'purchase' ? version.digest : putFile(evidenceBytes(version), 'text/plain'), previousVersionUID: zeroHash, metadataHash, shared: true }, uid)
      if (version.status !== 'pending') await attest('review', { recordId: `${version.id}-review`, decision: decisions.indexOf(version.status as typeof decisions[number]), reasonHash: putMetadata({ reason: version.reason }) }, evidenceUID)
    }
  }
}
console.log('Örnek bağış, harcama ve denetim kayıtları gerçek yerel EAS makbuzlarıyla hazır.')
