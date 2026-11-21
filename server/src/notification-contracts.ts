// Public wire types. Devices and notifications never expose push addresses.
export type NotificationType =
  | 'club.chat.message.created'
  | 'club.wall.post.created'
  | 'community.highlight.published'
  | 'user.mentioned'
  | 'comment.reply.created'
  | 'club.invitation.created'
  | 'club.reading.started'
  | 'club.event.created'
  | 'club.event.updated'
  | 'club.event.reminder'
  | 'like'
  | 'comment'
  | 'follow'
  | 'join_request'
  | 'join_approved'
  | 'topic'
  | 'book'
export interface NotificationDestination {
  targetType:
    | 'post'
    | 'topic'
    | 'profile'
    | 'invite'
    | 'request'
    | 'event'
    | 'book'
    | 'chat'
  targetId: string
  clubId: string | null
}
export interface Notification extends NotificationDestination {
  eventId: string
  actorId: string
  contextId: string | null
  id: string
  type: NotificationType
  kind: string
  actorName: string
  actorAvatarId: string | null
  clubName: string | null
  createdAt: string
  readAt: string | null
}
export interface NotificationPreferences {
  chatMessages: boolean
  clubWallPosts: boolean
  communityHighlights: boolean
  mentions: boolean
  replies: boolean
  invitations: boolean
  readingActivities: boolean
  clubEvents: boolean
  pushEnabled: boolean
  chatDeliveryMode: 'all' | 'grouped' | 'mentions' | 'silent'
  mutedClubIds: string[]
}
export interface NotificationDevice {
  id: string
  platform: 'web' | 'ios' | 'android'
  provider: 'fcm'
  lastSeenAt: string
}
export interface NotificationPage {
  items: Notification[]
  nextCursor: string | null
}
export interface UnreadNotificationCount {
  count: number
}
export interface NotificationSnapshot {
  retryAfterMs?: number
  revision: string
  page: NotificationPage
  unread: UnreadNotificationCount
}
