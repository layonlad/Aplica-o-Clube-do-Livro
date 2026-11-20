export function nextVersion(version) {
  const parts = /^(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version)
  if (!parts || !parts.slice(1).every(part => Number.isSafeInteger(Number(part)))) {
    throw new Error('A versão deve usar o formato 1.0.')
  }
  const minor = Number(parts[2]) + 1
  if (!Number.isSafeInteger(minor)) throw new Error('Número de versão fora do limite.')
  return parts[1] + '.' + minor
}

export function assertPromotion(candidate, staged, live) {
  if (staged?.environment !== 'staging' || staged.version !== candidate.version || staged.source !== candidate.source) {
    throw new Error('Publique em Staging o mesmo código e versão antes da produção.')
  }
  const expected = live ? nextVersion(live.version) : '1.0'
  if (candidate.version === expected) return
  // A mesma publicação pode ser retomada se um dos dois sites já foi atualizado.
  if (live?.version === candidate.version && live.source === candidate.source) return
  throw new Error('A próxima versão de produção deve ser ' + expected + '.')
}
