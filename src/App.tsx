import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowDownLeft, ArrowRight, ArrowUpRight, Check, CheckCheck, ChevronRight,
  CircleCheck, Clock3, Copy, ExternalLink, FileText, Fingerprint, Info,
  Menu, PackageCheck, Plus, Search, ShieldCheck, Tent,
  Truck, X, XCircle, Utensils, Upload, Building2,
} from 'lucide-react'
import {
  dateLabel, feeFor, labels, latest, money, statuses, statusOf, totals, validAmount,
  type Anchor, type DemoState, type Donation, type EvidenceKind, type EvidenceStatus, type Expense,
} from './data'
import { submitOperation, walletError } from './chain'
import { api, ApiError, type Network, type Operation, type Session } from './api'
import { WalletPanel } from './WalletPanel'
import { HomePage, HowPage } from './PublicPages'

type View = 'home' | 'how' | 'donate' | 'fund' | 'track' | 'organization' | 'reviewer'
type Notice = { message: string; error?: boolean }
const kinds: EvidenceKind[] = ['purchase', 'delivery']

function getRoute(): { view: View; code: string } {
  const [path, query] = window.location.hash.replace('#', '').split('?')
  const routes: Record<string, View> = { '/': 'home', '/ana-sayfa': 'home', '/nasil-calisir': 'how', '/bagis': 'donate', '/kurum-kaydi': 'fund', '/kampanya': 'fund', '/takip': 'track', '/kurum': 'organization', '/denetci': 'reviewer' }
  return { view: routes[path] ?? 'home', code: new URLSearchParams(query).get('kod') ?? '' }
}

function Logo() {
  return <a className="logo" href="#/" aria-label="İz ana sayfa"><span className="logo-mark"><i /><i /><i /></span>iz<span className="logo-dot">.</span></a>
}

function Status({ status, compact = false }: { status: EvidenceStatus; compact?: boolean }) {
  const Icon = status === 'approved' ? CheckCheck : status === 'rejected' ? XCircle : status === 'missing' ? FileText : Clock3
  return <span className={`status ${status} ${compact ? 'compact' : ''}`}><Icon size={13} /><span>{statuses[status]}</span></span>
}

function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current!
    const before = document.activeElement as HTMLElement | null
    dialog.showModal()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = overflow; dialog.close(); before?.focus() }
  }, [])
  return <dialog ref={ref} className={`modal ${wide ? 'wide' : ''}`} onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className="modal-header"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Pencereyi kapat"><X size={20} /></button></div>
    <div className="modal-body">{children}</div>
  </dialog>
}

