/** Ambientes locais: desenvolvimento, Staging (candidata de produção) e chat (ensaio do chat dos clubes). */
export type LocalMode = 'local' | 'staging' | 'chat'

export function localMode(argv: string[]): LocalMode {
  return argv.includes('--staging') ? 'staging' : argv.includes('--chat') ? 'chat' : 'local'
}

export function localProfile(mode: LocalMode) {
  if (mode === 'staging')
    return { mode, directory: '.local-data/staging', projectId: 'demo-clube-do-livro-staging', frontend: 5174, api: 3002, postgres: 54330, auth: 9199, config: 'firebase.staging-local.json', emulators: 'auth,firestore', chat: true }
  if (mode === 'chat')
    return { mode, directory: '.local-data/chat', projectId: 'demo-clube-do-livro', frontend: 5178, api: 3008, postgres: 54338, auth: 9198, config: 'firebase.chat.json', emulators: 'auth,firestore', chat: true }
  return { mode, directory: '.local-data', projectId: 'demo-clube-do-livro', frontend: 5173, api: 3001, postgres: 54329, auth: 9099, config: 'firebase.json', emulators: 'auth', chat: false }
}
