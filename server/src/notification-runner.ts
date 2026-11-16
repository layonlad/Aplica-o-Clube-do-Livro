import { notificationBatch } from './notification-batch.js'
try {
  const result = await notificationBatch()
  console.log(JSON.stringify(result))
  if (
    ('failed' in result && result.failed) ||
    ('temporaryPhotosFailed' in result && result.temporaryPhotosFailed)
  )
    process.exitCode = 1
} catch {
  console.error('Falha no executor de notificações. Confira a configuração e o estado da fila.')
  process.exitCode = 1
}