function App() {
  const [state, setState] = useState<DemoState>({ version: 1, donations: [], expenses: [], totals: { gross: 0, fees: 0, net: 0, spent: 0, remaining: 0 } })
  const [session, setSession] = useState<Session | null>(null)
  const [network, setNetwork] = useState<Network | null>(null)
  const [backendError, setBackendError] = useState('')
  async function refresh() {
    const results = await Promise.allSettled([api<DemoState>('/state'), api<Session | null>('/session'), api<Network>('/network')])
    if (results[0].status === 'fulfilled') { setState(results[0].value); setBackendError('') }
    else setBackendError(results[0].reason.message)
    if (results[1].status === 'fulfilled') setSession(results[1].value)
    if (results[2].status === 'fulfilled') setNetwork(results[2].value)
  }
  useEffect(() => { void refresh(); const timer = setInterval(() => void refresh(), 5000); return () => clearInterval(timer) }, [])
  const [route, setRoute] = useState(getRoute)
  const [notice, setNotice] = useState<Notice | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [expenseOpen, setExpenseOpen] = useState(false)
  const total = totals(state)
  const notify = (message: string, error = false) => setNotice({ message, error })

  useEffect(() => {
    const listener = () => { setRoute(getRoute()); setMenuOpen(false); setSelected(null); window.scrollTo(0, 0) }
    window.addEventListener('hashchange', listener)
    return () => window.removeEventListener('hashchange', listener)
  }, [])
  useEffect(() => { if (notice) { const id = setTimeout(() => setNotice(null), 6500); return () => clearTimeout(id) } }, [notice])
  useEffect(() => {
    const titles: Record<View, string> = { home: 'Bağışta güven ve hesap verebilirlik', how: 'Nasıl çalışır?', donate: 'Bağış yap', fund: 'Kurumun bağış fonu', track: 'Bağış takibi', organization: 'Kurum paneli', reviewer: 'Denetçi paneli' }
    document.title = `İz — ${titles[route.view]}`
    const heading = document.querySelector<HTMLElement>('main h1')
    heading?.setAttribute('tabindex', '-1')
    heading?.focus({ preventScroll: true })
  }, [route.view])

  async function donate(amount: number, key: string) {
    const op = await api<Operation>('/donations', { amount }, key)
    window.location.hash = `/takip?kod=${op.code}`
    await refresh()
  }

  async function saveExpense(expense: Expense) {
    const op = await api<Operation>('/expenses', expense, crypto.randomUUID())
    const confirmed = await submitOperation(op)
    await refresh()
    setExpenseOpen(false)
    setSelected(confirmed.recordId)
    notify('Harcama zincire kaydedildi. Kanıtlarını ekleyebilirsin.')
  }

  return <>
    <header className="site-header">
      <div className="header-inner">
        <Logo />
        <nav className={menuOpen ? 'main-nav open' : 'main-nav'} aria-label="Ana gezinme">
          <a className={route.view === 'home' ? 'active' : ''} aria-current={route.view === 'home' ? 'page' : undefined} href="#/">Ana sayfa</a>
          <a className={route.view === 'how' ? 'active' : ''} aria-current={route.view === 'how' ? 'page' : undefined} href="#/nasil-calisir">Nasıl çalışır?</a>
          <a className={route.view === 'track' ? 'active' : ''} aria-current={route.view === 'track' ? 'page' : undefined} href="#/takip">Bağış takibi</a>
        </nav>
        <div className="header-actions">
          <a className="button primary header-donate" href="#/bagis">Bağış yap <ArrowRight size={15} /></a>
          <button className="icon-button mobile-menu" onClick={() => setMenuOpen(!menuOpen)} aria-expanded={menuOpen} aria-label="Menüyü aç">{menuOpen ? <X /> : <Menu />}</button>
        </div>
      </div>
    </header>

    <main id="main-content">
      {backendError && <div className="container backend-error" role="alert">{backendError} Son alınan veriler gösteriliyor. <button className="text-button" onClick={() => void refresh()}>Yeniden dene</button></div>}
      {route.view === 'home' && <HomePage />}
      {route.view === 'how' && <HowPage />}
      {route.view === 'donate' && <DonationPage onDonate={donate} />}
      {route.view === 'fund' && <FundPage state={state} onSelect={setSelected} />}

      {route.view === 'track' && <Tracking key={route.code} code={route.code} state={state} onSelect={setSelected} notify={notify} />}

      {(route.view === 'organization' || route.view === 'reviewer') && <div className="container workspace-page">
        <div className="breadcrumb"><a href="#/">Ana sayfa</a><ChevronRight size={12} /><span>{route.view === 'organization' ? 'Kurum paneli' : 'Denetçi paneli'}</span><span className="demo-label">YEREL ANVIL · ZİNCİR KAYITLARI</span></div>
        <div className="workspace-heading"><div><div className="eyebrow">BİRLİKTE YAŞAM DERNEĞİ · ÖRNEK KURUM</div><h1>{route.view === 'organization' ? 'Her harcamanın bir kaydı.' : 'Güven, kanıtla başlar.'}</h1><p>{route.view === 'organization' ? 'Kurumun harcamalarını ekle, belgelerini paylaş ve incelemeleri takip et.' : 'Örnek belgeleri incele. Hangi kanıtı, neden onayladığını açıkça belirt.'}</p></div>{route.view === 'organization' && session?.role === 'organization' && <button className="button primary" onClick={() => setExpenseOpen(true)}><Plus size={17} />Harcama ekle</button>}</div>
        <WalletPanel session={session} network={network} onChange={refresh} notify={notify} />
        <div className="workspace-stats"><div><span>Net bağış fonu</span><strong>{money(total.net)} TL</strong></div><div><span>Kayda alınan ödemeler</span><strong>{money(total.spent)} TL</strong></div><div><span>İnceleme bekleyen belge</span><strong>{state.expenses.reduce((count, e) => count + kinds.filter(k => statusOf(e, k) === 'pending').length, 0)} <small>belge</small></strong></div></div>
        <ExpenseList expenses={state.expenses} onSelect={setSelected} />
        <div className="info-box"><Info size={18} /><span>{route.view === 'organization' ? 'Yeni belgeler denetçi incelemesine gönderilir. Kurum panelinden doğrulama onayı verilmez.' : 'Bu paneldeki kararlar demo denetçisine aittir; gerçek bir bağımsız denetim hizmeti değildir.'}</span></div>
      </div>}
    </main>

    <footer className="site-footer"><div className="container footer-inner"><div className="footer-brand"><Logo /><span>Bağışta güven ve hesap verebilirlik.</span></div><div className="footer-links"><span>Hackathon demosu</span><a href="#/kurum" className={route.view === 'organization' ? 'active' : ''}>Kurum paneli</a><a href="#/denetci" className={route.view === 'reviewer' ? 'active' : ''}>Denetçi paneli</a></div><span className="footer-network"><span className="monad-mark" />Yerel Anvil · 31337</span></div></footer>

    {selected && state.expenses.find(e => e.id === selected) && <ExpenseDetail key={selected} expense={state.expenses.find(e => e.id === selected)!} role={session?.role === route.view ? route.view : 'fund'} onClose={() => setSelected(null)} onRefresh={refresh} notify={notify} />}
    {expenseOpen && <NewExpense remaining={total.remaining} onClose={() => setExpenseOpen(false)} onSave={saveExpense} />}

    {notice && createPortal(<div className={`toast ${notice.error ? 'error' : ''}`} role={notice.error ? 'alert' : 'status'}>{notice.error ? <Info size={20} /> : <CircleCheck size={20} />}<span>{notice.message}</span><button aria-label="Bildirimi kapat" onClick={() => setNotice(null)}><X size={16} /></button></div>, document.querySelector('dialog[open]') ?? document.body)}
  </>
}

