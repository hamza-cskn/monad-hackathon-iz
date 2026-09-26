import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createPublicClient, createWalletClient, defineChain, http, keccak256, type Address } from 'viem'
import type { Manifest } from '../shared/ledger.ts'

export const dataDir = resolve(process.env.IZ_DATA_DIR ?? '.data')
export const manifestPath = resolve(process.env.IZ_MANIFEST ?? 'deployments/local.json')
export const rpcUrl = process.env.IZ_RPC_URL ?? 'http://127.0.0.1:8545'
// This implementation is deliberately limited to the user's local development chain.
const endpoint = new URL(rpcUrl)
if (!['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname)) throw new Error('Yerel entegrasyon yalnızca loopback RPC kullanır.')
export const chain = defineChain({ id: 31337, name: 'Yerel Anvil', nativeCurrency: { name: 'Test ETH', symbol: 'ETH', decimals: 18 }, rpcUrls: { default: { http: [rpcUrl] } } })
export const publicClient = createPublicClient({ chain, transport: http(rpcUrl, { timeout: 5000, retryCount: 0 }) })
export const wallet = (account: Address) => createWalletClient({ account, chain, transport: http(rpcUrl, { timeout: 5000, retryCount: 0 }) })
export function readManifest(): Manifest { return JSON.parse(readFileSync(manifestPath, 'utf8')) }
export async function checkDeployment(m: Manifest) {
  if (await publicClient.getChainId() !== 31337 || m.chainId !== 31337) throw new Error('Yanlış ağ: yerel 31337 bekleniyor.')
  if (new Set(Object.values(m.accounts).map(a => a.toLowerCase())).size !== 3) throw new Error('Kurum, denetçi ve platform adresleri ayrı olmalı.')
  const block = await publicClient.getBlock({ blockNumber: BigInt(m.deploymentBlock) })
  if (block.hash !== m.deploymentBlockHash) throw new Error('Yerel ağ değişmiş. Mevcut kayıtlar bu deployment ile eşleşmiyor.')
  for (const [address, hash] of Object.entries(m.codeHashes)) {
    const code = await publicClient.getCode({ address: address as Address })
    if (!code || keccak256(code) !== hash) throw new Error('Hazır sözleşme kodu deployment kaydıyla eşleşmiyor.')
  }
}
