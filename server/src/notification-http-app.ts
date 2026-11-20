import Fastify from 'fastify'
import { OAuth2Client } from 'google-auth-library'
import { notificationBatch } from './notification-batch.js'
export async function buildNotificationApp(options: {
  audience: string
  caller: string
  verify?: (token: string) => Promise<{ email?: string; email_verified?: boolean }>
  run?: typeof notificationBatch
}) {
  const audience = new URL(options.audience)
  if (
    audience.protocol !== 'https:' ||
    audience.origin !== options.audience ||
    !/^[\w-]+@[\w-]+\.iam\.gserviceaccount\.com$/.test(options.caller)
  )
    throw Error('Identidade ou audiência do executor inválida.')
  const app = Fastify({ bodyLimit: 1024, logger: false }),
    oauth = new OAuth2Client()
  const verify: NonNullable<typeof options.verify> =
    options.verify ??
    (async (idToken: string) =>
      (await oauth.verifyIdToken({ idToken, audience: options.audience })).getPayload() ?? {})
  // Cloud Run IAM is the first gate; the signed identity/audience is checked again here.
  app.post('/run', async (request, reply) => {
    const match = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? '')
    if (!match) return reply.code(401).send({ error: 'AUTH_REQUIRED' })
    try {
      const claims = await verify(match[1])
      if (claims.email !== options.caller || claims.email_verified !== true)
        return reply.code(403).send({ error: 'FORBIDDEN' })
    } catch {
      return reply.code(401).send({ error: 'INVALID_IDENTITY' })
    }
    try {
      const result = await (options.run ?? notificationBatch)()
      console.log(JSON.stringify(result))
      return reply
        .code(
          ('failed' in result && result.failed) || ('failedEvents' in result && result.failedEvents) ||
            ('temporaryPhotosFailed' in result && result.temporaryPhotosFailed)
            ? 500
            : 200,
        )
        .send(result)
    } catch {
      console.error(
        'Falha no lote de notificações; nenhuma credencial ou conteúdo privado foi registrado.',
      )
      return reply.code(503).send({ error: 'WORKER_UNAVAILABLE' })
    }
  })
  return app
}