function DonationPage({ onDonate }: { onDonate: (amount: number, key: string) => Promise<void> }) {
  return <div className="container donate-page">
    <div className="breadcrumb"><a href="#/">Ana sayfa</a><ChevronRight size={12} /><span>Bağış yap</span><span className="demo-label">DEMO · GERÇEK PARA ALINMAZ</span></div>
    <header className="page-heading"><span className="eyebrow">BAĞIŞ VE SONRASININ TAKİBİ</span><h1>Kuruma bağış yap.</h1><p>Alıcıyı ve kesintiyi gör. Bağışından sonra kurumun bu fonu nasıl kullandığını takip et.</p></header>
    <div className="donate-layout">
      <div className="recipient-info">
        <span className="section-label">BAĞIŞ ALICISI</span>
        <div className="recipient-heading"><span className="recipient-icon"><Building2 size={29} strokeWidth={1.5} /></span><div><h2>Birlikte Yaşam Derneği</h2><span className="sample-tag">Örnek kurum</span></div></div>
        <p>Afet sonrası barınma ve temel ihtiyaç desteği için çalışan örnek kurum.</p>
        <dl className="recipient-facts"><div><dt>Bağışın aktarılacağı yer</dt><dd>Kurumun ortak bağış fonu</dd></div><div><dt>İzleyebileceğin bilgiler</dt><dd>Harcamalar, belgeler ve inceleme sonuçları</dd></div></dl>
        <a className="text-button" href="#/kurum-kaydi">Kurumun harcamalarını incele <ArrowUpRight size={16} /></a>
        <div className="after-donation"><h3>Bağıştan sonra</h3><ol><li>Bağış tutarını ve kesintiyi içeren takip kaydın oluşur.</li><li>Kurumun fondan yaptığı ödemeleri görebilirsin.</li><li>Her harcamanın belgelerini ve denetçi gerekçesini açabilirsin.</li></ol></div>
      </div>
      <DonationCard onDonate={onDonate} />
    </div>
  </div>
}

function DonationCard({ onDonate }: { onDonate: (amount: number, key: string) => Promise<void> }) {
  const [amount, setAmount] = useState('1000')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const requestKey = useRef(crypto.randomUUID())
  const value = Number(amount)
  const valid = validAmount(value)
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!valid) { setError('1 ile 1.000.000 TL arasında, en fazla iki ondalıklı bir tutar gir.'); return }
    setBusy(true)
    try { await onDonate(value, requestKey.current) } catch (e) { setError(walletError(e)) } finally { setBusy(false) }
  }
  return <section className="donation-card" aria-label="Bağış tutarı ve kesinti">
    <h2>Bağış tutarı</h2><p className="muted">Katkının ne kadarının fona ayrılacağını gör.</p>
    <form onSubmit={submit}>
      <div className="amount-presets">{[250, 500, 1000, 2500].map(preset => <button type="button" key={preset} className={value === preset ? 'selected' : ''} aria-pressed={value === preset} onClick={() => { setAmount(String(preset)); requestKey.current = crypto.randomUUID(); setError('') }}>{money(preset)} ₺</button>)}</div>
      <label className="amount-input"><span className="sr-only">Bağış tutarı</span><input aria-label="Bağış tutarı" type="number" min="1" max="1000000" step="0.01" value={amount} onChange={event => { setAmount(event.target.value); requestKey.current = crypto.randomUUID(); setError('') }} required /><span>TL</span></label>
      <div className="fee-breakdown"><div><span>Bağış tutarı</span><span>{valid ? money(value) : '—'} TL</span></div><div><span>Platform payı <span className="fee-tag">%2 · demo</span></span><span>{valid ? money(feeFor(value)) : '—'} TL</span></div><div><strong>Kurumun fonuna ayrılan</strong><strong>{valid ? money(value - feeFor(value)) : '—'} TL</strong></div></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button primary donate-button" disabled={busy} type="submit">{busy ? 'Kaydediliyor…' : 'Demo bağışı yap'}<ArrowRight size={17} /></button>
      <div className="donation-footnote"><Info size={14} /><span>Gerçek ödeme yapılmaz. Örnek bir bağış kaydı oluşur.</span></div>
    </form>
  </section>
}

