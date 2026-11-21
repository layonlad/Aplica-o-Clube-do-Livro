// Run against npm run staging:chat with a local Playwright installation.
const { chromium, webkit } = await import(
  process.env.CHAT_PLAYWRIGHT_MODULE || 'playwright'
)
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { readFile, mkdir } from 'node:fs/promises'
import { Pool } from 'pg'
import assert from 'node:assert/strict'
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9198'
const auth = getAuth(initializeApp({ projectId: 'demo-clube-do-livro' }))
const db = new Pool({
  host: '127.0.0.1',
  port: 54338,
  user: 'clube_local',
  database: 'clube_local',
  password: await readFile('.local-data/chat/postgres-password', 'utf8'),
  max: 1,
})
if (!process.env.CHAT_TEST_PASSWORD)
  throw Error('Defina CHAT_TEST_PASSWORD para as contas dos emuladores.')
const password = process.env.CHAT_TEST_PASSWORD,
  site = 'http://localhost:5178',
  api = 'http://localhost:3008/v1'
async function account(name) {
  const email = name + '@clube.test'
  await auth
    .getUserByEmail(email)
    .catch(() =>
      auth.createUser({
        email,
        password,
        emailVerified: true,
        displayName: name,
      }),
    )
  const token = (
    await (
      await fetch(
        'http://localhost:9198/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email, password, returnSecureToken: true }),
        },
      )
    ).json()
  ).idToken
  const call = async (path, body) => {
    const r = await fetch(api + path, {
      method: body ? 'POST' : 'GET',
      headers: {
        authorization: 'Bearer ' + token,
        'content-type': 'application/json',
      },
      body: body && JSON.stringify(body),
    })
    assert.ok(r.ok, r.status + ' ' + path)
    return r.json()
  }
  const me = await call('/me')
  return { email, call, me }
}
const a = await account('staging'),
  b = await account('participante')
const club =
  a.me.clubs.find((c) => c.name === 'Clube de Romance' && c.role === 'owner') ??
  (await a.call('/clubs', { name: 'Clube de Romance' }))
