import { buildApp } from './app.ts'

const { app } = await buildApp()
await app.listen({ host: '127.0.0.1', port: Number(process.env.IZ_API_PORT ?? 3001) })
console.log(`İz API: http://127.0.0.1:${process.env.IZ_API_PORT ?? 3001} — yerel ağ 31337`)
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { void app.close().then(() => process.exit(0)) })