function FundPage({ state, onSelect }: { state: DemoState; onSelect: (id: string) => void }) {
  const total = totals(state)
  return <div className="container fund-page">
    <div className="breadcrumb"><a href="#/">Ana sayfa</a><ChevronRight size={12} /><span>Kurumun bağış fonu</span><span className="demo-label">ÖRNEK KURUM VE KAYITLAR</span></div>
    <header className="page-heading"><span className="eyebrow">KURUMUN BAĞIŞ FONU</span><h1>Birlikte Yaşam Derneği</h1><p>Kuruma yapılan bağışların toplamını, fonun kullanımını ve harcama kanıtlarını incele.</p></header>
    <div className="financial-strip"><div><span>Net bağış fonu</span><strong>{money(total.net)} <small>TL</small></strong></div><div><span>Kayda alınan ödemeler</span><strong>{money(total.spent)} <small>TL</small></strong></div><div><span>Kayda göre kalan</span><strong>{money(total.remaining)} <small>TL</small></strong></div></div>
    <div className="fund-fees"><span>Toplam bağış: {money(total.gross)} TL</span><span>Platform payı: {money(total.fees)} TL (%2 · demo)</span></div>
    {!!state.invalidRecords && <details className="technical-details"><summary><Info size={17} />{state.invalidRecords} zincir kaydı doğrulanamadı<span>İncele</span></summary><div className="anchor-box"><p>Bu kayıtlar uygulama kurallarını karşılamadığı için fon dökümüne dahil edilmedi.</p><dl className="chain-facts">{state.invalid?.map(record => <div key={record.uid}><dt>{record.reason}</dt><dd>{record.uid}</dd></div>)}</dl></div></details>}
    <div className="section-heading"><div><h2>Harcama kayıtları</h2><p>Bir harcamayı açarak belgelerini ve denetçi kararını inceleyebilirsin.</p></div><span className="tiny-label">{state.expenses.length} KAYIT</span></div>
    <ExpenseList expenses={state.expenses} onSelect={onSelect} />
    <div className="fund-explanation"><Info size={17} /><p>Bağışlar kurumun ortak fonunda toplanır. Buradaki harcamalar fonun tamamına aittir; tek bir bağış belirli bir ödemeyle eşleştirilmez.</p><a href="#/nasil-calisir" className="text-button">İnceleme nasıl yapılır? <ArrowUpRight size={15} /></a></div>
  </div>
}

function ExpenseList({ expenses, onSelect }: { expenses: Expense[]; onSelect: (id: string) => void }) {
  return <div className="expense-table"><div className="expense-table-head"><span>HARCAMA / TARİH</span><span>TUTAR</span><span>KANIT DURUMU</span><span /></div>
    {expenses.map(expense => {
      const Icon = expense.category === 'Barınma' ? Tent : expense.category === 'Lojistik' ? Truck : Utensils
      return <button className="expense-row" key={expense.id} onClick={() => onSelect(expense.id)} aria-label={`${expense.title} kanıtlarını incele`}>
        <span className="expense-title"><span className={`category-icon ${expense.category === 'Lojistik' ? 'sand' : expense.category === 'Gıda' ? 'blue' : ''}`}><Icon size={21} strokeWidth={1.5} /></span><span><strong>{expense.title}</strong><small>{dateLabel(expense.date)}</small></span></span>
        <strong className="expense-amount">{money(expense.amount)} <small>TL</small></strong>
        <span className="proof-dots">{kinds.map(kind => <span className={`proof-item ${statusOf(expense, kind)}`} key={kind} aria-label={`${labels[kind]}: ${statuses[statusOf(expense, kind)]}`}><span>{statusOf(expense, kind) === 'approved' ? <Check size={11} /> : statusOf(expense, kind) === 'rejected' ? <X size={11} /> : statusOf(expense, kind) === 'missing' ? '–' : <Clock3 size={10} />}</span><small>{labels[kind]}</small><em>{statuses[statusOf(expense, kind)]}</em></span>)}</span><ChevronRight className="row-chevron" size={17} />
      </button>
    })}
    {!expenses.length && <div className="empty-state"><FileText size={25} /><h3>Henüz harcama yok.</h3><p>İlk kayıt eklendiğinde burada görünecek.</p></div>}
  </div>
}

