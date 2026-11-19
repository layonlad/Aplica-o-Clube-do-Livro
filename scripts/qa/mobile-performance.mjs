import { chromium, webkit, devices } from 'playwright'
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const variant = process.argv[2] ?? 'candidate'
if (!['baseline', 'candidate'].includes(variant)) throw Error('Escolha baseline ou candidate.')
const engine = process.argv[3] ?? 'chrome'
function localOrigin(value) {
  const url = new URL(value)
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.username || url.password || url.href !== url.origin + '/') {
    throw Error('Use exclusivamente serviços HTTP locais e descartáveis.')
  }
  return url.origin
}
const root = localOrigin(process.env.BENCH_APP_ORIGIN ?? 'http://localhost:5173')
const api = localOrigin(process.env.BENCH_API_ORIGIN ?? 'http://localhost:3001') + '/v1'
const auth = localOrigin(process.env.BENCH_AUTH_ORIGIN ?? 'http://127.0.0.1:9099')
const body = 'Foto sintética de referência de desempenho ' + randomUUID()
process.env.FIREBASE_AUTH_EMULATOR_HOST = new URL(auth).host
const admin = getAuth(initializeApp({ projectId: 'demo-clube-do-livro' }))
const account = { email: 'mobile-' + randomUUID() + '@example.invalid', password: randomUUID() + 'Ab!' }

