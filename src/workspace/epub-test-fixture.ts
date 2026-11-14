import { zipSync, strToU8 } from 'fflate'
export function syntheticEpub(
  chapter = '<h1>Primeiro capítulo</h1><p>Uma história original para os testes.</p>',
  extra: Record<string, Uint8Array> = {},
) {
  return zipSync({
    mimetype: strToU8('application/epub+zip'),
    'META-INF/container.xml': strToU8(
      '<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>',
    ),
    'OPS/book.opf': strToU8(
      '<package xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Livro de teste</dc:title><dc:creator>Equipe de teste</dc:creator></metadata><manifest><item id="one" href="one.xhtml"/><item id="two" href="two.xhtml"/></manifest><spine><itemref idref="one"/><itemref idref="two"/></spine></package>',
    ),
    'OPS/one.xhtml': strToU8(
      '<html><head><title>Não faz parte do texto</title></head><body>' + chapter + '</body></html>',
    ),
    'OPS/two.xhtml': strToU8(
      '<html><body><h1>Segundo capítulo</h1><p>A história continua aqui.</p></body></html>',
    ),
    ...extra,
  })
}
