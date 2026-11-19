# Contrato v1 — Biblioteca Gratuita e Notícias literárias

Telas (Claude) prontas em `claude/biblioteca-gratuita`. Servidor (Codex) a implementar. Tipos no site: [`src/literary/contracts.ts`](../src/literary/contracts.ts). O único ponto do site que chama estas rotas é [`src/literary/api.ts`](../src/literary/api.ts).

Regras gerais:
- Rotas públicas (sem login), só leitura, prefixo `/v1`.
- Erro no formato de sempre: `{ "error": { "code", "message" } }`, mensagem em pt-BR.
- Toda URL enviada ao site é `https://`.
- Enquanto a rota não existir, o 404 padrão do Fastify (sem `error.code`) ou um `501` fazem o site mostrar "sendo conectada". Um 404 com código próprio (ex.: `FREE_BOOK_NOT_FOUND`) aparece como erro normal.
- Mudança que quebra o formato vira `v2`; não alterar a v1 em silêncio.

## Livros gratuitos

Um livro só pode sair da API depois que a licença foi verificada. Se o site receber `license.verifiedAt` vazio, ou `kind` / `source.id` fora da lista, ele descarta o item.

```ts
interface FreeBook {
  id: string                // "gutenberg:55752", "standard-ebooks:machado-de-assis/dom-casmurro"
  title: string
  authors: string[]
  language: string          // ISO 639-1: "pt", "en"…
  year: number | null
  subjects: string[]        // em português quando possível
  description: string | null
  cover: string | null      // https; de preferência servida/cacheada pela API
  pages: number | null
  source: { id: 'gutenberg' | 'standard-ebooks' | 'open-library'; name: string; url: string }
  license: { kind: 'public-domain' | 'cc0' | 'cc-by' | 'cc-by-sa' | 'other-open'; label: string; url: string | null; verifiedAt: string }
  epub: boolean             // true quando /epub entrega o arquivo
}
```

| Rota | Resposta | Uso no site |
| --- | --- | --- |
| `GET /v1/free-books/home` | `{ sections: { id, title, items: FreeBook[] }[], categories: { id, label }[] }` | Carrosséis da tela e do Explorar; `categories` vira as pílulas do cabeçalho |
| `GET /v1/free-books?q=&category=&language=&cursor=&limit=24` | `{ items: FreeBook[], nextCursor: string \| null }` | Busca, categoria e idioma ("pt", "en", "es" ou vazio) |
| `GET /v1/free-books/:id` | `FreeBook` | Antes de importar |
| `GET /v1/free-books/:id/epub` | `application/epub+zip`, até 10 MB | Download do arquivo autorizado |

Sobre o EPUB:
- O site importa o arquivo pelo fluxo de sempre (`/me/book-files`), que respeita o limite de 30 EPUBs do plano gratuito.
- O arquivo entra pelo mesmo formulário e pela mesma cota; o site não cria outro caminho de upload.
- A API precisa devolver o EPUB pelo próprio domínio. O navegador não baixa direto do Gutenberg nem do Standard Ebooks, por CORS e privacidade.

## Notícias

```ts
interface NewsItem {
  id: string
  title: string
  summary: string           // até ~300 caracteres, sem HTML
  url: string               // https, matéria original
  source: { name: string; url: string }
  image: string | null      // https; de preferência cacheada pela API
  publishedAt: string       // ISO 8601
  category: string          // id de uma das categories
}
```

| Rota | Resposta |
| --- | --- |
| `GET /v1/news?category=&cursor=&limit=20` | `{ items: NewsItem[], nextCursor: string \| null, categories: { id, label }[] }` |

Comportamento no site:
- A matéria abre no site original, com `noopener noreferrer`, e o nome da fonte aparece sempre.
- O site não copia o texto completo.
- Item sem `url` https ou com data inválida é descartado.

## Comunidade (sem rota nova)

| Aba | Fonte |
| --- | --- |
| Feed | `/public/posts` (como antes) |
| Clubes | Clubes da pessoa (`useMyClubs`) |
| Notícias | `/v1/news` |
| Debates | `/public/posts?kind=question`; "Abrir debate" publica com `kind: 'question'` |
