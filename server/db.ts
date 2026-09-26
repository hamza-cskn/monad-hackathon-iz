import { DatabaseSync } from 'node:sqlite'
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { dataDir } from './config.ts'
import { json, type Fields, type RecordKind, type Role } from '../shared/ledger.ts'
import type { Hex } from 'viem'
import type { EvidenceFile } from '../src/data.ts'

mkdirSync(join(dataDir, 'files'), { recursive: true })
export const db = new DatabaseSync(join(dataDir, 'iz.sqlite'))
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS metadata (hash TEXT PRIMARY KEY, content TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS files (hash TEXT PRIMARY KEY, mime TEXT NOT NULL, size INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS operations (id TEXT PRIMARY KEY, scope TEXT NOT NULL, idem TEXT NOT NULL, fingerprint TEXT NOT NULL,
 kind TEXT NOT NULL, fields TEXT NOT NULL, ref TEXT NOT NULL, actor TEXT NOT NULL, status TEXT NOT NULL,
 tx TEXT, raw_tx TEXT, uid TEXT, error TEXT, tracking TEXT, created TEXT NOT NULL, UNIQUE(scope,idem));
CREATE TABLE IF NOT EXISTS events (uid TEXT PRIMARY KEY, block INTEGER NOT NULL, log_index INTEGER NOT NULL, tx TEXT NOT NULL, body TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS challenges (nonce TEXT PRIMARY KEY, address TEXT NOT NULL, message TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, address TEXT NOT NULL, role TEXT NOT NULL, expires INTEGER NOT NULL);`)
export const hashBytes = (data: string | Uint8Array): Hex => `0x${createHash('sha256').update(data).digest('hex')}`
export function putMetadata(value: unknown): Hex {
  const content = json(value), hash = hashBytes(content)
  db.prepare('INSERT OR IGNORE INTO metadata VALUES (?,?)').run(hash, content)
  return hash
}
export function metadata(hash: string): Record<string, string> | undefined {
  const row = db.prepare('SELECT content FROM metadata WHERE hash=?').get(hash) as { content: string } | undefined
  return row && hashBytes(row.content) === hash ? JSON.parse(row.content) : undefined
}
export function putFile(bytes: Uint8Array, mime: string) {
  const hash = hashBytes(bytes)
  writeFileSync(join(dataDir, 'files', hash.slice(2)), bytes)
  db.prepare('INSERT OR IGNORE INTO files VALUES (?,?,?)').run(hash, mime, bytes.length)
  return hash
}
export function fileBytes(hash: string) {
  if (!/^0x[a-f0-9]{64}$/.test(hash)) throw new Error('Geçersiz dosya özeti.')
  return readFileSync(join(dataDir, 'files', hash.slice(2)))
}
export function purchaseFiles(digest: string): EvidenceFile[] {
  const bytes = fileBytes(digest)
  if (hashBytes(bytes) !== digest) throw new Error('Satın alma paketi özeti eşleşmiyor.')
  const files: EvidenceFile[] = JSON.parse(bytes.toString()).files
  if (!Array.isArray(files) || files.length !== 2 || files[0]?.kind !== 'invoice' || files[1]?.kind !== 'payment' || files.some(file => typeof file.name !== 'string' || !file.name || file.name.length > 120 || !['application/pdf', 'image/png', 'image/jpeg', 'text/plain'].includes(file.mime) || !/^0x[a-f0-9]{64}$/.test(file.digest))) throw new Error('Satın alma paketi geçersiz.')
  return files
}
export type Operation = { id: string; scope: string; idem: string; fingerprint: string; kind: RecordKind; fields: string; ref: Hex; actor: Role; status: string; tx: Hex | null; raw_tx: Hex | null; uid: Hex | null; error: string | null; tracking: string | null; created: string }
export function operation(id: string) { return db.prepare('SELECT * FROM operations WHERE id=?').get(id) as Operation | undefined }
export function existingOperation(scope: string, idem: string, fingerprint: string, kind: RecordKind, ref: Hex, actor: Role) {
  const existing = db.prepare('SELECT * FROM operations WHERE scope=? AND idem=?').get(scope, idem) as Operation | undefined
  if (existing && (existing.fingerprint !== fingerprint || existing.kind !== kind || existing.ref !== ref || existing.actor !== actor)) throw new Error('Aynı işlem anahtarı farklı içerik veya kayıt için kullanılamaz.')
  return existing
}
export function createOperation(scope: string, idem: string, fingerprint: string, kind: RecordKind, fields: Fields, ref: Hex, actor: Role, tracking?: string) {
  const existing = existingOperation(scope, idem, fingerprint, kind, ref, actor)
  if (existing) return existing
  const id = randomUUID()
  db.prepare('INSERT INTO operations (id,scope,idem,fingerprint,kind,fields,ref,actor,status,tracking,created) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, scope, idem, fingerprint, kind, json(fields), ref, actor, actor === 'platform' ? 'queued' : 'awaiting_signature', tracking ?? null, new Date().toISOString())
  return operation(id)!
}
export function setSetting(key: string, value: unknown) { db.prepare('INSERT OR REPLACE INTO settings VALUES (?,?)').run(key, json(value)) }
export function setting<T>(key: string): T | undefined {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key) as { value: string } | undefined
  return row ? JSON.parse(row.value) : undefined
}