function AnchorControl({ anchor, notify }: { anchor?: Anchor; notify: (message: string, error?: boolean) => void }) {
  const [busy, setBusy] = useState(false)
  const [verified, setVerified] = useState<string | null>(null)
  async function verify() {
    if (!anchor?.uid) return
    setVerified(null)
    setBusy(true)
    try {
      const result = await api<{ valid: boolean; contentMatches: boolean | null }>(`/records/${anchor.uid}/verify`)
      setVerified(!result.valid ? 'Zincir kaydı uygulama kurallarını karşılamıyor.' : result.contentMatches === false ? 'Zincir kaydı mevcut; bağlı içerik eksik veya özeti eşleşmiyor.' : result.contentMatches === true ? 'Zincir kaydı ve saklanan içeriğin özeti eşleşiyor. Bu kontrol belgenin gerçekliğini doğrulamaz.' : 'Zincirdeki bağış kaydı doğrulandı. Bu kayıt gerçek ödeme kanıtı değildir.')
    } catch (e) { notify(walletError(e), true) } finally { setBusy(false) }
  }
  return <div className="anchor-box"><div className="anchor-heading"><Fingerprint size={18} /><strong>Yerel EAS kayıt durumu</strong><span className={`chain-status ${anchor?.status ?? ''}`}>{anchor?.status === 'confirmed' ? 'Zincire kaydedildi' : 'Onay bekliyor'}</span></div>
    <p>Yetkili cüzdanın imzaladığı kayıt, yerel Anvil ağında tutulur.</p>
    {anchor && <dl className="chain-facts"><div><dt>İşlem</dt><dd>{anchor.hash}</dd></div><div><dt>Kayıt UID</dt><dd>{anchor.uid}</dd></div><div><dt>İmzalayan</dt><dd>{anchor.attester}</dd></div></dl>}
    {anchor?.uid && <button className="button outline" disabled={busy} onClick={() => void verify()}><ShieldCheck size={15} />{busy ? 'Kontrol ediliyor…' : 'Bütünlüğü kontrol et'}</button>}
    {verified && <p role="status">{verified}</p>}
  </div>
}

function Tracking({ code, state, onSelect, notify }: { code: string; state: DemoState; onSelect: (id: string) => void; notify: (message: string, error?: boolean) => void }) {
  const [input, setInput] = useState(code)
  const [donation, setDonation] = useState<Donation | null>(null)
  const [operation, setOperation] = useState<Operation | null>(null)
  const [error, setError] = useState<{ message: string; notFound: boolean } | null>(null)
  const [loading, setLoading] = useState(Boolean(code))
  useEffect(() => {
    if (!code) return
    let active = true
    async function load() {
      try {
        const result = await api<{ donation: Donation | null; operation: Operation }>('/donations/lookup', { code })
        if (active) { setDonation(result.donation); setOperation(result.operation); setError(null) }
      } catch (e) {
        if (active) {
          const notFound = e instanceof ApiError && e.status === 404
          setError({ message: walletError(e), notFound })
          if (notFound) { setDonation(null); setOperation(null) }
        }
      } finally { if (active) setLoading(false) }
    }
    void load(); const timer = setInterval(() => void load(), 2000)
    return () => { active = false; clearInterval(timer) }
  }, [code])
  const total = totals(state)
  return <div className="container tracking-page"><div className="breadcrumb"><a href="#/">Ana sayfa</a><ChevronRight size={12} /><span>Bağışımı takip et</span><span className="demo-label">DEMO · ÖRNEK VERİLER</span></div><div className="tracking-intro"><span className="round-feature"><Fingerprint size={27} /></span><div className="eyebrow">BAĞIŞININ KULLANIMINI TAKİP ET</div><h1>Bağış takibi</h1><p>Takip kodunla tutarını, kesintiyi ve kurumun harcama kayıtlarını incele.</p></div>
    <form className="tracking-search" onSubmit={event => { event.preventDefault(); window.location.hash = `/takip?kod=${encodeURIComponent(input.trim().toUpperCase())}` }}><label className="sr-only" htmlFor="tracking-code">Takip kodu</label><Search size={18} /><input id="tracking-code" value={input} onChange={event => setInput(event.target.value)} placeholder="Takip kodunu gir · IZ-…" required /><button className="button primary">Sorgula <ArrowRight size={16} /></button></form>
    {!code && <div className="tracking-example"><span>Henüz bir takip kodun yok mu?</span><a href="#/takip?kod=IZ-DEMO-1001">Örnek bağışı incele <ArrowUpRight size={14} /></a></div>}
    {code && error && <div className="empty-state" role="status"><Search size={30} /><h2>{error.notFound ? 'Bu kodla bir bağış bulunamadı.' : 'Bağış kaydı şu anda sorgulanamıyor.'}</h2><p>{error.message}</p>{error.notFound ? <a className="text-button" href="#/takip?kod=IZ-DEMO-1001">Örnek kaydı aç <ArrowRight size={15} /></a> : <p>{donation ? 'Son alınan kayıt aşağıda. ' : ''}Bağlantı yeniden kontrol ediliyor.</p>}</div>}
    {loading && <p className="muted" role="status">Bağış kaydı sorgulanıyor…</p>}
    {operation && !donation && <div className="info-box" role="status"><Info size={18} /><p>{operation.status === 'failed' || operation.status === 'invalid' ? operation.error : 'Örnek bağış kaydın alındı. Zincir onayı bekleniyor; bu takip bağlantısını sakla.'}</p></div>}
    {donation && <div className="tracking-result"><div className="receipt-card"><div className="receipt-heading"><span className="round-feature"><Check size={25} /></span><div><span className="eyebrow">DEMO BAĞIŞ KAYDI</span><h2>Bağış kaydın</h2></div><span className="receipt-code">{donation.id}</span></div><div className="receipt-numbers"><div><span>Bağışın</span><strong>{money(donation.amount)} TL</strong></div><div><span>Platform payı</span><strong>{money(donation.fee)} TL</strong></div><div><span>Kurumun fonuna ayrılan</span><strong>{money(donation.amount - donation.fee)} TL</strong></div></div><div className="receipt-bottom"><span>{dateLabel(donation.date)} · Birlikte Yaşam Derneği</span><button className="text-button" onClick={async () => { try { await navigator.clipboard.writeText(`${location.origin}${location.pathname}#/takip?kod=${donation.id}`); notify('Takip bağlantısı kopyalandı. Başka bir tarayıcıda da bu kayda ulaşabilirsin.') } catch { notify('Bağlantı kopyalanamadı.', true) } }}><Copy size={14} />Takip bağlantısı</button></div></div>
      <div className="info-box"><Info size={18} /><p>Bağışın kurumun ortak fonuna katıldı. Aşağıdaki harcamalar bu fonun tamamına aittir. Tek bir bağış belirli bir harcamayla eşleştirilmez.</p></div>
      <details className="technical-details"><summary><Fingerprint size={17} />Zincir kaydı ve bütünlük<span>İncele</span></summary><AnchorControl anchor={donation.anchor} notify={notify} /></details>
      <div className="workspace-stats"><div><span>Kurumun net bağış fonu</span><strong>{money(total.net)} TL</strong></div><div><span>Kayda alınan ödemeler</span><strong>{money(total.spent)} TL</strong></div><div><span>Kayda göre kalan</span><strong>{money(total.remaining)} TL</strong></div></div>
      <div className="section-heading"><div><h2>Kurumun harcamaları</h2><p>Her kayıt kendi kanıtıyla değerlendirilir.</p></div><a className="text-button" href="#/kurum-kaydi">Kurumun fonunu incele <ArrowRight size={16} /></a></div><ExpenseList expenses={state.expenses} onSelect={onSelect} />
    </div>}
  </div>
}

