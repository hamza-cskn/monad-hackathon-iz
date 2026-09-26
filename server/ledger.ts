import { keccak256, type Hex } from 'viem'
import { actors, decodeFields, decisions, easAbi, encodeFields, evidenceKinds, json, transactionFor, zeroHash, type Fields, type Manifest, type RecordKind } from '../shared/ledger.ts'
import { checkDeployment, publicClient, wallet } from './config.ts'
import { db, metadata, purchaseFiles, setSetting, setting, type Operation } from './db.ts'
import type { Anchor, DemoState, Donation, EvidenceVersion, Expense } from '../src/data.ts'

export type Attestation = { uid: Hex; schema: Hex; time: bigint; expirationTime: bigint; revocationTime: bigint; refUID: Hex; recipient: Hex; attester: Hex; revocable: boolean; data: Hex }
export type ChainEvent = { uid: Hex; tx: Hex; block: number; log_index: number; body: string }
export type Projection = { state: DemoState; donations: Map<string, Donation>; expenses: Map<Hex, Expense>; evidence: Map<Hex, { expense: Expense; version: EvidenceVersion }>; invalid: { uid: Hex; reason: string }[]; accepted: Set<Hex> }
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
const requireValid = (ok: unknown, message: string) => { if (!ok) throw new Error(message) }

