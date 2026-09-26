import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from 'node:net'

const dir = mkdtempSync(join(tmpdir(), 'iz-integration-'))
const env = { ...process.env, IZ_DATA_DIR: join(dir, 'data'), IZ_MANIFEST: join(dir, 'local.json'), IZ_RPC_URL: 'http://127.0.0.1:18545', IZ_API_PORT: '13001', IZ_API_URL: 'http://127.0.0.1:13001', IZ_ORIGINS: 'http://127.0.0.1:15173', VITE_RPC_URL: 'http://127.0.0.1:18545', IZ_TEST_URL: 'http://127.0.0.1:15173' }
const children: ChildProcess[] = []
function start(command: string, args: string[], quiet = false) {
  const child = spawn(command, args, { env, stdio: quiet ? 'ignore' : 'inherit' })
  children.push(child)
  child.on('error', error => { console.error(error.message) })
  return child
}
async function run(args: string[]) {
  const child = start(process.execPath, args)
  await new Promise<void>((resolve, reject) => { child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${args[0]}: çıkış ${code}`))) })
}
async function available(port: number) {
  await new Promise<void>((resolve, reject) => { const server = createServer(); server.once('error', reject); server.listen(port, '127.0.0.1', () => server.close(() => resolve())) })
}
async function waitFor(url: string, rpc = false) {
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(url, rpc ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }) } : {}); if (r.ok) return } catch { /* Service is starting. */ }
    await new Promise(resolve => setTimeout(resolve, 200))
  }
  throw new Error(`Servis başlatılamadı: ${url}`)
}
async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()))
  child.kill('SIGTERM'); await exited
}
try {
  for (const port of [18545, 13001, 15173]) await available(port)
  console.log('İzole test ağı: 18545. Kullanıcının 8545 ağı değiştirilmeyecek.')
  start('anvil', ['--host', '127.0.0.1', '--port', '18545', '--silent'], true)
  await waitFor(env.IZ_RPC_URL, true)
  await run(['scripts/deploy-local.ts']); await run(['scripts/seed-local.ts'])
  let backend = start(process.execPath, ['server/index.ts'])
  await waitFor(`${env.IZ_API_URL}/api/network`)
  await run(['--test', 'tests/backend.test.ts'])
  const before = await (await fetch(`${env.IZ_API_URL}/api/state`)).json()
  await stop(backend)
  backend = start(process.execPath, ['server/index.ts'])
  await waitFor(`${env.IZ_API_URL}/api/network`)
  const after = await (await fetch(`${env.IZ_API_URL}/api/state`)).json()
  if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Backend yeniden başlatmada kayıtlar değişti.')
  console.log('Backend yeniden başlatma: kayıtlar, kararlar ve toplamlar korundu.')
  start(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '15173', '--strictPort'])
  await waitFor(env.IZ_TEST_URL)
  await run(['node_modules/@playwright/test/cli.js', 'test'])
} catch (error) { console.error(error); process.exitCode = 1 }
finally { for (const child of [...children].reverse()) await stop(child); rmSync(dir, { recursive: true, force: true }) }
