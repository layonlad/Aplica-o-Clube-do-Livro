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

export async function buildApp(options: { pool: Pool; verifyToken: VerifyToken; origin: string; logger?: boolean; rateMax?: number;catalogSearch?:(query:string)=>Promise<CatalogEntry[]>;storage?:PrivateStorage }) {
  const app = Fastify({
    logger: options.logger ? { redact: ['req.headers.authorization', 'req.body', 'res.headers'] } : false,
    logController: new LogController({ disableRequestLogging: true }),
    bodyLimit: 16384,
    requestTimeout: 15000,
    trustProxy: false,
  })
  const service = new ClubService(options.pool)
  const workspace = new WorkspaceService(options.pool)
  const files=new PrivateFiles(options.pool,options.storage)
  const management=new ClubManagement(options.pool)
  await app.register(cors, { origin: options.origin, methods: ['GET', 'POST', 'DELETE'], allowedHeaders: ['Authorization', 'Content-Type'] })
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
  app.get('/health', async () => {
    try { await options.pool.query('SELECT 1'); return { status: 'ok' } }
    catch { throw new HttpError(503, 'DATABASE_UNAVAILABLE', 'Banco temporariamente indisponível.') }
  })
  app.get('/v1/catalog',{config:{rateLimit:{max:30,timeWindow:'1 minute'}}},async request=>{
    const {q}=z.object({q:z.string().trim().min(2).max(100)}).strict().parse(request.query)
    return {items:await (options.catalogSearch??searchCatalog)(q)}
  })
  app.get('/v1/discover/clubs',request=>management.discover(pageInput.extend({q:z.string().trim().min(2).max(100).optional()}).strict().parse(request.query)))
  await app.register(async (api) => {
    api.addHook('onRequest', async (request) => {
      const match = /^Bearer ([^\s]+)$/.exec(request.headers.authorization ?? '')
      if (!match || match[1].length > 8192) throw new HttpError(401, 'AUTH_REQUIRED', 'Entre na sua conta para continuar.')
      const identity = await options.verifyToken(match[1])
      if (!identity.emailVerified || !identity.email) throw new HttpError(403, 'EMAIL_NOT_VERIFIED', 'Confirme seu e-mail para acessar o clube.')
      request.user = await service.syncUser(identity)
    })
    await registerCommunityRoutes(api,options.pool,options.storage)
    api.get('/clubs/:clubId/settings',request=>management.settings(request.user,clubParams.parse(request.params).clubId))
    api.post('/clubs/:clubId/settings',request=>management.updateSettings(request.user,clubParams.parse(request.params).clubId,z.object({name:z.string().trim().min(2).max(80),description:z.string().max(2000),visibility:z.enum(['private','discoverable','public']),accent:z.string().regex(/^#[0-9a-fA-F]{6}$/),version:z.number().int().min(0)}).strict().parse(request.body)))
    api.post('/clubs/:clubId/members/:userId/role',async(request,reply)=>{const {clubId,userId}=clubParams.extend({userId:z.uuid()}).parse(request.params);await management.setRole(request.user,clubId,userId,z.object({role:z.enum(['admin','moderator','member'])}).strict().parse(request.body).role);return reply.code(204).send()})
    api.post('/clubs/:clubId/leave',async(request,reply)=>{await management.leave(request.user,clubParams.parse(request.params).clubId);return reply.code(204).send()})
    api.post('/clubs/:clubId/join-requests',{config:{rateLimit:{max:5,timeWindow:'1 minute'}}},async(request,reply)=>reply.code(201).send(await management.requestJoin(request.user,clubParams.parse(request.params).clubId,z.object({message:z.string().trim().max(1000).default('')}).strict().parse(request.body).message)))
    api.get('/clubs/:clubId/join-requests',request=>management.requests(request.user,clubParams.parse(request.params).clubId,pageInput.strict().parse(request.query)))
    api.post('/clubs/:clubId/join-requests/:id/review',request=>{const {clubId,id}=clubParams.extend({id:z.uuid()}).parse(request.params);return management.review(request.user,clubId,id,z.object({decision:z.enum(['approved','rejected'])}).strict().parse(request.body).decision)})
    api.get('/me', (request) => service.session(request.user))
    const fileParams=z.object({bookId:z.uuid()})
    api.get('/me/book-files/:bookId',request=>files.list(request.user.id,fileParams.parse(request.params).bookId))
    api.post('/me/book-files/:bookId',{bodyLimit:15000000,config:{rateLimit:{max:5,timeWindow:'1 minute'}}},async(request,reply)=>{
      const input=z.object({filename:z.string().min(1).max(150).regex(/^[^\p{C}]+\.epub$/iu),data:z.string().min(4).max(13333336).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)}).strict().parse(request.body)
      const bytes=Buffer.from(input.data,'base64')
      return reply.code(201).send(await files.upload(request.user.id,fileParams.parse(request.params).bookId,input.filename,bytes))
    })
    api.get('/me/files/:id/content',async(request,reply)=>{
      const {id}=z.object({id:z.uuid()}).parse(request.params);const file=await files.download(request.user.id,id)
      return reply.type('application/epub+zip').header('Content-Disposition',`attachment; filename="book.epub"; filename*=UTF-8''${encodeURIComponent(file.filename)}`).send(Buffer.from(file.bytes))
    })
    api.delete('/me/files/:id',async(request,reply)=>{const {id}=z.object({id:z.uuid()}).parse(request.params);const result=await files.remove(request.user.id,id);return reply.code(result.purged?200:202).send(result)})
    const workspaceInput = z.object({ action: actionSchema, version: z.number().int().min(0) }).strict()
    api.get('/me/workspace', request => workspace.get(request.user))
    api.post('/me/workspace', { bodyLimit: 9000000 }, request => { const input=workspaceInput.parse(request.body); return workspace.act(request.user,input.action,input.version) })
    api.get('/clubs/:clubId/workspace', request => workspace.get(request.user,clubParams.parse(request.params).clubId))
    api.post('/clubs/:clubId/workspace', { bodyLimit: 3000000 }, request => { const input=workspaceInput.parse(request.body); return workspace.act(request.user,input.action,input.version,clubParams.parse(request.params).clubId) })
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
