import { measureApp } from '../app/performance'
import { createReadCache } from './read-cache'
import { isInvalidSession, reportRejectedSession, sessionEnded } from './session-events'
import type { User } from 'firebase/auth'
import type { ApiErrorBody } from '../../server/src/contracts'

const jsonReads = createReadCache<unknown>({ freshMs: 25_000, staleMs: 60_000, maxEntries: 64 })
export const readCached = <T>(owner: string | null, path: string, load: () => Promise<T>, refresh = false) =>
  jsonReads.read(owner, path, load, refresh) as Promise<T>
export const peekCached = <T>(owner: string | null, path: string) => jsonReads.peek(owner, path) as T | undefined
export const updateCached = <T>(owner: string | null, path: string, update: (value: T) => T) =>
  jsonReads.update(owner, path, (value) => update(value as T))
export const forgetCached = (owner: string | null, path: string) => jsonReads.forget(owner, path)

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message) }
}
export async function authenticatedResponse(
  user: User, path: string, method = 'GET', body?: unknown, signal?: AbortSignal,
): Promise<Response> {
  if (sessionEnded(user)) throw new ApiError(401, 'INVALID_SESSION', 'Entre novamente para continuar.')
  const token = await user.getIdToken().catch((error: unknown) => {
    if (isInvalidSession(error)) reportRejectedSession(user)
    throw error
  })
  if (sessionEnded(user)) throw new ApiError(401, 'INVALID_SESSION', 'Entre novamente para continuar.')
  const timeout = AbortSignal.timeout(method === 'GET' ? 75000 : 180000)
  const startedAt = performance.now()
  const response = await fetch(`${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    // Allow the free API host to wake up after an idle period; never retry mutations.
    signal: signal ? (AbortSignal.any?.([signal, timeout]) ?? signal) : timeout,
  }).finally(() => measureApp(method === 'GET' ? 'api-read' : 'api-write', startedAt))
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as ApiErrorBody | null
    const error = new ApiError(response.status, payload?.error?.code ?? 'API_ERROR', payload?.error?.message ?? 'O serviço está indisponível. Tente novamente.')
    if (response.status === 401 && isInvalidSession(error)) reportRejectedSession(user)
    throw error
  }
  if (sessionEnded(user)) throw new ApiError(401, 'INVALID_SESSION', 'Entre novamente para continuar.')
  return response
}

export async function apiRequest<T>(user: User, path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await authenticatedResponse(user, path, method, body)
  if (method !== 'GET' && /^\/(public|clubs|people|me\/(profile|blocks|follows|invitations))(?:[/?]|$)/.test(path)) {
    jsonReads.forget(user.uid)
    jsonReads.forget(null, '/public/')
    jsonReads.forget(null, '/discover/')
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>
}
export function readableError(error: unknown): string {
  if (error instanceof ApiError) return error.message
  const code = (error as { code?: string })?.code
  const messages: Record<string, string> = {
    'auth/invalid-credential': 'E-mail ou senha incorretos.',
    'auth/user-not-found': 'E-mail ou senha incorretos.',
    'auth/wrong-password': 'E-mail ou senha incorretos.',
    'auth/email-already-in-use': 'Já existe uma conta com este e-mail. Entre ou recupere sua senha.',
    'auth/weak-password': 'Use uma senha mais forte, com pelo menos 12 caracteres.',
    'auth/too-many-requests': 'Muitas tentativas. Aguarde antes de tentar novamente.',
    'auth/popup-closed-by-user': 'A janela de entrada foi fechada.',
    'auth/unauthorized-domain': 'O acesso ainda não está habilitado neste endereço.',
    'auth/operation-not-allowed': 'Esta forma de entrada ainda não foi habilitada pelo responsável.',
    'auth/user-disabled': 'Esta conta está desativada.',
  }
  return code && messages[code] ? messages[code] : 'Não foi possível concluir. Verifique sua conexão e tente novamente.'
}

export async function publicRequest<T>(path:string):Promise<T>{
  const base=import.meta.env.VITE_API_URL
  if(!base)throw new ApiError(503,'API_UNAVAILABLE','A descoberta precisa de uma conexão com o serviço. Sua biblioteca local continua disponível.')
  const response=await fetch(`${base.replace(/\/$/,'')}/v1${path}`,{cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(75000)})
  if(!response.ok){const payload=await response.json().catch(()=>null) as ApiErrorBody|null;throw new ApiError(response.status,payload?.error?.code??'API_ERROR',payload?.error?.message??'Não foi possível consultar o serviço.')}
  return response.json() as Promise<T>
}

/**
 * Mensagem para a tela: erros de validação criados pelo próprio app (`new Error('…')` com texto em português)
 * aparecem como estão; erros de rede e da API passam por `readableError`.
 * Evita mostrar "Verifique sua conexão" quando o problema é, por exemplo, o formato do arquivo.
 */
export function messageFor(error: unknown): string {
  if (error instanceof ApiError) return readableError(error)
  if (error instanceof Error && error.constructor === Error && error.message) return error.message
  return readableError(error)
}
