import { readFile, writeFile } from 'node:fs/promises'

const config = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const packages = Object.keys(config.dependencies)
  .filter(name => name.startsWith('@fontsource-variable/') || name.startsWith('@fontsource/') || name === 'lucide-react')
  .sort()
const notices = await Promise.all(packages.map(async name => {
  const license = await readFile(new URL('../node_modules/' + name + '/LICENSE', import.meta.url), 'utf8')
  return name + '\n\n' + license.trim()
}))
await writeFile(new URL('../dist/licencas-ativos.txt', import.meta.url), notices.join('\n\n' + '-'.repeat(72) + '\n\n') + '\n')
