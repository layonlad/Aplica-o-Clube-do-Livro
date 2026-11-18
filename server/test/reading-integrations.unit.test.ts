import { validateKindleFile } from '../src/reading-integrations/kindle-export.js'
import { describe, expect, it } from 'vitest'
import { parseClippings } from '../src/reading-integrations/clippings.js'
import { matchBook } from '../src/reading-integrations/annotations.js'
import { progressInput } from '../src/reading-integrations/progress.js'

describe('My Clippings exportado', () => {
  const english = 'Ética (Ana Silva)\r\n- Your Highlight on page 12 | Location 56-58 | Added on Sunday, November 8, 2026\r\n\r\nUm destaque sintético.\r\n==========\r\n'
  const portuguese = 'Ética (Ana Silva)\n- Sua anotação na página 12 | Adicionado em domingo, 8 de novembro de 2026\n\nOutra linha.\n\nFim.\n==========\n'
  it('reconhece tipos, posição, data original, BOM e parágrafos', () => {
    const bytes = Buffer.concat([Buffer.from([255, 254]), Buffer.from(english + portuguese, 'utf16le')])
    const { entries, skipped } = parseClippings(bytes)
    expect(skipped).toBe(0)
    expect(entries).toMatchObject([
      { kind: 'highlight', location: 'Posição 56-58', sourceDate: 'Sunday, November 8, 2026' },
      { kind: 'note', location: 'Página 12', content: 'Outra linha.\n\nFim.' },
    ])
    expect(parseClippings(Buffer.from('\uFEFF' + english)).entries[0].sourceBook).toBe('Ética (Ana Silva)')
  })
  it('rejeita codificação inválida, HTML, binário e excesso de tamanho', () => {
    expect(() => parseClippings(Buffer.from([195, 40]))).toThrow('Codificação')
    expect(() => parseClippings(Buffer.from('<html><script>x</script></html>'))).toThrow('Nenhuma nota')
    expect(() => parseClippings(Buffer.from(english + '\u0000'))).toThrow('texto simples')
    expect(() => parseClippings(Buffer.alloc(256001))).toThrow('256 KB')
  })
  it('ignora marcadores e avisos de limite de recorte', () => {
    const data = english +
      'Ética (Ana Silva)\n- Your Bookmark at location 58\n\n==========\n' +
      'Ética (Ana Silva)\n- Your Highlight at location 90\n\nYou have reached the clipping limit for this item.\n==========\n'
    expect(parseClippings(Buffer.from(data))).toMatchObject({ skipped: 2, entries: [{ kind: 'highlight' }] })
  })
  it('sugere apenas quando título e autor identificam um único livro', () => {
    const book = { id: 'a', title: 'Ética', author: 'Ana Silva' }
    expect(matchBook('ÉTICA (Ana  Silva)', [book])).toBe('a')
    expect(matchBook('Ética (Outra autora)', [book])).toBeNull()
    expect(matchBook('Ética (Ana Silva)', [book, { ...book, id: 'b' }])).toBeNull()
    expect(matchBook('Ética', [book])).toBeNull()
  })
})

it('valida intervalos, datas e mantém revisão explícita no progresso manual', () => {
  const input = { percentage: 65, chapter: '5', readingDate: '2026-11-18', observation: '', includeInSummary: false, revision: 0 }
  expect(progressInput.safeParse(input).success).toBe(true)
  for (const percentage of [-1, 101, 10.5, NaN]) expect(progressInput.safeParse({ ...input, percentage }).success).toBe(false)
  expect(progressInput.safeParse({ ...input, readingDate: '2026-02-30' }).success).toBe(false)
  expect(progressInput.safeParse({ ...input, epubCfi: 'epubcfi(/2)' }).success).toBe(false)
})

it('aplica o limite de 10 MB da biblioteca e distingue o limite de 200 MB do Send to Kindle Web', () => {
  const original = { filename: 'livro.epub', permission: 'personal' as const, byteSize: 10_000_000 }
  expect(() => validateKindleFile(original)).not.toThrow()
  expect(() => validateKindleFile({ ...original, byteSize: 10_000_001 })).toThrow('até 10 MB')
  expect(() => validateKindleFile({ ...original, byteSize: 200_000_001 })).toThrow('até 200 MB')
  expect(() => validateKindleFile({ ...original, filename: 'livro.pdf' })).toThrow('EPUB válido')
  expect(() => validateKindleFile({ ...original, permission: 'blocked' })).toThrow('Confirme os direitos')
})