await db.query(
  "INSERT INTO club_memberships(club_id,user_id,role) VALUES($1,$2,'member') ON CONFLICT DO NOTHING",
  [club.id, b.me.user.id],
)
const work = '/clubs/' + club.id + '/workspace?view=app'
let snap = await a.call(work)
if (!snap.state.currentBookId) {
  if (!snap.state.books.length)
    snap = await a.call(work, {
      version: snap.version,
      action: {
        type: 'book.add',
        title: 'Dom Casmurro',
        author: 'Machado de Assis',
        category: 'Romance',
        content: '',
      },
    })
  await a.call(work, {
    version: snap.version,
    action: { type: 'book.current', id: snap.state.books[0].id },
  })
}
await a.call('/clubs/' + club.id + '/chat/settings', {
  type: 'settings',
  enabled: true,
  chapter: 'Discussão até o capítulo 5',
  slow: 1,
  pins: 3,
})
await db.end()
console.log('Clube local', site + '/#/space/' + club.id)
const browsers = []
try {
  for (const [name, engine, user] of [
    ['Chrome', chromium, a],
    ['WebKit', webkit, b],
  ]) {
    const browser = await engine.launch(
      name === 'Chrome'
        ? { executablePath: process.env.CHAT_CHROME_PATH, headless: true }
        : { headless: true },
    )
    const p = await browser.newPage({
      viewport: { width: 390, height: 840 },
      isMobile: true,
      hasTouch: true,
    })
    browsers.push([browser, p])
    p.on('pageerror', (e) => console.log('ERRO', e.message))
    await p.addInitScript(() =>
      sessionStorage.setItem('clube-livro-intro-seen', '1'),
    )
    await p.goto(site + '/#/app')
    await p.getByLabel('E-mail', { exact: true }).fill(user.email)
    await p.getByLabel('Senha', { exact: true }).fill(password)
    await Promise.all([
      p.waitForResponse((r) => r.url().includes('/v1/me/workspace') && r.ok()),
      p.getByRole('button', { name: 'Entrar', exact: true }).click(),
    ])
    await p.goto(site + '/#/space/' + club.id)
    await p.getByRole('link', { name: 'Chat do clube' }).click()
    await p.getByLabel('Mensagem para o clube', { exact: true }).waitFor()
    for (const w of [320, 360, 375, 390, 393, 414, 430, 768, 820, 1024]) {
      await p.setViewportSize({ width: w, height: w < 700 ? 810 : 1024 })
      const rect = await p.locator('.chat-shell').boundingBox()
      assert.ok(
        rect && rect.x >= 0 && rect.x + rect.width <= w + 1,
        'overflow ' + w,
      )
    }
    await p.setViewportSize({ width: 390, height: 390 })
    await p.getByLabel('Mensagem para o clube', { exact: true }).focus()
    const send = p.getByRole('button', { name: 'Enviar', exact: true })
    await send.scrollIntoViewIfNeeded()
    assert.ok(
      await send.evaluate((el) => {
        const r = el.getBoundingClientRect()
        return el.contains(
          document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
        )
      }),
      'campo encoberto',
    )
    await p.setViewportSize({ width: 840, height: 390 })
    await p.setViewportSize({ width: 390, height: 840 })
    console.log(name, '10 larguras, rotação e área visível reduzida')
  }
  const [p, q] = browsers.map((x) => x[1]),
    msg = 'Mensagem de teste ' + Date.now()
  await p.getByLabel('Mensagem para o clube', { exact: true }).fill(msg)
  await p.getByRole('button', { name: 'Enviar', exact: true }).click()
  await q.getByText(msg, { exact: true }).waitFor()
  await q.getByRole('button', { name: 'Debates', exact: true }).click()
  await q.getByRole('button', { name: 'Membros', exact: true }).click()
  await q.getByRole('button', { name: 'Chat', exact: true }).click()
  await q.getByText(msg, { exact: true }).waitFor()
  const lost = 'Recuperada ' + Date.now()
  let drop = true
  await p.route('**/v1/clubs/*/chat', async (route) => {
    if (route.request().method() === 'POST' && drop) {
      drop = false
      await route.abort('failed')
    } else await route.continue()
  })
  await p.getByLabel('Mensagem para o clube', { exact: true }).fill(lost)
  await p.getByRole('button', { name: 'Enviar', exact: true }).click()
  await p.getByRole('button', { name: 'Tentar novamente' }).click()
  await q.getByText(lost, { exact: true }).waitFor()
  assert.equal(await q.getByText(lost, { exact: true }).count(), 1)
  await q.context().setOffline(true)
  await p.waitForTimeout(1200)
  const secret = 'Fim do livro ' + Date.now()
  await p.getByRole('button', {name:'Marcar como spoiler',exact:true}).click()
  assert.equal(await p.getByRole('button',{name:'Mensagem marcada como spoiler'}).getAttribute('aria-pressed'),'true')
  await p.getByLabel('Mensagem para o clube', { exact: true }).fill(secret)
  await p.getByRole('button', { name: 'Enviar', exact: true }).click()
  await q.context().setOffline(false)
  await q.waitForFunction(
    (count) => document.querySelectorAll('.chat-list article').length >= count,
    await p.locator('.chat-list article').count(),
  )
  const reveal = q.getByRole('button', { name: /Revelar spoiler/ }).last()
  await reveal.waitFor()
  assert.equal(await q.getByText(secret, { exact: true }).count(), 0)
  await reveal.click()
  await q.getByText(secret, { exact: true }).waitFor()
  console.log('Falha de envio, nova tentativa, reconexão e spoiler validados')
  await q.setViewportSize({ width: 390, height: 840 })
  await mkdir('.local-data', { recursive: true })
  await q.screenshot({ path: '.local-data/chat-mobile.png' })
  console.log('Recebimento entre navegadores, histórico e abas aprovados')
} finally {
  for (const [browser] of browsers) await browser.close()
}
