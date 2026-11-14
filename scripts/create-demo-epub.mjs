import { zipSync, strToU8 } from 'fflate'
import sharp from 'sharp'
import { mkdir, writeFile } from 'node:fs/promises'
const title = 'A cadeira perto da janela',
  author = 'Clube do Livro · texto de demonstração'
const chapters = [
  [
    'A primeira página',
    [
      'Toda quinta-feira, Clara chegava à biblioteca antes das outras pessoas. Não era pontualidade: gostava de observar a sala vazia. Havia uma cadeira perto da janela que recebia o último sol da tarde. Naquela semana, encontrou sobre ela um livro sem marcador e um bilhete: “Pode começar por qualquer página”.',
      'Clara abriu o volume no meio. A história falava de alguém que tinha medo de interromper uma conversa. Ela riu, porque passara o dia adiando uma pergunta. Quando a primeira participante do clube chegou, Clara deixou o livro aberto e ofereceu a cadeira. “Antes da leitura”, disse, “posso perguntar uma coisa?”',
    ],
  ],
  [
    'As vozes da sala',
    [
      'A pergunta não era sobre o final do livro. Clara queria saber por que cada pessoa voltava ali. Uma vinha pelo silêncio anterior à conversa. Outra gostava de discordar sem precisar vencer. Um rapaz confessou que às vezes não terminava a leitura, mas nunca perdia a vontade de escutar.',
      'Falaram durante algum tempo, até que o sol saiu da janela. As respostas não couberam no bilhete. Clara buscou uma folha maior e a deixou no centro da mesa. Ninguém escreveu uma regra. Escreveram convites: traga uma dúvida, leia devagar, peça para voltar a uma frase. Havia espaço para mais uma linha.',
    ],
  ],
  [
    'O lugar que fica',
    [
      'Na quinta-feira seguinte, a cadeira estava ocupada por uma leitora nova. Clara escolheu outra, perto da porta. O livro passou de mão em mão. Algumas páginas tinham sido revisitadas; outras ainda guardavam silêncio. Quando a conversa começou, a recém-chegada ergueu os olhos e perguntou se podia ler um trecho.',
      'Clara reconheceu a página do primeiro encontro. Percebeu, então, que um clube não precisava de uma única cadeira favorita. Precisava de lugares que pudessem mudar. No fim da tarde, guardou o bilhete dentro do livro. A última linha continuava em branco, esperando quem chegasse depois.',
    ],
  ],
]
const license =
  'Texto original preparado para demonstrar este aplicativo. Leitura, cópia e distribuição autorizadas com o Clube do Livro. Não contém obras de terceiros.'
const escape = (text) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
const xhtml = (name, body) =>
  strToU8(
    `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" lang="pt-BR"><head><title>${name}</title></head><body>${body}</body></html>`,
  )
const cover = await sharp(
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#442b64"/><rect x="80" y="110" width="440" height="580" rx="6" fill="#f8f0df"/><path d="M150 220h300v340H150z" fill="#bc775e"/><path d="M190 180h180v400H190z" fill="#dac079"/><path d="M280 240h110v380H280z" fill="#789b8c"/></svg>',
  ),
)
  .png()
  .toBuffer()
const files = {
  mimetype: [strToU8('application/epub+zip'), { level: 0 }],
  'META-INF/container.xml': strToU8(
    '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
  ),
}
files['OPS/cover.png'] = cover
files['OPS/cover.xhtml'] = xhtml(
  title,
  `<h1>${title}</h1><p>${author}</p><img src="cover.png" alt="Ilustração original de livros sobrepostos"/><p>${license}</p>`,
)
files['OPS/nav.xhtml'] = xhtml(
  'Sumário',
  `<nav xmlns:epub="http://www.idpf.org/2007/ops" epub:type="toc"><h1>Sumário</h1><ol>${chapters.map(([name], i) => `<li><a href="chapter-${i}.xhtml">${name}</a></li>`).join('')}</ol></nav>`,
)
for (const [i, [name, paragraphs]] of chapters.entries())
  files[`OPS/chapter-${i}.xhtml`] = xhtml(
    name,
    `<h1>${name}</h1>${paragraphs.map((p) => `<p>${escape(p)}</p>`).join('')}`,
  )
files['OPS/book.opf'] = strToU8(
  `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="book-id">urn:uuid:790ad11a-b6ae-431b-96dc-f3663e7f163e</dc:identifier><dc:title>${title}</dc:title><dc:creator>${author}</dc:creator><dc:language>pt-BR</dc:language><dc:rights>${license}</dc:rights><meta property="dcterms:modified">2026-11-14T00:00:00Z</meta></metadata><manifest><item id="cover-image" href="cover.png" media-type="image/png" properties="cover-image"/><item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>${chapters.map((_, i) => `<item id="chapter-${i}" href="chapter-${i}.xhtml" media-type="application/xhtml+xml"/>`).join('')}</manifest><spine><itemref idref="cover"/>${chapters.map((_, i) => `<itemref idref="chapter-${i}"/>`).join('')}</spine></package>`,
)
await mkdir('public/books', { recursive: true })
await writeFile('public/books/a-cadeira-perto-da-janela.epub', zipSync(files, { level: 6 }))
console.log('EPUB original de demonstração gerado.')