function ExpenseDetail({ expense, role, onClose, onRefresh, notify }: { expense: Expense; role: View; onClose: () => void; onRefresh: () => Promise<void>; notify: (message: string, error?: boolean) => void }) {
  const [kind, setKind] = useState<EvidenceKind>('purchase')
  const [reason, setReason] = useState('')
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState(false)
  const [previewUrl, setPreviewUrl] = useState('')
  const [previewText, setPreviewText] = useState('')
  const [previewError, setPreviewError] = useState('')
  const [shared, setShared] = useState(false)
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null)
  const [paymentFile, setPaymentFile] = useState<File | null>(null)
  const [selectedFile, setSelectedFile] = useState('invoice')
  const version = latest(expense.evidence[kind])
  const [olderId, setOlderId] = useState('')
  const legacy = kind === 'purchase' ? [...expense.evidence.invoice, ...expense.evidence.payment] : []
  const shown = [...expense.evidence[kind], ...legacy].find(v => v.id === olderId) ?? version
  const documents = shown?.files ?? (shown ? [{ kind, name: shown.name, mime: shown.mime, fileUrl: shown.fileUrl }] : [])
  const previewFile = documents.find(file => file.kind === selectedFile) ?? documents[0]

  useEffect(() => {
    if (!previewFile?.fileUrl || !preview) return
    let active = true, url = ''
    setPreviewUrl(''); setPreviewError(''); setPreviewText('')
    fetch(previewFile.fileUrl).then(async response => {
      if (!response.ok) throw new Error((await response.json()).error)
      const blob = await response.blob()
      const text = previewFile.mime === 'text/plain' ? await blob.text() : ''
      if (active) { url = URL.createObjectURL(blob); setPreviewUrl(url); setPreviewText(text) }
    }).catch(e => { if (active) setPreviewError(e.message) })
    return () => { active = false; if (url) URL.revokeObjectURL(url) }
  }, [previewFile?.fileUrl, previewFile?.mime, preview])

  async function upload(files: File[]) {
    if (files.some(file => file.size > 1_000_000)) { notify('Her belge en fazla 1 MB olabilir.', true); return }
    setUploading(true)
    try {
      const uploaded = await Promise.all(files.map(async (file, index) => {
        const content = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(file) })
        return { kind: index === 0 ? 'invoice' : 'payment', name: file.name, mime: file.type, content }
      }))
      const payload = kind === 'purchase' ? { kind, files: uploaded, shared } : { ...uploaded[0], kind, shared }
      const op = await api<Operation>(`/expenses/${expense.id}/evidence`, payload, crypto.randomUUID())
      await submitOperation(op); await onRefresh(); setOlderId(''); setPreview(false); setInvoiceFile(null); setPaymentFile(null)
      notify(`${labels[kind]} kaydı zincire kaydedildi ve incelemeye açıldı.`)
    } catch (e) { notify(walletError(e), true) } finally { setUploading(false) }
  }

  async function review(status: EvidenceStatus) {
    if (!version?.anchor?.uid || !reason.trim()) return
    setUploading(true)
    try {
      const op = await api<Operation>(`/evidence/${version.anchor.uid}/reviews`, { decision: status, reason: reason.trim() }, crypto.randomUUID())
      await submitOperation(op); await onRefresh(); setReason('')
      notify('Gerekçeli denetçi kararı zincire kaydedildi.')
    } catch (e) { notify(walletError(e), true) } finally { setUploading(false) }
  }

  return <Modal title="Harcamanın izini sür." onClose={onClose} wide>
    <div className="expense-detail-title"><span className="category-icon"><FileText size={24} /></span><div><span className="eyebrow">{expense.id} · {expense.category}</span><h2>{expense.title}</h2></div><strong>{money(expense.amount)} <small>TL</small></strong></div>
    <p className="detail-description">{expense.description}</p><div className="detail-facts"><span><Building2 size={15} />{expense.recipient}</span><span>{dateLabel(expense.date)}</span></div>
    <div className="evidence-tabs" role="tablist" aria-label="Doğrulama aşaması">{kinds.map(k => <button key={k} role="tab" disabled={uploading} aria-selected={kind === k} className={kind === k ? 'active' : ''} onClick={() => { setKind(k); setReason(''); setOlderId(''); setPreview(false) }}><span>{labels[k]}</span><Status status={statusOf(expense, k)} compact /></button>)}</div>
    <p className="muted">{kind === 'purchase' ? 'Fatura ve ödeme belgesi birlikte sunulur, tek kararla değerlendirilir. Bir belge değiştiğinde paketin tamamı yeniden incelenir.' : 'Teslim tutanağı veya alıcı teyidi bu aşamada değerlendirilir. Satın alma onayı teslim alma onayı yerine geçmez.'}</p>
    {shown ? <div className="evidence-content">
      {legacy.some(v => v.id === shown.id) && <p className="info-box">Önceki ayrı belge kaydı. Bu karar ortak satın alma onayı değildir.</p>}
      {documents.map(document => <div className="document-row" key={document.kind}><div><FileText size={25} /><span><strong>{document.name}</strong><small>{shown.files && `${labels[document.kind]} · `}{dateLabel(shown.createdAt)} · {shown.shared ? 'Paylaşıma açık belge' : 'Kurum ve denetçiye açık'}</small></span></div><button className="text-button" aria-label={`${document.name} belgesini incele`} onClick={() => { setSelectedFile(document.kind); setPreview(previewFile?.kind === document.kind ? !preview : true) }}>{preview && previewFile?.kind === document.kind ? 'Belgeyi kapat' : 'Belgeyi incele'} <ExternalLink size={14} /></button></div>)}
      {!documents.length && <p role="alert">Paket dosyaları erişilemiyor. Bütünlük kontrolüyle kaydı inceleyebilirsin.</p>}
      {preview && previewFile && <div className="document-preview">{previewError ? <p role="alert">{previewError}</p> : !previewUrl ? <p>Belge yükleniyor…</p> : <>{previewFile.mime?.startsWith('image/') ? <img src={previewUrl} alt={previewFile.name} /> : previewFile.mime === 'application/pdf' ? <iframe src={previewUrl} title={previewFile.name} /> : <pre>{previewText}</pre>}<a href={previewUrl} download={previewFile.name} className="text-button">Belgeyi indir <ArrowDownLeft size={14} /></a></>}</div>}

      <div className={`review-note ${shown.status}`}><div><Status status={shown.status} /><span>{shown.reviewer ?? 'Kurum bildirimi'}</span></div><p>{shown.reason}</p></div>
      <details className="technical-details"><summary><Fingerprint size={17} />Zincir kaydı ve bütünlük<span>İncele</span></summary><AnchorControl key={shown.id} anchor={shown.anchor} notify={notify} /></details>
      {shown.reviewAnchor && <details className="technical-details"><summary>Denetçi kararının zincir kaydı</summary><AnchorControl anchor={shown.reviewAnchor} notify={notify} /></details>}
    </div> : <div className="empty-state"><PackageCheck size={30} /><h3>Henüz {labels[kind].toLocaleLowerCase('tr')} kanıtı sunulmadı.</h3><p>Kurum belge eklediğinde burada görünecek.</p></div>}
    {(expense.evidence[kind].length > 1 || legacy.length > 0) && <label className="field version-field">Belge geçmişi<select value={olderId || version?.id || ''} onChange={event => { setOlderId(event.target.value); setPreview(false); setReason('') }}>{!version && <option value="">Güncel satın alma paketi sunulmadı</option>}{[...expense.evidence[kind]].reverse().map((v, i) => <option key={v.id} value={v.id}>{i === 0 ? 'Güncel' : 'Önceki sürüm'} · {v.name} · {statuses[v.status]}</option>)}{legacy.map(v => <option key={v.id} value={v.id}>Eski ayrı belge · {v.name} · {statuses[v.status]}</option>)}</select></label>}
    {role === 'organization' && <label className="share-choice"><input type="checkbox" checked={shared} onChange={event => setShared(event.target.checked)} />Yükleyeceğim örnek belge bağışçılarla paylaşılabilir.</label>}
    {role === 'organization' && (kind === 'purchase' ? <div className="purchase-upload"><h3>{version ? 'Yeni satın alma sürümü' : 'Satın alma belgelerini yükle'}</h3><p className="muted">Fatura ve ödeme belgesi · her dosya en fazla 1 MB · PDF, PNG, JPEG veya TXT</p><label className="field">Fatura dosyası<input key={`invoice-${version?.id}`} type="file" accept=".pdf,.png,.jpg,.jpeg,.txt" disabled={uploading} onChange={event => setInvoiceFile(event.target.files?.[0] ?? null)} /></label><label className="field">Ödeme belgesi dosyası<input key={`payment-${version?.id}`} type="file" accept=".pdf,.png,.jpg,.jpeg,.txt" disabled={uploading} onChange={event => setPaymentFile(event.target.files?.[0] ?? null)} /></label><button className="button primary" disabled={uploading || !invoiceFile || !paymentFile} onClick={() => { if (invoiceFile && paymentFile) void upload([invoiceFile, paymentFile]) }}><Upload size={16} />{uploading ? 'Yükleniyor…' : 'Satın alma belgelerini gönder'}</button></div> : <div className="upload-area"><Upload size={20} /><div><strong>{version ? 'Yeni teslim alma sürümü ekle' : 'Teslim alma belgesi yükle'}</strong><span>PDF, PNG, JPEG veya TXT · en fazla 1 MB · örnek belgeler kullan</span></div><label className="button outline">{uploading ? 'Yükleniyor…' : 'Belge seç'}<input type="file" accept=".pdf,.png,.jpg,.jpeg,.txt" className="sr-only" disabled={uploading} onChange={event => { const file = event.target.files?.[0]; if (file) void upload([file]); event.target.value = '' }} /></label></div>)}
    {role === 'reviewer' && version?.status === 'pending' && (!olderId || olderId === version.id) && <div className="review-form"><label className="field">İnceleme gerekçesi<textarea value={reason} onChange={event => setReason(event.target.value)} placeholder="Neyi kontrol ettin? Kararını hangi bulguya dayandırıyorsun?" rows={3} required /></label><div><button className="button primary" disabled={uploading || !reason.trim()} onClick={() => review('approved')}><Check size={16} />Onayla</button><button className="button outline" disabled={uploading || !reason.trim()} onClick={() => review('requested')}>Ek belge iste</button><button className="button danger" disabled={uploading || !reason.trim()} onClick={() => review('rejected')}>Reddet</button></div></div>}
    <p className="detail-disclaimer"><Info size={14} />Bir belgenin zincire kaydı, gerçekliğinin veya teslimatın doğrulanması anlamına gelmez.</p>
  </Modal>
}

