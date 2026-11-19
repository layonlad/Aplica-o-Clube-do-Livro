#!/usr/bin/env node
// Gera o Mapa do Projeto: junta docs/mapa/mapa.json (escrito por Claude e Codex) com fatos lidos do código.
// Uso: node scripts/mapa/build.mjs [--out pasta] [--check]
//   --check  só valida o mapa.json (usado no CI); não gera arquivos.
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { execFileSync } from 'node:child_process'

const root = new URL('../../', import.meta.url).pathname.replace(/%20/g, ' ')
const args = process.argv.slice(2)
const checkOnly = args.includes('--check')
const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : join(root, 'dist-mapa')

const read = (path) => readFileSync(join(root, path), 'utf8')
const exists = (path) => existsSync(join(root, path))
const list = (dir, filter = () => true) =>
  exists(dir) ? readdirSync(join(root, dir)).filter(filter).sort() : []
const walk = (dir, filter) => {
  const result = []
  if (!exists(dir)) return result
  for (const name of readdirSync(join(root, dir))) {
    const path = join(dir, name)
    if (name === 'node_modules' || name.startsWith('.')) continue
    if (statSync(join(root, path)).isDirectory()) result.push(...walk(path, filter))
    else if (filter(path)) result.push(path)
  }
  return result
}

// ── 1. Validação do mapa escrito pelos agentes ──
const mapa = JSON.parse(read('docs/mapa/mapa.json'))
const erros = []
const exige = (cond, msg) => cond || erros.push(msg)
for (const chave of ['projeto', 'estado', 'ambientes', 'camadas', 'ligacoes', 'dados', 'fluxoPublicacao', 'jornadas', 'agentes', 'atualizacoes', 'regras'])
  exige(mapa[chave], `Falta a seção "${chave}".`)
const camadas = new Set((mapa.camadas ?? []).map((c) => c.id))
for (const d of mapa.dados ?? []) exige(camadas.has(d.onde), `dados: "${d.o_que}" aponta para camada inexistente "${d.onde}".`)
for (const l of mapa.ligacoes ?? []) exige(camadas.has(l.de) && camadas.has(l.para), `ligacoes: ${l.de} → ${l.para} usa camada inexistente.`)
for (const j of mapa.jornadas ?? []) for (const p of j.passos) exige(camadas.has(p.camada), `jornadas: "${j.titulo}" usa camada inexistente "${p.camada}".`)
for (const a of mapa.atualizacoes ?? []) exige(/^\d{4}-\d{2}-\d{2}$/.test(a.data) && a.autor && a.titulo, `atualizacoes: entrada inválida "${a.titulo ?? '?'}" (data AAAA-MM-DD, autor e título).`)
const datas = (mapa.atualizacoes ?? []).map((a) => a.data)
exige(datas.every((d, i) => i === 0 || d <= datas[i - 1]), 'atualizacoes: mantenha a mais recente no topo.')
// O mapa e o site são públicos: nada de e-mails, chaves ou URLs com credenciais.
const bruto = JSON.stringify(mapa)
exige(!/[\w.+-]+@[\w-]+\.[\w.]+/.test(bruto.replace(/@usuário/g, '')), 'O mapa não pode conter e-mails (o repositório é público).')
// O nome do serviço Google não é um valor de credencial.
const semNomeDeServico = bruto.replace(/\bSecret Manager\b/gi, '')
exige(!/(api[_-]?key|secret|password|senha=|token=|postgres(ql)?:\/\/)/i.test(semNomeDeServico), 'O mapa parece conter credenciais ou URLs de banco.')
if (erros.length) {
  console.error('Mapa do projeto inválido:\n- ' + erros.join('\n- '))
  process.exit(1)
}
if (checkOnly) {
  console.log(`Mapa válido: ${mapa.camadas.length} camadas, ${mapa.dados.length} tipos de dado, ${mapa.atualizacoes.length} atualizações.`)
  process.exit(0)
}

// ── 2. Fatos lidos do código ──
const git = (...a) => {
  try { return execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim() } catch { return '' }
}
const commits = git('log', '-25', '--format=%h%x09%ad%x09%an%x09%s', '--date=iso-strict')
  .split('\n').filter(Boolean)
  .map((line) => { const [hash, data, autor, assunto] = line.split('\t'); return { hash, data, autor, assunto } })

