import { createConfig, http } from 'wagmi'
import { injected, mock } from 'wagmi/connectors'
import { connect, disconnect, getAccount, getWalletClient, signMessage, switchChain } from 'wagmi/actions'
import { defineChain, isAddress, type Address, type Hex } from 'viem'
import { api, OperationFailure, waitOperation, type Operation, type Session } from './api'

export const localChain = defineChain({ id: 31337, name: 'Yerel Anvil', nativeCurrency: { name: 'Test ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [import.meta.env.VITE_RPC_URL ?? 'http://127.0.0.1:8545'] } } })
const storedDemoAddress = import.meta.env.DEV ? localStorage.getItem('iz-local-demo-wallet') : null
export const walletConfig = createConfig({ chains: [localChain], connectors: [injected(), ...(storedDemoAddress && isAddress(storedDemoAddress) ? [mock({ accounts: [storedDemoAddress], features: { defaultConnected: true, reconnect: true } })] : [])], transports: { [31337]: http() } })
async function authenticate(address: Address) {
  await switchChain(walletConfig, { chainId: 31337 })
  const challenge = await api<{ nonce: string; message: string }>('/auth/challenge', { address })
  const signature = await signMessage(walletConfig, { account: address, message: challenge.message })
  return api<Session>('/auth/verify', { nonce: challenge.nonce, signature })
}
export async function loginDemoWallet(address: Address) {
  if (!import.meta.env.DEV || !['127.0.0.1', 'localhost'].includes(new URL(localChain.rpcUrls.default.http[0]).hostname)) throw new Error('Demo cüzdanı yalnızca yerel geliştirme ağında kullanılabilir.')
  if (getAccount(walletConfig).isConnected) await disconnect(walletConfig)
  const connector = mock({ accounts: [address], features: { defaultConnected: true, reconnect: true } })
  await connect(walletConfig, { connector, chainId: 31337 })
  const session = await authenticate(address)
  localStorage.setItem('iz-local-demo-wallet', address)
  return session
}
export async function loginWallet(): Promise<Session> {
  if (getAccount(walletConfig).connector?.type === 'mock') await disconnect(walletConfig)
  localStorage.removeItem('iz-local-demo-wallet')
  let address = getAccount(walletConfig).address
  if (!address) {
    const result = await connect(walletConfig, { connector: walletConfig.connectors[0] })
    address = result.accounts[0]
  }
  return authenticate(address)
}
export async function logoutWallet() {
  await api('/auth/logout', {})
  localStorage.removeItem('iz-local-demo-wallet')
  if (getAccount(walletConfig).isConnected) await disconnect(walletConfig)
}
const pendingKey = 'iz-pending-transaction'
export function pendingTransaction(): { id: string; hash: Hex } | null {
  try { return JSON.parse(sessionStorage.getItem(pendingKey) ?? 'null') } catch { return null }
}
export async function resumeTransaction() {
  const pending = pendingTransaction()
  if (!pending) return
  try {
    const op = await api<Operation>(`/operations/${pending.id}/transaction`, { hash: pending.hash })
    if (['failed', 'invalid'].includes(op.status)) throw new OperationFailure(op.error ?? 'İşlem başarısız.')
    const result = op.status === 'confirmed' ? op : await waitOperation(op.id)
    sessionStorage.removeItem(pendingKey)
    return result
  } catch (error) {
    if (error instanceof OperationFailure) sessionStorage.removeItem(pendingKey)
    throw error
  }
}
export async function submitOperation(op: Operation) {
  if (op.status === 'confirmed') return op
  if (pendingTransaction()) throw new Error('Önce bekleyen zincir işlemini kontrol et.')
  if (['failed', 'invalid'].includes(op.status)) throw new OperationFailure(op.error ?? 'İşlem başarısız.')
  if (op.hash) {
    sessionStorage.setItem(pendingKey, JSON.stringify({ id: op.id, hash: op.hash }))
    return (await resumeTransaction())!
  }
  const session = await api<Session | null>('/session')
  const account = getAccount(walletConfig)
  if (!session || session.address.toLowerCase() !== account.address?.toLowerCase()) throw new Error('İşlemi imzalamak için yetkili cüzdanınla yeniden giriş yap.')
  await switchChain(walletConfig, { chainId: 31337 })
  const client = await getWalletClient(walletConfig, { chainId: 31337, account: session.address })
  const hash = await client.sendTransaction({ to: op.transaction.to, data: op.transaction.data, value: 0n, chain: localChain })
  sessionStorage.setItem(pendingKey, JSON.stringify({ id: op.id, hash }))
  return (await resumeTransaction())!
}
export function walletError(error: unknown) {
  const e = error as { message?: string }
  if (/rejected|denied|4001/i.test(e.message ?? '')) return 'Cüzdan isteği iptal edildi.'
  if (/provider.*not found|provider.*undefined/i.test(e.message ?? '')) return 'Tarayıcı cüzdanı bulunamadı. MetaMask veya Rabby ile bağlan.'
  return e.message ?? 'İşlem tamamlanamadı.'
}
