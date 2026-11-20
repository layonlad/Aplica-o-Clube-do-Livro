import { expect, it } from 'vitest'
import { nativeLinkPath } from './links'

it('abre apenas caminhos do app recebidos no domínio HTTPS autorizado', () => {
  const origin = 'https://staging.example.invalid'
  expect(nativeLinkPath(origin + '/#/invite?token=fixture', origin)).toBe('/invite?token=fixture')
  expect(nativeLinkPath(origin + '/#/app/library', origin)).toBe('/app/library')
  for (const url of ['https://example.invalid/#/app', origin + '/#//example.invalid', origin + '/#/outside', 'http://staging.example.invalid/#/app']) {
    expect(nativeLinkPath(url, origin)).toBeNull()
  }
})
