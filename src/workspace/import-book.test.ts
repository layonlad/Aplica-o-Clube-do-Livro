import { expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { importBook } from './import-book'

it('importa EPUB na ordem da publicação e remove código ativo',async()=>{
  const data=zipSync({
    'META-INF/container.xml':strToU8('<container><rootfiles><rootfile full-path="OEBPS/book.opf"/></rootfiles></container>'),
    'OEBPS/book.opf':strToU8('<package xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Minha obra</dc:title><dc:creator>Autora</dc:creator></metadata><manifest><item id="a" href="a.xhtml"/><item id="b" href="b.xhtml"/></manifest><spine><itemref idref="b"/><itemref idref="a"/></spine></package>'),
    'OEBPS/a.xhtml':strToU8('<html><head><style>CSS OCULTO</style></head><body><p>Segunda parte.</p><script>CODIGO INSEGURO</script></body></html>'),
    'OEBPS/b.xhtml':strToU8('<html><body><h1>Primeira parte.</h1><p>Texto inicial.</p></body></html>'),
  })
  const file={name:'book.epub',size:data.length,arrayBuffer:async()=>data.buffer} as File
  const result=await importBook(file)
  expect(result).toMatchObject({title:'Minha obra',author:'Autora'})
  expect(result.content).toBe('Primeira parte.\n\nTexto inicial.\n\nSegunda parte.')
  expect(result.content).not.toContain('CODIGO')
  expect(result.chapters?.map(chapter=>chapter.title)).toEqual(['Primeira parte.','Capítulo 2'])
  for(const chapter of result.chapters??[])expect(result.content.slice(chapter.start,chapter.end).length).toBeGreaterThan(0)
})
it('recusa arquivos excessivos antes de descompactar',async()=>{
  await expect(importBook({name:'large.epub',size:10000001} as File)).rejects.toThrow('10 MB')
})
