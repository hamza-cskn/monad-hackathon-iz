import { expect, test, type Page } from '@playwright/test'

async function wallet(page: Page, role: 'organization' | 'reviewer', reject = false) {
  const response = await fetch(`${process.env.IZ_API_URL}/api/network`)
  const network = await response.json()
  const account = network.accounts[role]
  await page.exposeFunction('requestLocalWallet', async ({ method, params = [] }: { method: string; params?: unknown[] }) => {
    if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [account]
    if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') return null
    if (method === 'eth_sendTransaction' && reject) throw new Error('User rejected request 4001')
    const rpc = await fetch(process.env.IZ_RPC_URL!, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) })
    const body = await rpc.json()
    if (body.error) throw new Error(body.error.message)
    return body.result
  })
  await page.addInitScript(() => {
    Object.assign(window, { ethereum: { isMetaMask: true, on() {}, removeListener() {}, request: (args: unknown) => (window as unknown as { requestLocalWallet: (args: unknown) => Promise<unknown> }).requestLocalWallet(args) } })
  })
}
async function login(page: Page, role: 'organization' | 'reviewer') {
  await page.goto(role === 'organization' ? '/#/kurum' : '/#/denetci')
  await page.getByRole('button', { name: 'Cüzdanla giriş yap', exact: true }).click()
  await expect(page.locator('.wallet-panel strong')).toHaveText(role === 'organization' ? 'Kurum oturumu' : 'Denetçi oturumu')
}
async function uploadPurchase(page: Page, version: number) {
  await page.getByLabel('Fatura dosyası', { exact: true }).setInputFiles({ name: `fatura-v${version}.txt`, mimeType: 'text/plain', buffer: Buffer.from(`Örnek fatura v${version}: 1000 TL.`) })
  await expect(page.getByRole('button', { name: 'Satın alma belgelerini gönder' })).toBeDisabled()
  await page.getByLabel('Ödeme belgesi dosyası', { exact: true }).setInputFiles({ name: `odeme-v${version}.txt`, mimeType: 'text/plain', buffer: Buffer.from(`Örnek ödeme v${version}: 1000 TL.`) })
  await page.getByRole('button', { name: 'Satın alma belgelerini gönder' }).click()
  await expect(page.locator('.evidence-content')).toContainText(`fatura-v${version}.txt`)
  await expect(page.locator('.evidence-content')).toContainText(`odeme-v${version}.txt`)
}

