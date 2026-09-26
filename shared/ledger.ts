import { decodeAbiParameters, encodeAbiParameters, encodeFunctionData, parseAbi, parseAbiParameters, zeroAddress, zeroHash, type AbiParameter, type Address, type Hex } from 'viem'

export const schemas = {
  fund: 'string recordId,address organization,address reviewer,bytes32 metadataHash',
  donation: 'string recordId,uint64 gross,uint64 fee,uint64 net,string currency,uint64 occurredAt',
  expense: 'string recordId,uint64 amount,string currency,bytes32 metadataHash',
  evidence: 'string recordId,uint8 kind,bytes32 fileHash,bytes32 previousVersionUID,bytes32 metadataHash,bool shared',
  review: 'string recordId,uint8 decision,bytes32 reasonHash',
} as const
export type RecordKind = keyof typeof schemas
export type Role = 'platform' | 'organization' | 'reviewer'
export const actors: Record<RecordKind, Role> = { fund: 'platform', donation: 'platform', expense: 'organization', evidence: 'organization', review: 'reviewer' }
// Existing on-chain kind numbers must keep their original meaning.
export const evidenceKinds = ['payment', 'invoice', 'delivery', 'purchase'] as const
export const decisions = ['approved', 'rejected', 'requested'] as const
export type Fields = Record<string, string | bigint | number | boolean>
export type Manifest = {
  chainId: 31337; name: string; rpcUrl: string; packageVersion: string
  eas: Address; registry: Address; accounts: Record<Role, Address>
  resolvers: Record<Role, Address>; schemas: Record<RecordKind, Hex>
  deploymentBlock: string; deploymentBlockHash: Hex; fundUID: Hex
  codeHashes: Record<Address, Hex>
}
export const easAbi = parseAbi([
  'function attest((bytes32 schema,(address recipient,uint64 expirationTime,bool revocable,bytes32 refUID,bytes data,uint256 value) data) request) payable returns (bytes32)',
  'function getAttestation(bytes32 uid) view returns ((bytes32 uid,bytes32 schema,uint64 time,uint64 expirationTime,uint64 revocationTime,bytes32 refUID,address recipient,address attester,bool revocable,bytes data))',
  'event Attested(address indexed recipient,address indexed attester,bytes32 uid,bytes32 indexed schemaUID)',
])
export const registryAbi = parseAbi([
  'function register(string schema,address resolver,bool revocable) returns (bytes32)',
  'event Registered(bytes32 indexed uid,address indexed registerer,(bytes32 uid,address resolver,bool revocable,string schema) schema)',
  'function getSchema(bytes32 uid) view returns ((bytes32 uid,address resolver,bool revocable,string schema))',
])
export function encodeFields(kind: RecordKind, fields: Fields): Hex {
  const params: readonly AbiParameter[] = parseAbiParameters(schemas[kind])
  return encodeAbiParameters(params, params.map(p => fields[p.name!]))
}
export function decodeFields(kind: RecordKind, data: Hex): Fields {
  const params = parseAbiParameters(schemas[kind])
  const values = decodeAbiParameters(params, data)
  return Object.fromEntries(params.map((p, i) => [p.name!, values[i]])) as Fields
}
export function requestFor(manifest: Manifest, kind: RecordKind, fields: Fields, refUID: Hex) {
  return { schema: manifest.schemas[kind], data: { recipient: zeroAddress, expirationTime: 0n, revocable: false, refUID, data: encodeFields(kind, fields), value: 0n } } as const
}
export function transactionFor(manifest: Manifest, kind: RecordKind, fields: Fields, refUID: Hex) {
  return { to: manifest.eas, data: encodeFunctionData({ abi: easAbi, functionName: 'attest', args: [requestFor(manifest, kind, fields, refUID)] }), value: '0x0' as Hex, chainId: manifest.chainId }
}
export const json = (value: unknown) => JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item)
export { zeroHash }
