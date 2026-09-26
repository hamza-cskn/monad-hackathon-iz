import { useState } from 'react'
import { useAccount } from 'wagmi'
import { loginDemoWallet, loginWallet, logoutWallet, pendingTransaction, resumeTransaction, walletError } from './chain'
import type { Network, Session } from './api'

export function WalletPanel({ session, network, onChange, notify }: { session: Session | null; network: Network | null; onChange: () => Promise<void>; notify: (message: string, error?: boolean) => void }) {
  const [busy, setBusy] = useState(false)
  const { address } = useAccount()
  async function run(action: () => Promise<unknown>, route?: string) {
    setBusy(true)
    try { await action(); await onChange(); if (route) window.location.hash = route } catch (e) { notify(walletError(e), true) } finally { setBusy(false) }
  }
  return <section className="wallet-panel" aria-label="Yetkili cüzdan oturumu">
    <div><strong>{session ? `${session.role === 'organization' ? 'Kurum' : 'Denetçi'} oturumu` : 'Yetkili cüzdanla giriş'}</strong><p>{session ? session.address : 'Kurum ve denetçi işlemleri ayrı cüzdan imzası gerektirir.'}</p>
      {session && address?.toLowerCase() !== session.address.toLowerCase() && <p className="form-error">İmzalamadan önce oturumdaki cüzdanı bağla.</p>}
      {!session && network && <details><summary>Yerel demo hesapları</summary><p>Kurum: <code>{network.accounts.organization}</code><br />Denetçi: <code>{network.accounts.reviewer}</code></p><p>Anvil test hesabını tarayıcı cüzdanında aç; ağı 31337 / 127.0.0.1:8545 olarak seç.</p></details>}
    </div>
    <div className="wallet-actions">
      {import.meta.env.DEV && network?.chainId === 31337 && <div className="demo-wallet-actions"><small>YEREL DEMO · TEST HESAPLARI</small><button className="button primary" disabled={busy} onClick={() => void run(() => loginDemoWallet(network.accounts.organization), '/kurum')}>Kurum olarak dene</button><button className="button outline" disabled={busy} onClick={() => void run(() => loginDemoWallet(network.accounts.reviewer), '/denetci')}>Denetçi olarak dene</button></div>}
      <button className="text-button" disabled={busy} onClick={() => void run(loginWallet)}>{busy ? 'Cüzdan bekleniyor…' : session ? 'Cüzdanla yeniden giriş' : 'Cüzdanla giriş yap'}</button>{session && <button className="text-button" disabled={busy} onClick={() => void run(logoutWallet)}>Çıkış yap</button>}{pendingTransaction() && <button className="button outline" disabled={busy} onClick={() => void run(resumeTransaction)}>Bekleyen kaydı kontrol et</button>}
    </div>
  </section>
}
