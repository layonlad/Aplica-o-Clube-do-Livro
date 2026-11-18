import { expect, it } from 'vitest'
import { accountReturnPath } from './return-path'

it('só volta a caminhos internos das rotas protegidas', () => {
  for (const path of ['/app/profile', '/app/reader/livro', '/invite?token=abc', '/clubs/id'])
    expect(accountReturnPath(path)).toBe(path)
  for (const path of ['//example.invalid', 'https://example.invalid', '/\\example.invalid', '/app\\example.invalid', '/account', '/outside'])
    expect(accountReturnPath(path)).toBe('/app')
})
