import { registerReadingIntegrations } from './reading-integrations/routes.js'
import {registerLiteraryReads,registerLiteraryAccountRoutes} from './literary/routes.js'
import {syncLiteraryNews} from './literary/news.js'
import {editorialFirebaseUid} from './public-policy.js'
import {registerPhotoMaintenance} from './photo-maintenance.js'
import {PushSubscriptions,subscriptionInput} from './push-subscriptions.js'
import {registerPhotoRoutes} from './photo-routes.js'
import {ClubFiles} from './club-files.js'
import { registerBookFileRoutes } from './book-file-routes.js'
import {registerEventRoutes} from './event-routes.js'
import {ModerationService} from './moderation-service.js'
import {NotificationService} from './notification-service.js'
import {registerPublicReads,registerPublicMutations} from './public-routes.js'
import {registerForumRoutes} from './forum-routes.js'
import {registerCommunityRoutes} from './community-routes.js'
import {ClubManagement} from './club-management.js'
import {pageInput} from './pagination.js'
import Fastify, { LogController } from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { z, ZodError } from 'zod'
import type { Pool } from 'pg'
import type { VerifyToken } from './auth.js'
import type { UserProfile } from './contracts.js'
import { HttpError } from './errors.js'
import { ClubService } from './service.js'
import { WorkspaceService } from './workspace-service.js'
import { actionSchema } from './workspace-model.js'
import { searchCatalog, type CatalogEntry } from './catalog.js'
import { PrivateFiles } from './private-files.js'
import type { PrivateStorage } from './private-storage.js'

declare module 'fastify' { interface FastifyRequest { user: UserProfile } }

const clubParams = z.object({ clubId: z.uuid() })
const createClubInput = z.object({
  name: z.string().trim().min(2).max(80),
  timezone: z.string().max(80).default('America/Sao_Paulo').refine((value) => {
    try { new Intl.DateTimeFormat('pt-BR', { timeZone: value }); return true } catch { return false }
  }),
}).strict()
const inviteInput = z.object({
  email: z.email().max(254).transform((s) => s.toLowerCase()).optional(),
  maxUses: z.number().int().min(1).max(50).default(1),
  expiresInDays: z.number().int().min(1).max(30).default(7),
}).strict().refine((data) => !data.email || data.maxUses === 1, 'Convites por e-mail devem ter um único uso.')

