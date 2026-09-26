import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { keccak256, parseEventLogs, zeroAddress, type Abi, type Address, type Hex } from 'viem'
import { actors, easAbi, json, registryAbi, requestFor, schemas, zeroHash, type Manifest, type RecordKind, type Role } from '../shared/ledger.ts'
import { checkDeployment, manifestPath, publicClient, readManifest, rpcUrl, wallet } from '../server/config.ts'
import { putMetadata } from '../server/db.ts'

if (await publicClient.getChainId() !== 31337) throw new Error('Yalnızca yerel Anvil 31337 üzerinde kurulum yapılabilir.')
const version = await publicClient.request({ method: 'web3_clientVersion' })
if (!version.toLowerCase().includes('anvil')) throw new Error('Anvil istemcisi bekleniyor.')
if (existsSync(manifestPath)) {
  await checkDeployment(readManifest())
  console.log('Mevcut yerel EAS kurulumu doğrulandı:', readManifest().eas)
} else {
  const addresses = await wallet(zeroAddress).getAddresses()
  if (addresses.length < 3) throw new Error('Üç ayrı açık Anvil test hesabı gerekiyor.')
  const accounts = { platform: addresses[0], organization: addresses[1], reviewer: addresses[2] }
  const client = wallet(accounts.platform)
  const artifactRoot = 'node_modules/@ethereum-attestation-service/eas-contracts/artifacts/contracts'
  async function deploy(path: string, args: readonly unknown[] = []) {
    const artifact = JSON.parse(readFileSync(`${artifactRoot}/${path}`, 'utf8')) as { abi: Abi; bytecode: Hex }
    const hash = await client.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode, args })
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    if (receipt.status !== 'success' || !receipt.contractAddress) throw new Error('Hazır sözleşme kurulamadı.')
    console.log('Kuruldu:', path.split('/').at(-1), receipt.contractAddress)
    return { address: receipt.contractAddress, receipt }
  }
  const registry = await deploy('SchemaRegistry.sol/SchemaRegistry.json')
  const eas = await deploy('EAS.sol/EAS.json', [registry.address])
  const resolvers = {} as Record<Role, Address>
  for (const role of Object.keys(accounts) as Role[]) resolvers[role] = (await deploy('resolver/examples/AttesterResolver.sol/AttesterResolver.json', [eas.address, accounts[role]])).address
  const schemaUIDs = {} as Record<RecordKind, Hex>
  for (const kind of Object.keys(schemas) as RecordKind[]) {
    const hash = await client.writeContract({ address: registry.address, abi: registryAbi, functionName: 'register', args: [schemas[kind], resolvers[actors[kind]], false] })
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    const event = parseEventLogs({ abi: registryAbi, eventName: 'Registered', logs: receipt.logs })[0]
    if (!event || receipt.status !== 'success') throw new Error('Şema kaydedilemedi.')
    schemaUIDs[kind] = event.args.uid
  }
  const codeHashes: Record<Address, Hex> = {}
  for (const address of [registry.address, eas.address, ...Object.values(resolvers)]) codeHashes[address] = keccak256((await publicClient.getCode({ address }))!)
  const m: Manifest = { chainId: 31337, name: 'Yerel Anvil', rpcUrl, packageVersion: '1.9.0', eas: eas.address, registry: registry.address, accounts, resolvers, schemas: schemaUIDs, deploymentBlock: registry.receipt.blockNumber.toString(), deploymentBlockHash: registry.receipt.blockHash, fundUID: zeroHash, codeHashes }
  const metadataHash = putMetadata({ name: 'Birlikte Yaşam Derneği', fund: 'Kurumun ortak bağış fonu', sample: true })
  const hash = await client.writeContract({ address: m.eas, abi: easAbi, functionName: 'attest', args: [requestFor(m, 'fund', { recordId: 'birlikte-yasam:general', organization: accounts.organization, reviewer: accounts.reviewer, metadataHash }, zeroHash)] })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  const event = parseEventLogs({ abi: easAbi, eventName: 'Attested', logs: receipt.logs })[0]
  if (!event || receipt.status !== 'success') throw new Error('Fon kaydı oluşturulamadı.')
  m.fundUID = event.args.uid
  mkdirSync(dirname(manifestPath), { recursive: true })
  writeFileSync(manifestPath, `${json(m)}\n`)
  await checkDeployment(m)
  console.log('Yerel EAS ve beş kayıt şeması hazır. Manifest:', manifestPath)
}