const rotasApi = []
for (const file of walk('server/src', (p) => p.endsWith('.ts'))) {
  const source = read(file)
  const regex = /\b(api|publicApi|literary|app)\.(get|post|delete|put|patch)\(\s*['"`]([^'"`]+)['"`]/g
  for (const m of source.matchAll(regex)) {
    const prefixo = m[1] === 'publicApi' ? '/v1/public' : m[1] === 'literary' ? '/v1/literary' : m[1] === 'api' ? '/v1' : ''
    rotasApi.push({ metodo: m[2].toUpperCase(), caminho: (prefixo + m[3]).replace(/\/+/g, '/'), arquivo: relative(root, join(root, file)) })
  }
}
const grupoRota = (c) => {
  const parte = c.replace(/^\/v1\/?/, '').split('/')[0] || 'saúde'
  return { public: 'Comunidade pública', me: 'Minha conta', clubs: 'Clubes', people: 'Perfis', invites: 'Convites', 'club-files': 'Arquivos de clube', media: 'Mídia', moderation: 'Moderação', reports: 'Denúncias', catalog: 'Catálogo', literary: 'Catálogo literário e notícias', health: 'Saúde', 'saúde': 'Saúde' }[parte] ?? parte
}

const telas = []
for (const file of ['src/workspace/WorkspaceApp.tsx', 'src/app/App.tsx'].filter(exists)) {
  for (const m of read(file).matchAll(/<Route\s+(?:index\s+)?path="([^"]+)"/g)) {
    const p = m[1]
    if (p === '*' || p === '/') continue
    const caminho = p.startsWith('/') ? p : '/app/' + p
    if (!telas.some((t) => t.caminho === caminho)) telas.push({ caminho, modo: file.includes('Workspace') ? 'app' : 'demonstração' })
  }
}

const migrations = list('server/migrations', (n) => n.endsWith('.sql')).map((arquivo) => {
  const sql = read('server/migrations/' + arquivo)
  return {
    arquivo,
    tabelas: [...sql.matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+([a-z_][a-z0-9_]*)/gi)].map((m) => m[1]),
  }
})

const contaTestes = (arquivos) => arquivos.reduce((n, f) => n + [...read(f).matchAll(/^\s*(?:it|test)(?:\.\w+)*\(/gm)].length, 0)
const testes = {
  frontend: contaTestes(walk('src', (p) => /\.test\.tsx?$/.test(p))),
  apiUnitarios: contaTestes(walk('server/test', (p) => p.endsWith('.unit.test.ts'))),
  apiIntegracao: contaTestes(walk('server/test', (p) => /integration\.test\.ts$/.test(p))),
  autenticacao: contaTestes(walk('server/test', (p) => p.endsWith('auth.test.ts'))),
}

const workflows = list('.github/workflows', (n) => /\.ya?ml$/.test(n)).map((arquivo) => {
  const y = read('.github/workflows/' + arquivo)
  const nome = (y.match(/^name:\s*(.+)$/m) ?? [])[1] ?? arquivo
  const gatilhos = [/push:/.test(y) && 'push' + ((y.match(/branches:\s*\[([^\]]+)\]/) ?? [])[1] ? ` (${(y.match(/branches:\s*\[([^\]]+)\]/) ?? [])[1].trim()})` : ''), /pull_request:/.test(y) && 'pull request', /workflow_dispatch:/.test(y) && 'manual', /schedule:/.test(y) && 'agendado'].filter(Boolean)
  return { arquivo, nome: nome.trim(), gatilhos }
})

// Só os NOMES das configurações (nunca valores).
const nomesEnv = [...walk('server/src',p=>p.endsWith('.ts')),...walk('server/scripts',p=>p.endsWith('.ts'))].flatMap(file=>[...read(file).matchAll(/(?:process\.env|env)\.([A-Z][A-Z0-9_]+)/g)].map(m=>m[1]))
const configuracoes = [...new Set([
  ...nomesEnv,
  ...[...read('server/src/config.ts').matchAll(/^\s{2}([A-Z][A-Z0-9_]+):/gm)].map((m) => m[1]),
  ...(exists('server/src/private-storage.ts') ? [...read('server/src/private-storage.ts').matchAll(/(?:'|env\.)((?:AWS|MEDIA)_[A-Z0-9_]+)/g)].map((m) => m[1]) : []),
  ...(exists('render.yaml') ? [...read('render.yaml').matchAll(/key:\s*([A-Z0-9_]+)/g)].map((m) => m[1]) : []),
])].sort()
const configuracoesFront = [...new Set([...(exists('.env.example') ? read('.env.example') : '').matchAll(/^(VITE_[A-Z0-9_]+)=/gm)].map((m) => m[1]))].sort()

const pkg = JSON.parse(read('package.json'))
const pkgApi = JSON.parse(read('server/package.json'))
const versao = (nome) => pkg.dependencies?.[nome] ?? pkg.devDependencies?.[nome] ?? pkgApi.dependencies?.[nome] ?? pkgApi.devDependencies?.[nome] ?? '—'
const pacotes = ['react', 'react-router-dom', 'vite', 'typescript', 'firebase', 'fastify', 'pg', 'zod', 'sharp', 'vitest'].map((nome) => ({ nome, versao: versao(nome) }))

const documentos = list('docs', (n) => n.endsWith('.md'))

// Quantos commits vieram depois da última atualização registrada no mapa (sinal de mapa desatualizado).
const ultima = mapa.atualizacoes[0]?.data ?? '1970-01-01'
const commitsDepois = commits.filter((c) => c.data.slice(0, 10) > ultima && !/^Merge /.test(c.assunto)).length

const automatico = {
  geradoEm: new Date().toISOString(),
  branch: process.env.GITHUB_REF_NAME || git('rev-parse', '--abbrev-ref', 'HEAD'),
  commit: process.env.GITHUB_SHA?.slice(0, 7) || git('rev-parse', '--short', 'HEAD'),
  commits,
  commitsDepois,
  rotasApi: rotasApi.map((r) => ({ ...r, grupo: grupoRota(r.caminho) })),
  telas,
  migrations,
  tabelas: migrations.flatMap((m) => m.tabelas),
  testes,
  workflows,
  configuracoes,
  configuracoesFront,
  pacotes,
  documentos,
}

// ── 3. Página ──
mkdirSync(out, { recursive: true })
const dados = JSON.stringify({ mapa, automatico }).replace(/</g, '\\u003c')
const html = read('docs/mapa/template.html').replace('/*__DADOS__*/null', dados)
writeFileSync(join(out, 'index.html'), html)
writeFileSync(join(out, 'mapa-dados.json'), JSON.stringify({ mapa, automatico }, null, 2))
console.log(`Mapa gerado em ${relative(root, out) || out}: ${telas.length} telas, ${rotasApi.length} rotas, ${automatico.tabelas.length} tabelas, ${Object.values(testes).reduce((a, b) => a + b, 0)} testes.`)
