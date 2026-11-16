import { buildNotificationApp } from './notification-http-app.js'
const app = await buildNotificationApp({
  audience: process.env.NOTIFICATION_AUDIENCE ?? '',
  caller: process.env.NOTIFICATION_CALLER_EMAIL ?? '',
})
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => void app.close())
await app.listen({ host: '0.0.0.0', port: Number(process.env.PORT ?? 8080) })
