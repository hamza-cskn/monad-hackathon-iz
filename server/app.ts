import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify'
import cookie from '@fastify/cookie'
import { randomBytes, randomUUID } from 'node:crypto'
import { createSiweMessage } from 'viem/siwe'
import { isAddress, type Address, type Hex } from 'viem'
import { decodeFields, decisions, evidenceKinds, json, transactionFor, zeroHash, type Fields, type Role } from '../shared/ledger.ts'
import { publicClient, readManifest } from './config.ts'
import { createOperation, db, existingOperation, fileBytes, hashBytes, metadata, operation, purchaseFiles, putFile, putMetadata, type Operation } from './db.ts'
import { createLedger } from './ledger.ts'

const fail = (statusCode: number, message: string): never => { throw Object.assign(new Error(message), { statusCode }) }
function object(body: unknown): Record<string, unknown> { if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'Geçersiz istek.'); return body as Record<string, unknown> }
function text(body: Record<string, unknown>, field: string, max = 1000): string {
  const value = body[field]
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail(400, `${field}: geçerli bir değer gir.`)
  return (value as string).trim()
}
function amount(value: unknown): bigint {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 1 || value > 1_000_000 || Math.abs(value * 100 - Math.round(value * 100)) > 0.00001) fail(400, '1 ile 1.000.000 TL arasında en fazla iki ondalıklı tutar gir.')
  return BigInt(Math.round((value as number) * 100))
}
function hex(value: unknown): Hex { if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(value)) fail(400, 'Geçersiz işlem veya kayıt kimliği.'); return value as Hex }

