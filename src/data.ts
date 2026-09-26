export type EvidenceKind = 'payment' | 'invoice' | 'delivery' | 'purchase'
export type EvidenceFile = { kind: 'invoice' | 'payment'; name: string; mime: string; digest: string; fileUrl?: string }
export type EvidenceStatus = 'missing' | 'pending' | 'approved' | 'rejected' | 'requested'
export type Anchor = { hash: `0x${string}`; status: 'pending' | 'confirmed' | 'failed'; digest: string; uid?: `0x${string}`; attester?: string; chainId?: number }
export type EvidenceVersion = {
  id: string
  name: string
  content: string
  mime?: string
  encoding?: 'base64'
  digest: string
  createdAt: string
  status: EvidenceStatus
  reason: string
  reviewer?: string
  reviewedAt?: string
  anchor?: Anchor
  reviewAnchor?: Anchor
  fileUrl?: string
  shared?: boolean
  files?: EvidenceFile[]
}
export type Expense = {
  id: string
  title: string
  category: 'Barınma' | 'Lojistik' | 'Gıda'
  recipient: string
  amount: number
  date: string
  description: string
  evidence: Record<EvidenceKind, EvidenceVersion[]>
  anchor?: Anchor
}
export type Donation = { id: string; amount: number; fee: number; date: string; anchor?: Anchor; format?: 'institution-v2' }
export type FundTotals = { gross: number; fees: number; net: number; spent: number; remaining: number }
export type DemoState = { version: 1; donations: Donation[]; expenses: Expense[]; exampleAnchor?: Anchor; totals?: FundTotals; invalidRecords?: number; invalid?: { uid: string; reason: string }[] }

