import { beforeAll, it, expect, vi } from 'vitest'
import { strToU8 } from 'fflate'
import { Blob } from 'node:buffer'
import { webcrypto } from 'node:crypto'
import { syntheticEpub } from './epub-test-fixture'
beforeAll(() => {
  vi.stubGlobal('crypto', webcrypto)
})
import { readEpub, epubPath, safeImage } from './epub-archive'
it('abre capítulos e metadados, usa hash estável e impede caminhos e recursos externos', async () => {
  const blob = new Blob([new Uint8Array(syntheticEpub())])
  const archive = await readEpub(blob)
  expect(archive.title).toBe('Livro de teste')
  expect(archive.author).toBe('Equipe de teste')
  expect(archive.chapters).toHaveLength(2)
  expect(archive.hash).toMatch(/^[a-f0-9]{64}$/)
  expect(archive.chapters[0].text).not.toContain('Não faz parte')
  expect((await readEpub(blob)).hash).toBe(archive.hash)
  expect(epubPath('https://untrusted.example/pixel.png', 'OPS/one.xhtml')).toBeNull()
  expect(epubPath('javascript:alert(1)', 'OPS/one.xhtml')).toBeNull()
  expect(epubPath('two.xhtml#nota', 'OPS/one.xhtml')).toEqual({
    path: 'OPS/two.xhtml',
    fragment: 'nota',
  })
})
it('rejeita XML com entidades, DRM, arquivos falsos e imagens com dimensões excessivas', async () => {
  await expect(readEpub(new Blob(['não é EPUB']))).rejects.toThrow('válido')
  await expect(
    readEpub(
      new Blob([new Uint8Array(syntheticEpub('<!ENTITY secret SYSTEM "file:///etc/passwd">'))]),
    ),
  ).rejects.toThrow('Entidades')
  await expect(
    readEpub(
      new Blob([
        new Uint8Array(
          syntheticEpub(undefined, { 'META-INF/encryption.xml': strToU8('<encryption/>') }),
        ),
      ]),
    ),
  ).rejects.toThrow('DRM')
  const png = new Uint8Array(24)
  png.set([137, 80, 78, 71, 13, 10, 26, 10])
  const view = new DataView(png.buffer)
  view.setUint32(16, 100000)
  view.setUint32(20, 100000)
  expect(safeImage(png)).toBeNull()
  await expect(
    readEpub(
      new Blob([
        new Uint8Array(syntheticEpub(undefined, { '../escape.xml': strToU8('<escape/>') })),
      ]),
    ),
  ).rejects.toThrow('Caminho')
})
