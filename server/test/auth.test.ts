import { afterAll, beforeAll, expect, it } from 'vitest'
import { deleteApp, getApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { buildApp } from '../src/app.js'
import { createFirebaseVerifier } from '../src/auth.js'
import { readConfig } from '../src/config.js'
import { testDatabase } from './database.js'

const projectId = 'demo-clube-do-livro'
let db: Awaited<ReturnType<typeof testDatabase>>
let app: Awaited<ReturnType<typeof buildApp>>
const password = 'Only-local-tests-2026!'
async function authRequest(action: string, body: unknown) {
  const response = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:${action}?key=demo-key`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const result = await response.json() as { idToken: string; localId: string; error?: unknown }
  if (!response.ok) throw new Error(JSON.stringify(result.error))
  return result
}
const headers = (token: string) => ({ authorization: `Bearer ${token}` })
beforeAll(async () => {
  readConfig({ ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL, FIREBASE_PROJECT_ID: projectId, FRONTEND_ORIGIN: 'http://localhost:5173' })
  db = await testDatabase()
  app = await buildApp({ pool: db.pool, origin: 'http://localhost:5173', verifyToken: createFirebaseVerifier(projectId, 'demo-key') })
})
afterAll(async () => { await app?.close(); await db?.close(); await deleteApp(getApp()) })

it('integra cadastro, verificação, login, clube, convite e remoção com Firebase Auth e PostgreSQL', async () => {
  const suffix = Date.now()
  const ownerEmail = `owner-${suffix}@example.com`
  const memberEmail = `member-${suffix}@example.com`
  const owner = await authRequest('signUp', { email: ownerEmail, password, returnSecureToken: true })
  expect((await app.inject({ url: '/v1/me', headers: headers(owner.idToken) })).statusCode).toBe(403)
  await getAuth().updateUser(owner.localId, { emailVerified: true, displayName: 'Owner' })
  const ownerLogin = await authRequest('signInWithPassword', { email: ownerEmail, password, returnSecureToken: true })
  const clubResponse = await app.inject({ method: 'POST', url: '/v1/clubs', headers: headers(ownerLogin.idToken), payload: { name: 'Clube integrado' } })
  expect(clubResponse.statusCode).toBe(201)
  const club = clubResponse.json()
  const inviteResponse = await app.inject({ method: 'POST', url: `/v1/clubs/${club.id}/invites`, headers: headers(ownerLogin.idToken), payload: { email: memberEmail } })
  expect(inviteResponse.statusCode).toBe(201)
  const member = await authRequest('signUp', { email: memberEmail, password, returnSecureToken: true })
  await getAuth().updateUser(member.localId, { emailVerified: true })
  const memberLogin = await authRequest('signInWithPassword', { email: memberEmail, password, returnSecureToken: true })
  expect((await app.inject({ method: 'POST', url: '/v1/invites/accept', headers: headers(memberLogin.idToken), payload: { token: inviteResponse.json().token } })).statusCode).toBe(200)
  const session = (await app.inject({ url: '/v1/me', headers: headers(memberLogin.idToken) })).json()
  expect(session.clubs[0].id).toBe(club.id)
  expect((await app.inject({ method: 'DELETE', url: `/v1/clubs/${club.id}/members/${session.user.id}`, headers: headers(ownerLogin.idToken) })).statusCode).toBe(204)
  expect((await app.inject({ url: `/v1/clubs/${club.id}`, headers: headers(memberLogin.idToken) })).statusCode).toBe(403)
  await new Promise(resolve => setTimeout(resolve, 1100))
  await getAuth().revokeRefreshTokens(member.localId)
  expect((await app.inject({ url: '/v1/me', headers: headers(memberLogin.idToken) })).statusCode).toBe(401)
  await getAuth().updateUser(owner.localId, { disabled: true })
  expect((await app.inject({ url: '/v1/me', headers: headers(ownerLogin.idToken) })).statusCode).toBe(401)
  expect((await app.inject({ url: '/v1/me', headers: headers('not-a-jwt') })).statusCode).toBe(401)
})
