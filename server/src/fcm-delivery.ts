import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app'
import { getMessaging } from 'firebase-admin/messaging'
export async function sendFcm(token: string, notificationId: string) {
  const name = 'notification-delivery'
  const app =
    getApps().find((a) => a.name === name) ??
    initializeApp({ credential: applicationDefault() }, name)
  await getMessaging(app).send({
    token,
    data: { notificationId },
    notification: {
      title: 'Nova notificação',
      body: 'Abra o aplicativo para conferir.',
    },
    apns: { headers: { 'apns-collapse-id': notificationId } },
    webpush: { notification: { tag: notificationId } },
  })
}
export function fcmErrorStatus(error: unknown) {
  const code = (error as { code?: string })?.code
  if (
    code === 'messaging/registration-token-not-registered' ||
    code === 'messaging/invalid-registration-token'
  )
    return 410
  if (
    code === 'messaging/message-rate-exceeded' ||
    code === 'messaging/quota-exceeded'
  )
    return 429
  if (
    code === 'messaging/invalid-argument' ||
    code === 'messaging/mismatched-credential'
  )
    return 400
  return 503
}