test('donation is recorded on the local chain and can be opened in another browser', async ({ page, browser }) => {
  await page.goto('/#/bagis')
  await page.getByRole('button', { name: '500 ₺', exact: true }).click()
  await expect(page.locator('.fee-breakdown')).toContainText('10 TL')
  await page.getByRole('button', { name: 'Demo bağışı yap', exact: true }).click()
  await expect(page).toHaveURL(/#\/takip\?kod=IZ-/)
  await expect(page.locator('.receipt-numbers')).toContainText('490 TL')
  const url = page.url()
  const other = await browser.newContext()
  try {
    const tab = await other.newPage(); await tab.goto(url)
    await expect(tab.locator('.receipt-numbers')).toContainText('490 TL')
    await tab.locator('summary').filter({ hasText: 'Zincir kaydı ve bütünlük' }).click()
    await expect(tab.locator('.chain-status')).toHaveText('Zincire kaydedildi')
    await tab.getByRole('button', { name: 'Bütünlüğü kontrol et' }).click()
    await expect(tab.locator('.anchor-box')).toContainText('Zincirdeki bağış kaydı doğrulandı. Bu kayıt gerçek ödeme kanıtı değildir.')
    await expect(tab.getByRole('link', { name: 'İşlemi gör' })).toHaveCount(0)
    expect(await tab.evaluate(() => localStorage.getItem('iz-demo-v1'))).toBeNull()
  } finally { await other.close() }
})

test('invalid donations never create a receipt', async ({ page }) => {
  await page.goto('/#/bagis')
  for (const amount of ['-10', '0', '1.001', '1000001']) {
    await page.getByRole('spinbutton', { name: 'Bağış tutarı' }).fill(amount)
    await page.getByRole('button', { name: 'Demo bağışı yap', exact: true }).click()
    await expect(page).not.toHaveURL(/takip/)
  }
})

test('institution and reviewer sign separately and document versions preserve decisions', async ({ page, browser }) => {
  test.setTimeout(45_000)
  await page.goto('/#/denetci')
  await page.getByRole('button', { name: 'Kurum olarak dene' }).click()
  await expect(page).toHaveURL(/#\/kurum$/)
  await expect(page.locator('.wallet-panel strong')).toHaveText('Kurum oturumu')
  await page.getByRole('button', { name: 'Harcama ekle', exact: true }).click()
  await page.getByLabel('Harcama başlığı').fill('Tarayıcı testi battaniye alımı')
  await page.getByLabel('Alıcı / tedarikçi').fill('Örnek tedarikçi')
  await page.getByLabel('Tutar (TL)').fill('1000')
  await page.getByLabel('Açıklama').fill('10 adet battaniye için örnek ödeme.')
  await page.getByRole('button', { name: 'Harcamayı kaydet' }).click()
  await expect(page.getByRole('dialog')).toContainText('Tarayıcı testi battaniye alımı')
  await expect(page.getByRole('button', { name: 'Onayla', exact: true })).toHaveCount(0)
  await expect(page.getByRole('tab')).toHaveCount(2)
  await uploadPurchase(page, 1)
  const reviewerContext = await browser.newContext()
  try {
    const reviewer = await reviewerContext.newPage(); await reviewer.goto('/#/kurum')
    await reviewer.getByRole('button', { name: 'Denetçi olarak dene' }).click()
    await expect(reviewer).toHaveURL(/#\/denetci$/)
    await expect(reviewer.locator('.wallet-panel strong')).toHaveText('Denetçi oturumu')
    await reviewer.getByRole('button', { name: 'Tarayıcı testi battaniye alımı kanıtlarını incele' }).click()
    await expect(reviewer.getByRole('tab')).toHaveCount(2)
    await reviewer.getByRole('button', { name: 'fatura-v1.txt belgesini incele' }).click()
    await expect(reviewer.locator('.document-preview')).toContainText('Örnek fatura v1: 1000 TL.')
    await reviewer.getByRole('button', { name: 'odeme-v1.txt belgesini incele' }).click()
    await expect(reviewer.locator('.document-preview')).toContainText('Örnek ödeme v1: 1000 TL.')
    await expect(reviewer.getByRole('button', { name: 'Onayla', exact: true })).toBeDisabled()
    await reviewer.getByLabel('İnceleme gerekçesi').fill('Belgedeki tutar ve alıcı harcama kaydıyla eşleşiyor.')
    await reviewer.getByRole('button', { name: 'Onayla', exact: true }).click()
    await expect(reviewer.locator('.review-note')).toContainText('Doğrulandı')
    await reviewer.getByText('Denetçi kararının zincir kaydı', { exact: true }).click()
    await expect(reviewer.locator('.chain-facts').last()).toContainText('0x')
    await expect(reviewer.getByRole('tab', { name: /Teslim alma/ })).toContainText('Sunulmadı')
    await page.getByRole('tab', { name: /Teslim alma/ }).click()
    await page.locator('input[type=file]').setInputFiles({ name: 'teslim.txt', mimeType: 'text/plain', buffer: Buffer.from('10 battaniye teslim alındı.') })
    await expect(page.locator('.document-row')).toContainText('teslim.txt')
    await reviewer.getByRole('tab', { name: /Teslim alma/ }).click()
    await expect(reviewer.locator('.document-row')).toContainText('teslim.txt', { timeout: 10_000 })
    await reviewer.getByLabel('İnceleme gerekçesi').fill('Teslim tutanağında 10 battaniye teyit edildi.')
    await reviewer.getByRole('button', { name: 'Onayla', exact: true }).click()
    await expect(reviewer.locator('.review-note')).toContainText('Doğrulandı')
    await page.reload()
    await page.getByRole('button', { name: 'Tarayıcı testi battaniye alımı kanıtlarını incele' }).click()
    await expect(page.locator('.review-note')).toContainText('Doğrulandı')
    await uploadPurchase(page, 2)
    await expect(page.locator('.review-note')).toContainText('İnceleniyor')
    await expect(page.getByRole('tab', { name: /Teslim alma/ })).toContainText('Doğrulandı')
    await page.getByLabel('Belge geçmişi').selectOption({ label: 'Önceki sürüm · Satın alma · fatura-v1.txt · Doğrulandı' })
    await expect(page.locator('.review-note')).toContainText('tutar ve alıcı')
  } finally { await reviewerContext.close() }
})

test('unauthenticated visitors cannot write institution or reviewer records', async ({ page }) => {
  await page.goto('/#/kurum')
  await expect(page.getByRole('button', { name: 'Cüzdanla giriş yap' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Harcama ekle', exact: true })).toHaveCount(0)
  await page.goto('/#/denetci')
  await page.getByRole('button', { name: 'Sahaya nakliye kanıtlarını incele' }).click()
  await page.getByRole('tab', { name: /Teslim alma/ }).click()
  await expect(page.getByRole('button', { name: 'Onayla', exact: true })).toHaveCount(0)
})

test('wallet rejection never publishes the unsigned expense', async ({ page }) => {
  await wallet(page, 'organization', true); await login(page, 'organization')
  await page.getByRole('button', { name: 'Harcama ekle', exact: true }).click()
  await page.getByLabel('Harcama başlığı').fill('İmzalanmayan harcama')
  await page.getByLabel('Alıcı / tedarikçi').fill('Örnek tedarikçi')
  await page.getByLabel('Tutar (TL)').fill('100')
  await page.getByLabel('Açıklama').fill('Cüzdan reddi denemesi.')
  await page.getByRole('button', { name: 'Harcamayı kaydet' }).click()
  await expect(page.getByRole('alert')).toContainText('iptal edildi')
  await page.getByRole('button', { name: 'Pencereyi kapat' }).click()
  await expect(page.getByRole('button', { name: 'İmzalanmayan harcama kanıtlarını incele' })).toHaveCount(0)
})

test('unknown tracking codes show a useful empty state', async ({ page }) => {
  await page.goto('/#/takip')
  await page.getByLabel('Takip kodu').fill('IZ-NOT-FOUND')
  await page.getByRole('button', { name: 'Sorgula' }).click()
  await expect(page.getByRole('heading', { name: 'Bu kodla bir bağış bulunamadı.' })).toBeVisible()
  await page.getByRole('link', { name: 'Örnek kaydı aç' }).click()
  await expect(page.locator('.receipt-code')).toHaveText('IZ-DEMO-1001')
})

test('a temporary lookup outage keeps the last receipt and recovers automatically', async ({ page }) => {
  await page.goto('/#/takip?kod=IZ-DEMO-1001')
  await expect(page.locator('.receipt-code')).toHaveText('IZ-DEMO-1001')
  await page.route('**/api/donations/lookup', route => route.fulfill({ status: 503, json: { error: 'Yerel zincir erişilemiyor.' } }))
  await expect(page.getByRole('heading', { name: 'Bağış kaydı şu anda sorgulanamıyor.' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Bu kodla bir bağış bulunamadı.' })).toHaveCount(0)
  await expect(page.locator('.receipt-code')).toHaveText('IZ-DEMO-1001')
  await page.unroute('**/api/donations/lookup')
  await expect(page.getByRole('heading', { name: 'Bağış kaydı şu anda sorgulanamıyor.' })).toHaveCount(0)
  await page.getByLabel('Takip kodu').fill('IZ-NOT-FOUND')
  await page.getByRole('button', { name: 'Sorgula' }).click()
  await expect(page.getByRole('heading', { name: 'Bu kodla bir bağış bulunamadı.' })).toBeVisible()
  await expect(page.locator('.receipt-code')).toHaveCount(0)
})

test('a failed pending transaction releases the form but a connection failure retains it', async ({ page }) => {
  const id = 'pending-browser-test', pending = { id, hash: `0x${'1'.repeat(64)}` }
  await page.addInitScript(value => sessionStorage.setItem('iz-pending-transaction', JSON.stringify(value)), pending)
  await page.route(`**/api/operations/${id}/transaction`, route => route.fulfill({ json: { id, status: 'submitted' } }))
  await page.route(`**/api/operations/${id}`, route => route.fulfill({ status: 503, json: { error: 'Yerel zincir erişilemiyor.' } }))
  await page.goto('/#/kurum')
  await page.getByRole('button', { name: 'Bekleyen kaydı kontrol et' }).click()
  await expect(page.getByRole('alert')).toContainText('Yerel zincir erişilemiyor.')
  expect(await page.evaluate(() => sessionStorage.getItem('iz-pending-transaction'))).not.toBeNull()
  await page.unroute(`**/api/operations/${id}`)
  await page.route(`**/api/operations/${id}`, route => route.fulfill({ json: { id, status: 'invalid', error: 'Belge sürümü güncel zinciri izlemiyor.' } }))
  await page.getByRole('button', { name: 'Bekleyen kaydı kontrol et' }).click()
  await expect(page.getByRole('alert')).toContainText('Belge sürümü güncel zinciri izlemiyor.')
  await expect(page.getByRole('button', { name: 'Bekleyen kaydı kontrol et' })).toHaveCount(0)
  expect(await page.evaluate(() => sessionStorage.getItem('iz-pending-transaction'))).toBeNull()
})

test('excluded chain records are visible with their reason and UID', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 })
  const response = await page.request.get('/api/state')
  const state = await response.json()
  const record = { uid: `0x${'2'.repeat(64)}`, reason: 'Tekrarlanan veya geçersiz kayıt kimliği.' }
  await page.route('**/api/state', route => route.fulfill({ json: { ...state, invalidRecords: 1, invalid: [record] } }))
  await page.goto('/#/kurum-kaydi')
  await page.locator('summary').filter({ hasText: 'zincir kaydı doğrulanamadı' }).click()
  await expect(page.locator('.anchor-box')).toContainText(record.reason)
  await expect(page.locator('.anchor-box')).toContainText(record.uid)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('mobile navigation, donation and evidence fit a 360px screen', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 })
  for (const route of ['/', '/#/bagis', '/#/nasil-calisir', '/#/kurum-kaydi', '/#/takip?kod=IZ-DEMO-1001', '/#/kurum', '/#/denetci']) {
    await page.goto(route)
    await expect(page.locator('h1')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), route).toBe(true)
  }
  await page.goto('/')
  await page.getByRole('button', { name: 'Menüyü aç' }).click()
  await expect(page.getByRole('navigation')).toBeVisible()
  await page.getByRole('link', { name: 'Nasıl çalışır?', exact: true }).click()
  await expect(page).toHaveURL(/nasil-calisir/)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('banner').getByRole('link', { name: 'Bağış yap', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Kuruma bağış yap.' })).toBeVisible()
  await page.getByRole('link', { name: 'Kurumun harcamalarını incele' }).click()
  await page.getByRole('button', { name: 'Aile tipi çadır alımı kanıtlarını incele' }).click()
  expect(await page.getByRole('dialog').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
})

test('home explains donation accountability and how-it-works is a separate detailed page', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Bağışın,.*amacı için.*kullanılsın/ })).toBeVisible()
  await expect(page.locator('.progress-track,.avatar-stack')).toHaveCount(0)
  await page.getByRole('link', { name: 'Nasıl çalışır?', exact: true }).click()
  await expect(page).toHaveURL(/#\/nasil-calisir/)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.how-article > section')).toHaveCount(6)
  await expect(page.locator('.evidence-explanations > article')).toHaveCount(2)
  await page.getByRole('button', { name: /Eksik veya reddedilen belge/ }).click()
  await expect(page.getByRole('heading', { name: 'Eksikler ve uyuşmazlıklar kayıtta kalır.' })).toBeInViewport()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Bağışın kullanımını adım adım denetle.' })).toBeVisible()
  await page.goBack()
  await expect(page).not.toHaveURL(/nasil-calisir/)
})

test('public screens use institution and donation language consistently', async ({ page }) => {
  for (const route of ['/', '/#/bagis', '/#/nasil-calisir', '/#/kurum-kaydi', '/#/takip?kod=IZ-DEMO-1001', '/#/kurum', '/#/denetci']) {
    await page.goto(route)
    await expect(page.locator('main')).not.toContainText(/kampanya|iyilik görünür|iyiliğin görünür/i)
    await expect(page.locator('.site-header')).not.toContainText('Cüzdan bağla')
  }
})

test('desktop and mobile render without application errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  for (const [route, name] of [['/', 'home'], ['/#/nasil-calisir', 'how'], ['/#/bagis', 'donation'], ['/#/kurum-kaydi', 'fund']]) {
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto(route)
    await page.evaluate(() => document.fonts.ready)
    await page.screenshot({ path: `test-results/${name}-desktop.png`, fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: `test-results/${name}-mobile.png`, fullPage: true })
  }
  expect(errors).toEqual([])
})
