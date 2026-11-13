export class HttpError extends Error {
  constructor(public statusCode: number, public code: string, message: string) { super(message) }
}
export const forbidden = () => new HttpError(403, 'ACCESS_DENIED', 'Você não tem acesso a esta ação ou clube.')
export const invalidInvite = () => new HttpError(400, 'INVALID_INVITE', 'Convite inválido, expirado, revogado ou indisponível para esta conta.')
