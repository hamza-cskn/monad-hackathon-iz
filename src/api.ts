import type { Hex, Address } from 'viem'
import type { Manifest, Role } from '../shared/ledger'
export type Network = Manifest & { connected: boolean; error: string | null }
export type Session = { address: Address; role: Role; expires: number }
export type Operation = { id: string; status: string; hash: Hex | null; uid: Hex | null; error: string | null; code: string | null; recordId: string; transaction: { to: Address; data: Hex; value: Hex; chainId: number } }

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}
export class OperationFailure extends Error {}

export async function api<T>(path: string, body?: unknown, key?: string): Promise<T> {
  const response = await fetch(`/api${path}`, { method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', headers: body === undefined ? {} : { 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) })
  const data = await response.json().catch(() => { throw new ApiError('Backend yanıt vermiyor. API bağlantısını kontrol et.', response.ok ? 502 : response.status) })
  if (!response.ok) throw new ApiError(data.error ?? 'İstek tamamlanamadı.', response.status)
  return data as T
}
export async function waitOperation(id: string) {
  for (let count = 0; count < 30; count++) {
    const op = await api<Operation>(`/operations/${id}`)
    if (op.status === 'confirmed') return op
    if (['failed', 'invalid'].includes(op.status)) throw new OperationFailure(op.error ?? 'Zincir kaydı başarısız.')
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error('İşlem gönderildi; onay bekleniyor. Aynı kaydı kontrol ederek devam edebilirsin.')
}