export async function buildApp() {
  const app = Fastify({ logger: false, bodyLimit: 2_800_000 })
  await app.register(cookie)
  const m = readManifest(), ledger = createLedger(m)
  const origins = (process.env.IZ_ORIGINS ?? 'http://127.0.0.1:5173,http://localhost:5173').split(',')
  let networkError = ''
  const sync = async () => { try { await ledger.sync(); networkError = '' } catch (e) { networkError = (e as Error).message; throw e } }
  await sync()
  const timer = setInterval(() => { void sync().catch(() => {}) }, 1500)
  timer.unref()
  app.addHook('onClose', async () => { clearInterval(timer) })
  app.addHook('onRequest', async request => {
    if (request.headers.origin && !origins.includes(request.headers.origin)) fail(403, 'Bu origin için erişim izni yok.')
  })
  app.setErrorHandler((error, _request, reply) => { const e = error as Error & { statusCode?: number }; reply.code(e.statusCode ?? 500).send({ error: e.statusCode ? e.message : 'İşlem tamamlanamadı. Yerel ağ ve backend bağlantısını kontrol et.' }) })
  type Session = { address: Address; role: Role; expires: number }
  function session(request: FastifyRequest): Session | undefined {
    const token = request.cookies.iz_session
    if (!token) return
    return db.prepare('SELECT address,role,expires FROM sessions WHERE token=? AND expires>?').get(hashBytes(token), Date.now()) as Session | undefined
  }
  function authorize(request: FastifyRequest, role: Role) {
    const user = session(request)
    if (!user) fail(401, 'Yetkili cüzdanınla giriş yap.')
    if (user!.role !== role) fail(403, 'Bu işlem için yetkin yok.')
    return user!
  }
  function idem(request: FastifyRequest) {
    const key = request.headers['idempotency-key']
    if (typeof key !== 'string' || !/^[a-zA-Z0-9-]{16,100}$/.test(key)) fail(400, 'Geçerli işlem anahtarı gerekiyor.')
    return key as string
  }
  function output(op: Operation) {
    return { id: op.id, status: op.status, hash: op.tx, uid: op.uid, error: op.error, code: op.tracking, recordId: JSON.parse(op.fields).recordId as string, transaction: transactionFor(m, op.kind, JSON.parse(op.fields), op.ref) }
  }
  async function ready() { await sync().catch(() => fail(503, networkError || 'Yerel zincir erişilemiyor.')) }
  function prepare(request: FastifyRequest, kind: 'expense' | 'evidence' | 'review', fields: Fields, ref: Hex, role: Role, fingerprint: unknown) {
    const user = authorize(request, role)
    try { return output(createOperation(user.address.toLowerCase(), idem(request), hashBytes(json(fingerprint)), kind, fields, ref, role)) }
    catch (e) { fail(409, (e as Error).message) }
  }

  app.get('/api/network', async () => ({ ...m, connected: !networkError, error: networkError || null }))
  app.get('/api/session', async request => session(request) ?? null)
  app.post('/api/auth/challenge', async request => {
    const body = object(request.body), address = text(body, 'address', 42)
    if (!isAddress(address)) fail(400, 'Geçersiz cüzdan adresi.')
    if (![m.accounts.organization, m.accounts.reviewer].some(a => a.toLowerCase() === address.toLowerCase())) fail(403, 'Bu cüzdan kurum veya denetçi olarak tanımlı değil.')
    const nonce = randomBytes(16).toString('hex'), expires = Date.now() + 5 * 60_000
    const origin = request.headers.origin ?? origins[0]
    const message = createSiweMessage({ address: address as Address, chainId: m.chainId, domain: new URL(origin).host, uri: origin, version: '1', nonce, issuedAt: new Date(), expirationTime: new Date(expires), statement: 'İz kurum / denetçi paneline giriş.' })
    db.prepare('DELETE FROM challenges WHERE expires<? OR address=?').run(Date.now(), address.toLowerCase())
    db.prepare('INSERT INTO challenges VALUES (?,?,?,?)').run(nonce, address.toLowerCase(), message, expires)
    return { nonce, message }
  })
  app.post('/api/auth/verify', async (request, reply) => {
    const body = object(request.body), nonce = text(body, 'nonce', 100), signature = text(body, 'signature', 2000)
    const row = db.prepare('SELECT * FROM challenges WHERE nonce=? AND expires>?').get(nonce, Date.now()) as { address: Address; message: string } | undefined
    if (!row || !/^0x[0-9a-fA-F]+$/.test(signature)) fail(401, 'Giriş isteği geçersiz veya süresi dolmuş.')
    const valid = await publicClient.verifyMessage({ address: row!.address, message: row!.message, signature: signature as Hex })
    if (!valid) fail(401, 'Cüzdan imzası doğrulanamadı.')
    const consumed = db.prepare('DELETE FROM challenges WHERE nonce=? AND expires>?').run(nonce, Date.now())
    if (!consumed.changes) fail(401, 'Giriş isteği daha önce kullanılmış.')
    const role: Role = row!.address.toLowerCase() === m.accounts.organization.toLowerCase() ? 'organization' : 'reviewer'
    const token = randomBytes(32).toString('hex'), expires = Date.now() + 8 * 60 * 60_000
    db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(hashBytes(token), row!.address, role, expires)
    reply.setCookie('iz_session', token, { path: '/', httpOnly: true, sameSite: 'strict', maxAge: 8 * 60 * 60 })
    return { address: row!.address, role, expires }
  })
  app.post('/api/auth/logout', async (request, reply) => {
    if (request.cookies.iz_session) db.prepare('DELETE FROM sessions WHERE token=?').run(hashBytes(request.cookies.iz_session))
    reply.clearCookie('iz_session', { path: '/' }); return { ok: true }
  })
  app.get('/api/state', async () => { await ready(); return { ...ledger.snapshot.state, network: { chainId: m.chainId, name: m.name }, invalid: ledger.snapshot.invalid } })
  app.post('/api/donations', async request => {
    await ready()
    const body = object(request.body), gross = amount(body.amount), fee = (gross * 200n + 5000n) / 10000n
    const id = `IZ-${randomUUID()}`, code = `IZ-${randomBytes(16).toString('hex').toUpperCase()}`
    let op
    try { op = createOperation('donation', idem(request), hashBytes(gross.toString()), 'donation', { recordId: id, gross, fee, net: gross - fee, currency: 'TRY-DEMO', occurredAt: BigInt(Math.floor(Date.now() / 1000)) }, m.fundUID, 'platform', code) }
    catch (e) { fail(409, (e as Error).message) }
    void sync().catch(() => {})
    return output(op!)
  })
  app.post('/api/donations/lookup', async request => {
    await ready()
    const code = text(object(request.body), 'code', 100).toUpperCase()
    const op = db.prepare('SELECT * FROM operations WHERE tracking=?').get(code) as Operation | undefined
    if (!op) fail(404, 'Bu kodla bir bağış bulunamadı.')
    const donation = ledger.snapshot.donations.get(JSON.parse(op!.fields).recordId)
    return { donation: donation ? { ...donation, id: code } : null, operation: output(op!) }
  })
  app.post('/api/expenses', async request => {
    authorize(request, 'organization'); await ready()
    const body = object(request.body), value = amount(body.amount)
    const info = { title: text(body, 'title', 80), recipient: text(body, 'recipient', 100), category: text(body, 'category', 20), description: text(body, 'description', 1000), date: text(body, 'date', 10) }
    if (!['Barınma', 'Lojistik', 'Gıda'].includes(info.category) || !/^\d{4}-\d{2}-\d{2}$/.test(info.date) || Number.isNaN(Date.parse(info.date))) fail(400, 'Kategori veya tarih geçersiz.')
    return prepare(request, 'expense', { recordId: `IZ-H${randomUUID()}`, amount: value, currency: 'TRY-DEMO', metadataHash: putMetadata(info) }, m.fundUID, 'organization', body)
  })
  function uploadFile(body: Record<string, unknown>) {
    const name = text(body, 'name', 120), mime = text(body, 'mime', 40), content = text(body, 'content', 1_333_340)
    if (!['application/pdf', 'image/png', 'image/jpeg', 'text/plain'].includes(mime)) fail(400, 'Belge türü geçersiz.')
    const bytes = Buffer.from(content, 'base64')
    if (!bytes.length || bytes.length > 1_000_000 || bytes.toString('base64') !== content) fail(400, 'Belge en fazla 1 MB ve geçerli base64 olmalı.')
    if ((mime === 'application/pdf' && bytes.subarray(0, 5).toString() !== '%PDF-') || (mime === 'image/png' && bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') || (mime === 'image/jpeg' && bytes.subarray(0, 3).toString('hex') !== 'ffd8ff') || (mime === 'text/plain' && bytes.includes(0))) fail(400, 'Dosya içeriği bildirilen türle eşleşmiyor.')
    return { name, mime, digest: putFile(bytes, mime) }
  }
  app.post<{ Params: { id: string } }>('/api/expenses/:id/evidence', async request => {
    authorize(request, 'organization'); await ready()
    const expense = ledger.snapshot.state.expenses.find(e => e.id === request.params.id)
    if (!expense) fail(404, 'Harcama bulunamadı.')
    const body = object(request.body), kind = text(body, 'kind', 20)
    if (!['purchase', 'delivery'].includes(kind) || typeof body.shared !== 'boolean') fail(400, 'Satın alma veya teslim alma aşamasını ve paylaşım tercihini seç.')
    let fileHash: Hex, name: string, mime: string
    if (kind === 'purchase') {
      if (!Array.isArray(body.files) || body.files.length !== 2) fail(400, 'Satın alma için fatura ve ödeme belgesini birlikte yükle.')
      const inputs = (body.files as unknown[]).map(object)
      if (inputs[0].kind !== 'invoice' || inputs[1].kind !== 'payment') fail(400, 'Paket bir fatura ve bir ödeme belgesi içermeli.')
      const files = inputs.map(input => ({ kind: input.kind, ...uploadFile(input) }))
      fileHash = putFile(Buffer.from(json({ files })), 'application/json')
      name = `Satın alma · ${files[0].name}`; mime = 'application/json'
    } else {
      const file = uploadFile(body)
      fileHash = file.digest; name = file.name; mime = file.mime
    }
    const metadataHash = putMetadata({ name, mime, createdAt: new Date().toISOString() })
    const previous = expense!.evidence[kind as typeof evidenceKinds[number]].at(-1)?.anchor?.uid ?? zeroHash
    return prepare(request, 'evidence', { recordId: randomUUID(), kind: evidenceKinds.indexOf(kind as typeof evidenceKinds[number]), fileHash, previousVersionUID: previous, metadataHash, shared: body.shared as boolean }, expense!.anchor!.uid!, 'organization', body)
  })
  app.post<{ Params: { uid: string } }>('/api/evidence/:uid/reviews', async request => {
    const user = authorize(request, 'reviewer'); await ready()
    const uid = hex(request.params.uid), target = ledger.snapshot.evidence.get(uid)
    const body = object(request.body), key = idem(request)
    try {
      const existing = existingOperation(user.address.toLowerCase(), key, hashBytes(json(body)), 'review', uid, 'reviewer')
      if (existing) return output(existing)
    } catch (e) { fail(409, (e as Error).message) }
    if (!target) fail(404, 'Belge bulunamadı.')
    if (target!.version.status !== 'pending' || ![target!.expense.evidence.purchase, target!.expense.evidence.delivery].some(v => v.at(-1)?.anchor?.uid === uid)) fail(409, 'Yalnızca güncel ve bekleyen satın alma veya teslim alma kaydı incelenebilir.')
    const decision = text(body, 'decision', 20), reason = text(body, 'reason', 2000)
    if (!decisions.includes(decision as typeof decisions[number])) fail(400, 'Geçersiz karar.')
    return prepare(request, 'review', { recordId: randomUUID(), decision: decisions.indexOf(decision as typeof decisions[number]), reasonHash: putMetadata({ reason }) }, uid, 'reviewer', body)
  })
  app.post<{ Params: { id: string } }>('/api/operations/:id/transaction', async request => {
    const op = operation(request.params.id)
    if (!op || op.actor === 'platform') fail(404, 'İşlem bulunamadı.')
    authorize(request, op!.actor)
    const hash = hex(object(request.body).hash)
    const tx = await publicClient.getTransaction({ hash }).catch(() => fail(400, 'İşlem yerel ağda bulunamadı.'))
    const expected = transactionFor(m, op!.kind, JSON.parse(op!.fields), op!.ref)
    if (tx.from.toLowerCase() !== m.accounts[op!.actor].toLowerCase() || tx.to?.toLowerCase() !== m.eas.toLowerCase() || tx.input !== expected.data || tx.value !== 0n) fail(400, 'İşlem beklenen imzalayan veya kayıtla eşleşmiyor.')
    if (op!.tx && op!.tx !== hash) fail(409, 'Bu kayıt için başka işlem zaten izleniyor.')
    db.prepare("UPDATE operations SET tx=?,status='submitted' WHERE id=? AND status='awaiting_signature'").run(hash, op!.id)
    await ready(); return output(operation(op!.id)!)
  })
  app.get<{ Params: { id: string } }>('/api/operations/:id', async request => {
    const op = operation(request.params.id)
    if (!op) fail(404, 'İşlem bulunamadı.')
    if (op!.actor !== 'platform') authorize(request, op!.actor)
    await ready(); return output(operation(op!.id)!)
  })
  function serveFile(request: FastifyRequest, reply: FastifyReply, uid: string, part?: string) {
    const target = ledger.snapshot.evidence.get(hex(uid))
    if (!target) fail(404, 'Belge bulunamadı.')
    if (!target!.version.shared && !session(request)) fail(403, 'Bu belgenin aslı yalnızca kurum ve denetçiye açık.')
    let digest = target!.version.digest, mime = target!.version.mime
    if (part) {
      if (!target!.version.files) fail(404, 'Satın alma paketi bulunamadı.')
      const files = (() => { try { return purchaseFiles(digest) } catch { return fail(409, 'Satın alma paketi erişilemiyor veya özeti eşleşmiyor.') } })()
      const file = files.find(f => f.kind === part)
      if (!file) fail(404, 'Pakette bu belge bulunamadı.')
      digest = file!.digest; mime = file!.mime
    }
    const bytes = (() => { try { return fileBytes(digest) } catch { return fail(404, 'Belge dosyası erişilemiyor.') } })()
    if (hashBytes(bytes) !== digest) fail(409, 'Belge özeti zincir kaydıyla eşleşmiyor.')
    reply.header('X-Content-Type-Options', 'nosniff').header('Content-Security-Policy', "default-src 'none'; sandbox").header('Cache-Control', 'no-store')
    return reply.type(mime ?? 'application/octet-stream').send(bytes)
  }
  app.get<{ Params: { uid: string } }>('/api/evidence/:uid/file', async (request, reply) => serveFile(request, reply, request.params.uid))
  app.get<{ Params: { uid: string; kind: string } }>('/api/evidence/:uid/files/:kind', async (request, reply) => serveFile(request, reply, request.params.uid, request.params.kind))
  app.get<{ Params: { uid: string } }>('/api/records/:uid/verify', async request => {
    await ready()
    const uid = hex(request.params.uid)
    const row = db.prepare('SELECT * FROM events WHERE uid=?').get(uid) as { body: string; tx: Hex } | undefined
    if (!row) fail(404, 'Kayıt bulunamadı.')
    const a = JSON.parse(row!.body), target = ledger.snapshot.evidence.get(uid)
    let contentMatches: boolean | null = null
    const kind = (Object.keys(m.schemas) as (keyof typeof m.schemas)[]).find(k => m.schemas[k] === a.schema)
    if (kind) {
      const fields = decodeFields(kind, a.data)
      if (kind !== 'donation') contentMatches = Boolean(metadata(String(kind === 'review' ? fields.reasonHash : fields.metadataHash)))
      if (kind === 'evidence') {
        try {
          contentMatches = Boolean(contentMatches && target && hashBytes(fileBytes(target.version.digest)) === target.version.digest)
          if (contentMatches && evidenceKinds[Number(fields.kind)] === 'purchase') contentMatches = purchaseFiles(target!.version.digest).every(file => hashBytes(fileBytes(file.digest)) === file.digest)
        } catch { contentMatches = false }
      }
    }
    return { uid, hash: row!.tx, attester: a.attester, chainId: m.chainId, valid: ledger.snapshot.accepted.has(uid), contentMatches }
  })
  return { app, ledger, manifest: m }
}