export function project(m: Manifest): Projection {
  const donations = new Map<string, Donation>(), expenses = new Map<Hex, Expense>(), evidence = new Map<Hex, { expense: Expense; version: EvidenceVersion }>()
  const accepted = new Set<Hex>(), invalid: Projection['invalid'] = [], ids = new Set<string>()
  let gross = 0n, fees = 0n, spent = 0n
  const rows = db.prepare('SELECT * FROM events ORDER BY block,log_index').all() as ChainEvent[]
  for (const row of rows) {
    try {
      const a = JSON.parse(row.body) as Attestation
      const kind = (Object.keys(m.schemas) as RecordKind[]).find(k => m.schemas[k] === a.schema)
      if (!kind) continue
      const f = decodeFields(kind, a.data), id = String(f.recordId)
      requireValid(same(a.attester, m.accounts[actors[kind]]), 'Yetkisiz imzalayan.')
      requireValid(!a.revocable && BigInt(a.expirationTime) === 0n && BigInt(a.revocationTime) === 0n, 'Kalıcı kayıt bekleniyor.')
      requireValid(id.length > 0 && id.length <= 100 && !ids.has(`${kind}:${id}`), 'Tekrarlanan veya geçersiz kayıt kimliği.')
      const anchor: Anchor = { hash: row.tx, uid: a.uid, digest: String(f.fileHash ?? f.metadataHash ?? f.reasonHash ?? ''), attester: a.attester, chainId: m.chainId, status: 'confirmed' }
      if (kind === 'fund') {
        requireValid(a.uid === m.fundUID && a.refUID === zeroHash && same(String(f.organization), m.accounts.organization) && same(String(f.reviewer), m.accounts.reviewer), 'Fon kaydı eşleşmiyor.')
      } else if (kind === 'donation') {
        const amount = BigInt(f.gross), fee = BigInt(f.fee), net = BigInt(f.net)
        requireValid(a.refUID === m.fundUID && accepted.has(m.fundUID), 'Fon referansı geçersiz.')
        requireValid(f.currency === 'TRY-DEMO' && amount >= 100n && amount <= 100_000_000n && fee === (amount * 200n + 5000n) / 10000n && net === amount - fee, 'Bağış tutarı veya kesinti geçersiz.')
        const date = new Date(Number(f.occurredAt) * 1000).toISOString()
        donations.set(id, { id, amount: Number(amount) / 100, fee: Number(fee) / 100, date, anchor, format: 'institution-v2' })
        gross += amount; fees += fee
      } else if (kind === 'expense') {
        const amount = BigInt(f.amount)
        requireValid(a.refUID === m.fundUID && accepted.has(m.fundUID) && f.currency === 'TRY-DEMO' && amount >= 100n && amount <= 100_000_000n, 'Harcama veya fon referansı geçersiz.')
        const info = metadata(String(f.metadataHash))
        expenses.set(a.uid, { id, title: info?.title ?? 'Açıklama erişilemiyor', category: (info?.category ?? 'Barınma') as Expense['category'], recipient: info?.recipient ?? 'İçerik erişilemiyor', amount: Number(amount) / 100, date: info?.date ?? new Date(Number(a.time) * 1000).toISOString(), description: info?.description ?? 'Zincir kaydı mevcut; açıklama dosyası erişilemiyor.', evidence: { payment: [], invoice: [], delivery: [], purchase: [] }, anchor })
        spent += amount
      } else if (kind === 'evidence') {
        const expense = expenses.get(a.refUID), kindIndex = Number(f.kind)
        requireValid(expense && kindIndex >= 0 && kindIndex < evidenceKinds.length && f.fileHash !== zeroHash, 'Belge veya harcama referansı geçersiz.')
        const versions = expense!.evidence[evidenceKinds[kindIndex]]
        requireValid((versions.at(-1)?.anchor?.uid ?? zeroHash) === f.previousVersionUID, 'Belge sürümü güncel zinciri izlemiyor.')
        const info = metadata(String(f.metadataHash))
        const version: EvidenceVersion = { id, name: info?.name ?? 'İçerik erişilemiyor', mime: info?.mime, content: '', digest: String(f.fileHash), createdAt: info?.createdAt ?? new Date(Number(a.time) * 1000).toISOString(), status: 'pending', reason: 'Denetçi incelemesini bekliyor.', anchor, shared: Boolean(f.shared), fileUrl: `/api/evidence/${a.uid}/file` }
        if (evidenceKinds[kindIndex] === 'purchase') {
          try { version.files = purchaseFiles(version.digest).map(file => ({ ...file, fileUrl: `/api/evidence/${a.uid}/files/${file.kind}` })) }
          catch { version.files = [] }
        }
        versions.push(version); evidence.set(a.uid, { expense: expense!, version })
      } else {
        const target = evidence.get(a.refUID), decision = decisions[Number(f.decision)]
        requireValid(target && decision && target.version.status === 'pending' && f.reasonHash !== zeroHash, 'Karar hedefi veya gerekçesi geçersiz.')
        requireValid(Object.values(target!.expense.evidence).some(versions => versions.at(-1)?.id === target!.version.id), 'Eski belge sürümü incelenemez.')
        const info = metadata(String(f.reasonHash))
        Object.assign(target!.version, { status: decision, reason: info?.reason ?? 'Gerekçe metni erişilemiyor; özeti zincirde kayıtlı.', reviewer: a.attester, reviewedAt: new Date(Number(a.time) * 1000).toISOString(), reviewAnchor: anchor })
      }
      ids.add(`${kind}:${id}`); accepted.add(a.uid)
    } catch (error) { invalid.push({ uid: row.uid, reason: (error as Error).message }) }
  }
  const state: DemoState = { version: 1, donations: [], expenses: [...expenses.values()], invalidRecords: invalid.length, totals: { gross: Number(gross) / 100, fees: Number(fees) / 100, net: Number(gross - fees) / 100, spent: Number(spent) / 100, remaining: Number(gross - fees - spent) / 100 } }
  return { state, donations, expenses, evidence, invalid, accepted }
}

