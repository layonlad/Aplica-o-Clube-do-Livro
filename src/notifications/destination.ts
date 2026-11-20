import type { Notification, NotificationDestination } from './types'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const id = (value: string | null | undefined) => (value && uuid.test(value) ? value : null)

/**
 * Rota interna para cada notificação. Só usa os IDs validados vindos da API e caminhos fixos do app:
 * nenhum texto da notificação vira endereço. Sem destino válido, devolve null (a central avisa).
 */
export function destinationFor(notice: Notification): NotificationDestination | null {
  const target = id(notice.targetId), club = id(notice.clubId)
  switch (notice.targetType) {
    case 'post':
      if (!target) return null
      return club ? { scope: club, path: `/app/wall?post=${target}` } : { scope: null, path: `/app/community?post=${target}` }
    case 'chat':
      return target && club ? { scope: club, path: `/app/chat?message=${target}` } : null
    case 'topic':
      return target && club ? { scope: club, path: `/app/forum?topic=${target}` } : null
    case 'profile':
      if (notice.followAction === 'request') return { scope: null, path: '/app/profile?requests=1' }
      return target ? { scope: null, path: `/app/people/${target}` } : null
    case 'request':
      if (!club) return null
      return notice.kind === 'join_request' ? { scope: null, path: `/clubs/${club}` } : { scope: club, path: '/app' }
    case 'invite':
      return { scope: null, path: '/app/clubs?convites=1' }
    case 'event':
      return club ? { scope: club, path: '/app/calendar' } : null
    case 'book':
      return club ? { scope: club, path: '/app/library' } : null
    default:
      return null
  }
}

export type NotificationTone = 'chat' | 'wall' | 'community' | 'mention' | 'reply' | 'like' | 'follow' | 'invite' | 'club' | 'event' | 'reading'

const phrases: Record<string, string> = {
  like: 'curtiu sua publicação',
  comment: 'comentou sua publicação',
  reply: 'respondeu à conversa',
  mention: 'mencionou você',
  follow: 'começou a seguir você',
  invitation: 'convidou você para um clube',
  join_request: 'pediu para entrar no clube',
  join_approved: 'aprovou sua entrada no clube',
  topic: 'abriu um debate no fórum',
  event: 'marcou ou atualizou um encontro',
  post: 'publicou no mural do clube',
  event_reminder: 'Encontro do clube se aproximando',
  reading: 'atualizou a leitura do clube',
  book: 'adicionou um livro ao clube',
}

/** Texto curto e o tom (ícone e cor) de cada notificação, a partir dos campos que a API envia. */
export function describe(notice: Notification): { text: string; tone: NotificationTone; system: boolean } {
  if (notice.targetType === 'chat')
    return notice.kind === 'mention'
      ? { text: 'mencionou você no chat', tone: 'mention', system: false }
      : notice.kind === 'reply'
        ? { text: 'respondeu você no chat', tone: 'reply', system: false }
        : { text: 'enviou uma mensagem', tone: 'chat', system: false }
  if (notice.followAction === 'request') return { text: 'pediu para seguir você', tone: 'follow', system: false }
  if (notice.followAction === 'approved') return { text: 'aceitou seu pedido para seguir', tone: 'follow', system: false }
  if (notice.kind === 'event_reminder') return { text: phrases.event_reminder, tone: 'event', system: true }
  const tone: NotificationTone =
    notice.kind === 'like' ? 'like'
      : notice.kind === 'mention' ? 'mention'
        : notice.kind === 'comment' || notice.kind === 'reply' ? 'reply'
          : notice.kind === 'follow' ? 'follow'
            : notice.kind === 'invitation' ? 'invite'
              : notice.kind === 'event' ? 'event'
                : notice.kind === 'reading' || notice.kind === 'book' ? 'reading'
                  : notice.kind === 'post' ? 'wall'
                    : notice.clubId ? 'club' : 'community'
  return { text: phrases[notice.kind] ?? 'compartilhou uma novidade', tone, system: false }
}

/** Agrupa por período, no fuso do aparelho: Hoje, Ontem e Anteriores. */
export function periodOf(iso: string, now = new Date()): 'today' | 'yesterday' | 'earlier' {
  const date = new Date(iso)
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  if (date.getTime() >= start) return 'today'
  if (date.getTime() >= start - 86400000) return 'yesterday'
  return 'earlier'
}

/** Hora curta: "14:05" hoje e ontem; "12 nov" antes. */
export function timeLabel(iso: string, now = new Date()) {
  const date = new Date(iso)
  return periodOf(iso, now) === 'earlier'
    ? date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', '')
    : date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
