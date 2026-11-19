import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { nextVersion } from './release-version.mjs'

export function releaseManifest(environment) {
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()
  if (git('status', '--porcelain')) return null
  const { version } = JSON.parse(readFileSync('release.json', 'utf8'))
  nextVersion(version)
  const commit = git('rev-parse', 'HEAD')
  const files = git('ls-tree', '-rz', 'HEAD').split('\0').filter(entry => {
    const file = entry.slice(entry.indexOf('\t') + 1)
    return file && !file.startsWith('docs/') && !file.endsWith('.md')
  })
  const source = createHash('sha256').update(files.join('\0')).digest('hex')
  return { environment, version, commit, source }
}

if (import.meta.main) console.log(JSON.stringify(releaseManifest('staging')))