export function createLedger(m: Manifest) {
  let running: Promise<void> | undefined
  let snapshot = project(m)
  async function scan() {
    await checkDeployment(m)
    const identity = `${m.chainId}:${m.eas}:${m.deploymentBlockHash}`
    const prior = setting<string>('deployment')
    if (prior && prior !== identity) throw new Error('Veritabanı başka deployment içeriyor; ayrı veri dizini kullan.')
    setSetting('deployment', identity)
    let cursor = setting<{ number: string; hash: Hex }>('cursor')
    if (cursor) {
      const head = await publicClient.getBlockNumber({ cacheTime: 0 })
      const block = head >= BigInt(cursor.number) ? await publicClient.getBlock({ blockNumber: BigInt(cursor.number) }) : undefined
      if (!block || block.hash !== cursor.hash) {
        db.exec('DELETE FROM events;')
        db.prepare("UPDATE operations SET status='submitted',uid=NULL WHERE tx IS NOT NULL AND status IN ('confirmed','invalid')").run()
        cursor = undefined
      }
    }
    const head = await publicClient.getBlockNumber({ cacheTime: 0 })
    let from = cursor ? BigInt(cursor.number) + 1n : BigInt(m.deploymentBlock)
    while (from <= head) {
      const to = from + 499n < head ? from + 499n : head
      const logs = await publicClient.getContractEvents({ address: m.eas, abi: easAbi, eventName: 'Attested', fromBlock: from, toBlock: to, strict: true })
      for (const log of logs) {
        if (!Object.values(m.schemas).includes(log.args.schemaUID)) continue
        const attestation = await publicClient.readContract({ address: m.eas, abi: easAbi, functionName: 'getAttestation', args: [log.args.uid] })
        db.prepare('INSERT OR IGNORE INTO events VALUES (?,?,?,?,?)').run(log.args.uid, Number(log.blockNumber), log.logIndex, log.transactionHash, json(attestation))
      }
      const block = await publicClient.getBlock({ blockNumber: to })
      setSetting('cursor', { number: to, hash: block.hash }); from = to + 1n
    }
    snapshot = project(m)
    const pending = db.prepare("SELECT * FROM operations WHERE status IN ('submitted','awaiting_signature')").all() as Operation[]
    const unreportedEvents = pending.some(op => !op.tx) ? db.prepare('SELECT * FROM events ORDER BY block,log_index').all() as ChainEvent[] : []
    for (const op of pending) {
      if (op.tx) {
        let receipt
        try { receipt = await publicClient.getTransactionReceipt({ hash: op.tx }) } catch { continue }
        // A receipt can arrive after this scan's head; index its block before deciding.
        if (receipt.blockNumber > head) continue
        if (receipt.status !== 'success') { db.prepare("UPDATE operations SET status='failed',error=? WHERE id=?").run('Zincir işlemi geri alındı.', op.id); continue }
      }
      const events = op.tx ? db.prepare('SELECT * FROM events WHERE tx=? ORDER BY block,log_index').all(op.tx) as ChainEvent[] : unreportedEvents
      const data = encodeFields(op.kind, JSON.parse(op.fields))
      const matched = events.find(e => {
        const a = JSON.parse(e.body) as Attestation
        return a.schema === m.schemas[op.kind] && a.refUID === op.ref && same(a.attester, m.accounts[op.actor]) && a.data === data
      })
      if (matched) db.prepare('UPDATE operations SET status=?,tx=?,uid=?,error=? WHERE id=?').run(snapshot.accepted.has(matched.uid) ? 'confirmed' : 'invalid', matched.tx, matched.uid, snapshot.invalid.find(i => i.uid === matched.uid)?.reason ?? null, op.id)
      else if (op.tx) db.prepare("UPDATE operations SET status='invalid',error=? WHERE id=?").run('İşlem beklenen EAS kaydını içermiyor.', op.id)
    }
  }
  async function sendQueued() {
    const queued = db.prepare("SELECT * FROM operations WHERE actor='platform' AND status='queued' ORDER BY created").all() as Operation[]
    for (const op of queued) {
      const client = wallet(m.accounts.platform)
      const tx = transactionFor(m, op.kind, JSON.parse(op.fields) as Fields, op.ref)
      // Persist signed bytes before broadcast; recovery rebroadcasts exactly the same transaction.
      const prepared = await client.prepareTransactionRequest({ to: tx.to, data: tx.data, value: 0n })
      const raw = await client.signTransaction(prepared)
      const hash = keccak256(raw)
      db.prepare("UPDATE operations SET status='submitted',raw_tx=?,tx=? WHERE id=?").run(raw, hash, op.id)
      await publicClient.sendRawTransaction({ serializedTransaction: raw })
      await publicClient.waitForTransactionReceipt({ hash, timeout: 10_000, pollingInterval: 200 })
    }
    for (const op of db.prepare("SELECT * FROM operations WHERE raw_tx IS NOT NULL AND status='submitted'").all() as Operation[]) {
      try { await publicClient.sendRawTransaction({ serializedTransaction: op.raw_tx! }) } catch { /* Receipt/index scan determines success, including already-known transactions. */ }
    }
  }
  return {
    get snapshot() { return snapshot },
    sync() {
      if (!running) running = (async () => { await scan(); await sendQueued(); await scan() })().finally(() => { running = undefined })
      return running
    },
  }
}