export async function buildApp(options: { pool: Pool; verifyToken: VerifyToken; origin: string; additionalOrigins?:string[]; logger?: boolean; rateMax?: number;catalogSearch?:(query:string)=>Promise<CatalogEntry[]>;storage?:PrivateStorage;moderatorUids?:string[];pushPublicKey?:string;photoCleanupToken?:string;literaryNewsSync?:boolean;afterSocialMutation?:()=>void }) {
  const app = Fastify({
    logger: options.logger ? { redact: ['req.headers.authorization', 'req.body', 'res.headers'] } : false,
    logController: new LogController({ disableRequestLogging: true }),
    bodyLimit: 16384,
    requestTimeout: 15000,
    trustProxy: false,
  })
  const service = new ClubService(options.pool)
  const workspace = new WorkspaceService(options.pool)
  const clubFiles=new ClubFiles(options.pool,options.storage)
  const files=new PrivateFiles(options.pool,options.storage)
  const management=new ClubManagement(options.pool)
  const notifications=new NotificationService(options.pool)
  const push=new PushSubscriptions(options.pool,options.pushPublicKey)
  await app.register(cors, { origin: options.additionalOrigins?.length ? [options.origin,...options.additionalOrigins] : options.origin, methods: ['GET', 'POST', 'DELETE'], allowedHeaders: ['Authorization', 'Content-Type'], maxAge: 300, exposedHeaders: ['X-Reading-Export-Id', 'Content-Disposition'] })
  await app.register(helmet)
  await app.register(rateLimit, { max: options.rateMax ?? 120, timeWindow: '1 minute' })
  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store')
    reply.header('Vary', 'Origin, Authorization')
  })
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof HttpError) return reply.code(error.statusCode).send({ error: { code: error.code, message: error.message } })
    if (error instanceof ZodError) return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Confira os campos informados.' } })
    const status = (error as { statusCode?: number }).statusCode
    if (status && status >= 400 && status < 500) {
      return reply.code(status).send({ error: { code: status === 429 ? 'RATE_LIMIT' : 'INVALID_REQUEST', message: status === 429 ? 'Muitas tentativas. Aguarde um minuto.' : 'Requisição inválida.' } })
    }
    // Do not log payloads, bearer tokens, invitation secrets or database URLs.
    request.log.error({ requestId: request.id, route: request.routeOptions.url }, 'Falha interna na API')
    return reply.code(500).send({ error: { code: 'INTERNAL_ERROR', message: 'Não foi possível concluir a operação.' } })
  })
  if(options.afterSocialMutation)app.addHook('onResponse',async(request,reply)=>{if(reply.statusCode<300&&request.method!=='GET'&&/\/(posts|news|forum|events|invites|follow|follow-requests|join-requests|invitations)(?:[/?]|$)/.test(request.url))options.afterSocialMutation!()})
  registerPhotoMaintenance(app,options.pool,options.storage,options.photoCleanupToken,
    options.literaryNewsSync ? () => syncLiteraryNews(options.pool) : undefined)
  app.get('/health', async () => {
    try { await options.pool.query('SELECT 1'); return { status: 'ok' } }
    catch { throw new HttpError(503, 'DATABASE_UNAVAILABLE', 'Banco temporariamente indisponível.') }
  })
  app.get('/v1/catalog',{config:{rateLimit:{max:30,timeWindow:'1 minute'}}},async request=>{
    const input=z.object({q:z.string().trim().min(2).max(100).optional(),author:z.string().trim().min(2).max(100).optional(),genre:z.string().trim().min(2).max(80).optional()}).strict().refine(value=>!!value.q||!!value.author||!!value.genre).parse(request.query)
    const query=[input.q,input.author?'author:'+JSON.stringify(input.author):'',input.genre?'subject:'+JSON.stringify(input.genre):''].filter(Boolean).join(' ')
    return {items:await (options.catalogSearch??searchCatalog)(query)}
  })
  app.get('/v1/discover/clubs',request=>management.discover(pageInput.extend({q:z.string().trim().min(2).max(100).optional()}).strict().parse(request.query)))
  const authenticate=async (request:import('fastify').FastifyRequest) => {
      const match = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? '')
      if (!match || match[1].length > 8192) throw new HttpError(401, 'AUTH_REQUIRED', 'Entre na sua conta para continuar.')
      const identity = await options.verifyToken(match[1])
      if (identity.uid === editorialFirebaseUid) throw new HttpError(401, 'AUTH_REQUIRED', 'Entre na sua conta para continuar.')
      if (!identity.emailVerified || !identity.email) throw new HttpError(403, 'EMAIL_NOT_VERIFIED', 'Confirme seu e-mail para acessar o clube.')
      request.user = await service.syncUser(identity)
    }
  const optionalAuth = async (request: import('fastify').FastifyRequest) => { if (request.headers.authorization) await authenticate(request) }
  await registerPublicReads(app,options.pool,optionalAuth,options.storage,options.moderatorUids)
  await registerLiteraryReads(app, options.pool, optionalAuth)
  await app.register(async (api) => {
    api.addHook('onRequest',authenticate)
    registerReadingIntegrations(api, options.pool, files)
    await registerPublicMutations(api,options.pool,options.storage,options.moderatorUids)
    api.get('/me/clubs/summary', request => management.summaries(request.user))
    registerLiteraryAccountRoutes(api, options.pool, workspace, options.moderatorUids)
    api.get('/me/push/config',()=>push.config())
    api.post('/me/push/subscriptions',{config:{rateLimit:{max:5,timeWindow:'1 minute',hook:'preHandler',keyGenerator:request=>request.user.id}}},request=>push.register(request.user,subscriptionInput.parse(request.body)))
    api.post('/me/push/status',request=>push.status(request.user,z.object({endpoint:z.string().max(2048)}).strict().parse(request.body).endpoint))
    api.delete('/me/push/subscriptions',request=>push.revoke(request.user,z.object({endpoint:z.string().max(2048)}).strict().parse(request.body).endpoint))
    api.get('/me/notifications/:id',request=>notifications.get(request.user,z.object({id:z.uuid()}).parse(request.params).id))
    api.get('/me/notifications',request=>notifications.list(request.user,pageInput.strict().parse(request.query)))
    api.get('/me/notifications/unread',request=>notifications.unread(request.user))
    api.post('/me/notifications/read',request=>notifications.read(request.user,z.object({id:z.uuid().optional()}).strict().parse(request.body).id))
    api.get('/me/notification-preferences',request=>notifications.preferences(request.user))
    api.post('/me/notification-preferences',request=>notifications.setPreferences(request.user,z.object({interactions:z.boolean(),mentions:z.boolean(),clubs:z.boolean(),events:z.boolean(),readings:z.boolean(),reminderMinutes:z.union([z.literal(0),z.literal(15),z.literal(60),z.literal(1440)]).optional()}).strict().parse(request.body)))
    await registerPhotoRoutes(api,options.pool,options.storage)
    await registerCommunityRoutes(api,options.pool,options.storage)
    await registerForumRoutes(api,options.pool)
    await registerEventRoutes(api,options.pool)
    api.get('/clubs/:clubId/settings',request=>management.settings(request.user,clubParams.parse(request.params).clubId))
    api.post('/clubs/:clubId/settings',request=>management.updateSettings(request.user,clubParams.parse(request.params).clubId,z.object({name:z.string().trim().min(2).max(80),description:z.string().max(2000),visibility:z.enum(['private','discoverable','public']),accent:z.string().regex(/^#[0-9a-fA-F]{6}$/),coverMediaId:z.uuid().nullable().optional(),coverIsPublic:z.boolean().optional(),version:z.number().int().min(0)}).strict().parse(request.body)))
    api.post('/clubs/:clubId/members/:userId/role',async(request,reply)=>{const {clubId,userId}=clubParams.extend({userId:z.uuid()}).parse(request.params);await management.setRole(request.user,clubId,userId,z.object({role:z.enum(['admin','moderator','member'])}).strict().parse(request.body).role);return reply.code(204).send()})
    api.post('/clubs/:clubId/leave',async(request,reply)=>{await management.leave(request.user,clubParams.parse(request.params).clubId);return reply.code(204).send()})
    api.post('/clubs/:clubId/join-requests',{config:{rateLimit:{max:5,timeWindow:'1 minute'}}},async(request,reply)=>reply.code(201).send(await management.requestJoin(request.user,clubParams.parse(request.params).clubId,z.object({message:z.string().trim().max(1000).default('')}).strict().parse(request.body).message)))
    api.get('/clubs/:clubId/join-requests',request=>management.requests(request.user,clubParams.parse(request.params).clubId,pageInput.strict().parse(request.query)))
    api.post('/clubs/:clubId/join-requests/:id/review',request=>{const {clubId,id}=clubParams.extend({id:z.uuid()}).parse(request.params);return management.review(request.user,clubId,id,z.object({decision:z.enum(['approved','rejected'])}).strict().parse(request.body).decision)})
    api.get('/me', async request => ({...await service.session(request.user),...await new ModerationService(options.pool,options.moderatorUids).permissions(request.user)}))
    api.post('/me/invitations/:id/accept',{config:{rateLimit:{max:10,timeWindow:'1 minute'}}},request=>service.acceptInvite(request.user,z.object({id:z.uuid()}).parse(request.params).id,true))
    api.post('/me/invitations/:id/decline',{config:{rateLimit:{max:10,timeWindow:'1 minute'}}},request=>service.declineInvite(request.user,z.object({id:z.uuid()}).parse(request.params).id))
    registerBookFileRoutes(api, files, clubFiles)
    const workspaceInput = z.object({ action: actionSchema, version: z.number().int().min(0) }).strict()
    api.get('/me/workspace', request => workspace.get(request.user))
    api.post('/me/workspace', { bodyLimit: 9000000 }, request => { const input=workspaceInput.parse(request.body); return workspace.act(request.user,input.action,input.version) })
    api.get('/clubs/:clubId/workspace', request => workspace.get(request.user,clubParams.parse(request.params).clubId,z.object({view:z.enum(['app']).optional()}).strict().parse(request.query).view!=='app'))
    api.post('/clubs/:clubId/workspace', { bodyLimit: 3000000 }, request => { const input=workspaceInput.parse(request.body); return workspace.act(request.user,input.action,input.version,clubParams.parse(request.params).clubId,z.object({view:z.enum(['app']).optional()}).strict().parse(request.query).view!=='app') })
    api.post('/clubs', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
      const club = await service.createClub(request.user, createClubInput.parse(request.body))
      return reply.code(201).send(club)
    })
    api.get('/clubs/:clubId', (request) => service.details(request.user, clubParams.parse(request.params).clubId))
    api.get('/clubs/:clubId/members',request=>service.members(request.user,clubParams.parse(request.params).clubId,pageInput.extend({q:z.string().trim().min(2).max(100).optional()}).strict().parse(request.query)))
    api.get('/clubs/:clubId/invites', (request) => service.listInvites(request.user, clubParams.parse(request.params).clubId))
    api.post('/clubs/:clubId/invites', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
      return reply.code(201).send(await service.createInvite(request.user, clubParams.parse(request.params).clubId, inviteInput.parse(request.body)))
    })
    api.delete('/clubs/:clubId/invites/:inviteId', async (request, reply) => {
      const { clubId, inviteId } = clubParams.extend({ inviteId: z.uuid() }).parse(request.params)
      await service.revokeInvite(request.user, clubId, inviteId)
      return reply.code(204).send()
    })
    api.post('/invites/accept', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, (request) => {
      const { token } = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict().parse(request.body)
      return service.acceptInvite(request.user, token)
    })
    api.delete('/clubs/:clubId/members/:userId', async (request, reply) => {
      const { clubId, userId } = clubParams.extend({ userId: z.uuid() }).parse(request.params)
      await service.setMembership(request.user, clubId, userId, 'removed')
      return reply.code(204).send()
    })
    api.post('/clubs/:clubId/members/:userId/restore', async (request, reply) => {
      const { clubId, userId } = clubParams.extend({ userId: z.uuid() }).parse(request.params)
      await service.setMembership(request.user, clubId, userId, 'active')
      return reply.code(204).send()
    })
  }, { prefix: '/v1' })
  return app
}