async function seed() {
  await admin.createUser({ ...account, emailVerified: true, displayName: 'Leitora de teste' })
  const creds = await fetch(`${auth}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...account, returnSecureToken: true }),
  }).then(r => r.json())
  async function post(route, data) {
    const r = await fetch(api + route, { method: 'POST', headers: { Authorization: 'Bearer ' + creds.idToken, 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
    if (!r.ok) throw Error(route + ': ' + r.status + ' ' + (await r.text()).slice(0, 200))
    return r.json()
  }
  const { id, suspended, ...profile } = await fetch(api + '/me/profile', {headers:{ Authorization: 'Bearer ' + creds.idToken }}).then(r => r.json())
  await post('/me/profile', { ...profile, isPublic: true })
  const width = 1800, height = 1200
  const pixels = Buffer.alloc(width * height * 3)
  for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 71 + (i >> 5) * 17) % 251
  const jpeg = await sharp(pixels, { raw: { width, height, channels: 3 } }).jpeg({ quality: 84 }).toBuffer()
  const media = await post('/public/media', { kind: 'image', data: jpeg.toString('base64') })
  await post('/public/posts', { body, mediaIds: [media.id] })
}
await seed()
const launcher = engine === 'webkit' ? webkit : chromium
const executablePath = process.env.BENCH_CHROMIUM_PATH
const browser = await launcher.launch(engine === 'chrome' && executablePath ? { executablePath } : {})
const context = await browser.newContext({ ...(engine === 'webkit' ? devices['iPhone 15'] : devices['Pixel 7']), viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
const page = await context.newPage()
const errors = [], requests = [], responses = []
page.on('pageerror', error => errors.push(error.message))
page.on('request', req => {
  if (req.method() === 'GET' && req.url().startsWith(api)) requests.push(req.url().slice(api.length))
})
page.on('response', res => {
  const url = res.url()
  if (url.startsWith(api) && url.includes('/content?') && res.ok()) {
    const length = Number(res.headers()['content-length'] ?? 0)
    responses.push({ variant: new URL(url).searchParams.get('variant'), bytes: length })
  }
})
await context.route(api + '/**', async route => {
  if (route.request().url().includes('/catalog?')) return route.fulfill({ json: { items: [] }, headers: { 'Access-Control-Allow-Origin': root } })
  await new Promise(resolve => setTimeout(resolve, 125))
  return route.continue()
})
await page.addInitScript(() => {
  sessionStorage.setItem('clube-livro-intro-seen', '1')
  addEventListener('DOMContentLoaded', () => {
    const style = document.createElement('style')
    style.textContent = '.firebase-emulator-warning{display:none!important}'
    document.head.append(style)
  })
  window.testMetrics = { lcp: null, cls: null, events: [] }
  for (const type of ['largest-contentful-paint', 'layout-shift', 'event']) {
    if (!PerformanceObserver.supportedEntryTypes.includes(type)) continue
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) {
        if (type === 'largest-contentful-paint') window.testMetrics.lcp = entry.startTime
        if (type === 'layout-shift' && !entry.hadRecentInput) window.testMetrics.cls = (window.testMetrics.cls ?? 0) + entry.value
        if (type === 'event' && entry.interactionId) window.testMetrics.events.push(entry.duration)
      }
    }).observe({ type, buffered: true, ...(type === 'event' ? { durationThreshold: 16 } : {}) })
  }
})
const nav = name => page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link', { name, exact: true })
const report = { variant, engine, switchMs: [], unsupported: ['INP p75', 'LCP p75', 'CLS p75'] }
try {
  await page.goto(root + '/#/app')
  await page.getByLabel('E-mail', { exact: true }).fill(account.email)
  await page.getByLabel('Senha', { exact: true }).fill(account.password)
  await page.getByRole('button', { name: 'Entrar', exact: true }).click()
  await nav('Comunidade').waitFor()
  const photo = page.locator('img').filter({ visible: true }).and(page.locator('.media-open > img')).first()
  await page.getByText(body, { exact: true }).first().waitFor()
  await photo.scrollIntoViewIfNeeded()
  await photo.waitFor()
  await page.waitForTimeout(500)
  const before = requests.length, beforeImages = responses.length
  for (let i = 0; i < 4; i++) {
    await nav('Biblioteca').click()
    await page.getByRole('heading', {name:'Biblioteca', exact:true}).first().waitFor()
    const started = Date.now()
    await nav('Comunidade').click()
    await page.getByText(body, { exact: true }).first().waitFor()
    const textMs = Date.now() - started
    await photo.scrollIntoViewIfNeeded()
    await photo.waitFor()
    report.switchMs.push({ textMs, photoMs: Date.now() - started })
    await page.waitForTimeout(300)
  }
  report.requests = requests.slice(before)
  report.photos = responses.slice(beforeImages)
  report.metrics = await page.evaluate(() => window.testMetrics)
  report.heap = engine === 'chrome' ? await page.evaluate(() => performance.memory.usedJSHeapSize) : null
  report.widths = []
  for (const width of [320, 360, 375, 390, 393, 414, 430, 600, 768, 820, 1024, 1366]) {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 820 })
    report.widths.push(await page.evaluate(() => ({ width: innerWidth, doc: document.documentElement.scrollWidth })))
  }
  if (process.env.RUN_MATRIX === '1') {
    report.routes = []
    const names = ['Início', 'Explorar', 'Biblioteca', 'Comunidade', 'Perfil']
    for (const width of [320, 360, 375, 390, 393, 414, 430, 600, 768, 820, 1024, 1366]) {
      await page.setViewportSize({ width, height: width < 600 ? 844 : 820 })
      for (const name of names) {
        await nav(name).click()
        await page.waitForFunction((tab) => document.querySelector('.bottom-nav a[aria-current=page]')?.textContent.trim() === tab, name)
        await page.getByRole('main').locator('h1').first().waitFor()
        const bounds = await page.evaluate(() => ({
          viewport: innerWidth, document: document.documentElement.scrollWidth,
          active: document.querySelector('.bottom-nav a[aria-current=page]')?.textContent,
        }))
        assert.ok(bounds.document <= bounds.viewport, JSON.stringify({ name, ...bounds }))
        assert.equal(bounds.active?.trim(), name)
        report.routes.push({ width, name })
      }
    }
    await page.setViewportSize({ width: 820, height: 390 })
    await nav('Comunidade').click()
    await page.getByText(body, { exact: true }).first().waitFor()
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    report.landscape = true
  }
  report.errors = errors
  await mkdir('.local-data', { recursive: true })
  await writeFile('.local-data/' + variant + '-' + engine + '.json', JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ ...report, requests: report.requests.length }, null, 2))
  assert.deepEqual(errors, [])
  assert.ok(report.widths.every(({ width, doc }) => doc <= width), 'A página transborda horizontalmente.')
} finally {
  await browser.close()
}
