import type { User } from 'firebase/auth'
import type { ApiErrorBody } from '../../server/src/contracts'

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message) }
}
export async function apiRequest<T>(user: User, path: string, method = 'GET', body?: unknown): Promise<T> {
  const token = await user.getIdToken()
  const response = await fetch(`${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as ApiErrorBody | null
    throw new ApiError(response.status, payload?.error?.code ?? 'API_ERROR', payload?.error?.message ?? 'O serviço está indisponível. Tente novamente.')
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
