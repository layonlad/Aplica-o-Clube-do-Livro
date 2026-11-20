/**
 * Contrato das notificações usado pelo site. Reflete as rotas reais da API (server/src/notification-service.ts):
 *
 *   GET  /v1/me/notifications?limit=&cursor=     → NotificationPage
 *   GET  /v1/me/notifications/unread             → UnreadNotificationCount
 *   GET  /v1/me/notifications/:id                → confere se o destino ainda existe e é visível (404 NOTICE_NOT_FOUND)
 *   POST /v1/me/notifications/read { id? }       → marca uma (com id) ou todas
 *   GET/POST /v1/me/notification-preferences     → NotificationPreferences
 *   GET/POST/DELETE /v1/me/push/*                → Web Push do aparelho
 *   GET/POST /v1/clubs/:id/chat/settings         → modo de aviso do chat em cada clube
 *
 * O que ainda falta no servidor está em docs/notificacoes/PENDENCIAS_BACKEND.md.
 */

export type NotificationKind =
  | 'like' | 'comment' | 'reply' | 'mention' | 'follow' | 'invitation' | 'join_request' | 'join_approved'
  | 'topic' | 'event' | 'post' | 'event_reminder' | 'reading' | 'book' | 'chat'

export type NotificationTargetType = 'post' | 'chat' | 'topic' | 'profile' | 'invite' | 'request' | 'event' | 'book'

/** Item como a API devolve. */
export interface Notification {
  id: string
  kind: NotificationKind | string
  followAction?: 'request' | 'approved' | null
  targetType: NotificationTargetType | string
  targetId: string
  clubId: string | null
  clubName: string | null
  actorName: string
  actorAvatarId?: string | null
  createdAt: string
  readAt: string | null
}

export interface NotificationPage {
  items: Notification[]
  nextCursor: string | null
}

export interface UnreadNotificationCount {
  count: number
}

export interface NotificationPreferences {
  interactions: boolean
  mentions: boolean
  clubs: boolean
  events: boolean
  readings: boolean
  reminderMinutes?: 0 | 15 | 60 | 1440
}

/** Modos de aviso do chat que a API aceita hoje, por clube. */
export type ChatNotificationMode = 'all' | 'mentions' | 'announcements' | 'silent'

/** Para onde o toque leva: sempre uma rota interna do app, nunca um endereço externo. */
export interface NotificationDestination {
  path: string
  /** Espaço que precisa estar ativo antes de abrir (um clube, ou o espaço pessoal). */
  scope: string | null
}