function NewExpense({ remaining, onClose, onSave }: { remaining: number; onClose: () => void; onSave: (expense: Expense) => Promise<void> }) {
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const amount = Number(data.get('amount'))
    if (['title', 'recipient', 'description'].some(field => !String(data.get(field)).trim())) { setError('Başlık, alıcı ve açıklama boş bırakılamaz.'); return }
    if (!validAmount(amount) || amount > remaining) { setError(`Tutar 1 TL ile kalan ${money(remaining)} TL fon arasında olmalı.`); return }
    setBusy(true)
    try { await onSave({ id: `IZ-H${crypto.randomUUID().slice(0, 6).toUpperCase()}`, title: String(data.get('title')).trim(), category: data.get('category') as Expense['category'], recipient: String(data.get('recipient')).trim(), amount, date: String(data.get('date')), description: String(data.get('description')).trim(), evidence: { payment: [], invoice: [], delivery: [], purchase: [] } }) } catch (e) { setError(walletError(e)) } finally { setBusy(false) }
  }
  return <Modal title="Yeni harcama kaydı" onClose={onClose}><form className="expense-form" onSubmit={submit}><p className="muted">Harcama bilgilerini ekle. Kanıt belgelerini bir sonraki adımda yükleyebilirsin.</p><label className="field">Harcama başlığı<input name="title" placeholder="Örn. Aile tipi çadır alımı" required maxLength={80} /></label><label className="field">Alıcı / tedarikçi<input name="recipient" placeholder="Örnek tedarikçi adı" required maxLength={100} /></label><div className="form-columns"><label className="field">Tutar (TL)<input name="amount" type="number" min="1" max={Math.max(1, remaining)} step="0.01" required /></label><label className="field">Kategori<select name="category"><option>Barınma</option><option>Lojistik</option><option>Gıda</option></select></label></div><label className="field">Ödeme tarihi<input name="date" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required /></label><label className="field">Açıklama<textarea name="description" rows={3} placeholder="Harcamanın amacı ve kapsamı" required maxLength={1000} /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button primary" type="submit" disabled={busy}><Plus size={17} />{busy ? 'İmza ve zincir onayı bekleniyor…' : 'Harcamayı kaydet'}</button></form></Modal>
}

export default App
