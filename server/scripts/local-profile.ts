export function localProfile(staging: boolean) {
  return staging
    ? { directory: '.local-data/staging', projectId: 'demo-clube-do-livro-staging', frontend: 5174, api: 3002, postgres: 54330, auth: 9199 }
    : { directory: '.local-data', projectId: 'demo-clube-do-livro', frontend: 5173, api: 3001, postgres: 54329, auth: 9099 }
}