export const labels: Record<EvidenceKind, string> = { payment: 'Ödeme belgesi', invoice: 'Fatura', purchase: 'Satın alma', delivery: 'Teslim alma' }
export const statuses: Record<EvidenceStatus, string> = {
  missing: 'Sunulmadı', pending: 'İnceleniyor', approved: 'Doğrulandı', rejected: 'Reddedildi', requested: 'Ek belge istendi',
}
export const money = (amount: number) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(amount)
export const dateLabel = (date: string) => new Date(date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
export const feeFor = (amount: number) => Math.round(amount * 2) / 100
export const validAmount = (amount: number) => Number.isFinite(amount) && amount >= 1 && amount <= 1_000_000 && Math.abs(amount * 100 - Math.round(amount * 100)) < 0.000001
export const latest = (versions: EvidenceVersion[]) => versions.at(-1)
export const statusOf = (expense: Expense, kind: EvidenceKind): EvidenceStatus => latest(expense.evidence[kind])?.status ?? 'missing'
export const STORAGE_KEY = 'iz-demo-v1'

function sample(kind: EvidenceKind, expense: string, status: EvidenceStatus, reason: string): EvidenceVersion[] {
  if (status === 'missing') return []
  return [{
    id: `${expense}-${kind}-v1`, name: `${expense}-${kind}.txt`,
    content: `İZ — ÖRNEK BELGE\nGerçek ödeme, fatura veya teslimat belgesi değildir.\n\nKayıt: ${expense}\nBelge türü: ${{ payment: 'Ödeme', invoice: 'Fatura', delivery: 'Teslimat', purchase: 'Satın alma' }[kind]}\nKurum: Birlikte Yaşam Derneği\nFon: Kurumun ortak bağış fonu\n\nHackathon gösterimi için hazırlanmış sentetik veri.`,
    digest: '', createdAt: '2026-09-24T09:00:00.000Z', status, reason,
    reviewer: status === 'approved' || status === 'rejected' ? 'Demo denetçisi' : undefined,
  }]
}

export function initialState(): DemoState {
  return { version: 1, donations: [], expenses: [
    {
      id: 'IZ-H001', title: 'Aile tipi çadır alımı', category: 'Barınma', recipient: 'Örnek Barınma Tedarik A.Ş.',
      amount: 60_000, date: '2026-09-24', description: '24 adet aile tipi, dört mevsim çadırın satın alınması ve saha ekibine teslimi.',
      evidence: {
        purchase: [],
        payment: sample('payment', 'IZ-H001', 'approved', 'Örnek ödeme tutarı ve alıcı bilgisi harcama kaydıyla eşleştirildi.'),
        invoice: sample('invoice', 'IZ-H001', 'approved', 'Örnek faturadaki adet ve tutar kayıtla eşleşiyor.'),
        delivery: sample('delivery', 'IZ-H001', 'approved', 'Örnek teslim tutanağındaki 24 çadır, alım kaydıyla eşleştirildi.'),
      },
    },
    {
      id: 'IZ-H002', title: 'Sahaya nakliye', category: 'Lojistik', recipient: 'Örnek Lojistik Ltd.', amount: 20_000,
      date: '2026-09-25', description: 'Çadırların depodan Hatay dağıtım noktasına taşınması.',
      evidence: {
        purchase: [],
        payment: sample('payment', 'IZ-H002', 'approved', 'Örnek havale ve alıcı bilgileri eşleşiyor.'),
        invoice: sample('invoice', 'IZ-H002', 'approved', 'Örnek nakliye faturası harcama tutarıyla eşleşiyor.'),
        delivery: sample('delivery', 'IZ-H002', 'pending', 'Teslim tutanağı denetçi incelemesini bekliyor.'),
      },
    },
    {
      id: 'IZ-H003', title: 'Gıda ve temel ihtiyaç', category: 'Gıda', recipient: 'Örnek Gıda Kooperatifi', amount: 7_500,
      date: '2026-09-25', description: 'Saha ekibi ve aileler için temel gıda paketlerinin temini.',
      evidence: {
        purchase: [],
        payment: sample('payment', 'IZ-H003', 'approved', 'Örnek ödeme tutarı harcama kaydıyla eşleşiyor.'),
        invoice: sample('invoice', 'IZ-H003', 'rejected', 'Örnek fatura tutarı harcama kaydıyla uyuşmuyor. Düzeltilmiş belge isteniyor.'),
        delivery: [],
      },
    },
  ] }
}

export const exampleDonation: Donation = { id: 'IZ-DEMO-1001', amount: 1_000, fee: 20, date: '2026-09-23T10:30:00Z' }

export function totals(state: DemoState) {
  if (state.totals) return state.totals
  const gross = 125_000 + state.donations.reduce((sum, d) => sum + d.amount, 0)
  const fees = 2_500 + state.donations.reduce((sum, d) => sum + d.fee, 0)
  const spent = state.expenses.reduce((sum, e) => sum + e.amount, 0)
  const net = Math.round((gross - fees) * 100) / 100
  return { gross, fees, net, spent, remaining: Math.round((net - spent) * 100) / 100 }
}

export function loadState(): DemoState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const state = JSON.parse(raw) as DemoState
      if (state.version === 1 && Array.isArray(state.donations) && Array.isArray(state.expenses)) return state
    }
  } catch { /* A fresh demo remains usable if browser storage is unavailable. */ }
  return initialState()
}

export async function digestText(content: string) {
  const bytes = new TextEncoder().encode(content)
  return digestBytes(bytes)
}

export function evidenceBytes(version: EvidenceVersion): Uint8Array<ArrayBuffer> {
  return version.encoding === 'base64'
    ? Uint8Array.from(atob(version.content), char => char.charCodeAt(0))
    : new TextEncoder().encode(version.content)
}

export async function digestBytes(content: Uint8Array<ArrayBuffer>) {
  const digest = await crypto.subtle.digest('SHA-256', content)
  return `0x${Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('')}`
}

export function donationContent(donation: Donation) {
  if (donation.format === 'institution-v2') {
    return JSON.stringify({ type: 'iz-demo-donation-v2', institution: 'birlikte-yasam', fund: 'general', id: donation.id, amount: donation.amount, fee: donation.fee, currency: 'TRY-DEMO', date: donation.date })
  }
  // Preserve the bytes of existing receipts, which may already be anchored.
  return JSON.stringify({ type: 'iz-demo-donation-v1', campaign: 'hatay-100-cadir', id: donation.id, amount: donation.amount, fee: donation.fee, currency: 'TRY-DEMO', date: donation.date })
}
