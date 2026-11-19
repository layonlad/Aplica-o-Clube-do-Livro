# Contrato Biblioteca Gratuita e Notícias

Backend no worktree `/private/tmp/clube-literary` e branch `codex/biblioteca-noticias`. As telas Coral, rotas React e conexão com o leitor ficam com o Claude, em sua própria branch. Mantenha a barra inferior com cinco destinos. Use Explorar → Livros Gratuitos e Comunidade → Feed, Clubes, Notícias, Debates. As rotas abaixo incluem o prefixo `/v1`.

## Catálogo

| Método e caminho | Campos de entrada | Resposta |
| --- | --- | --- |
| GET `/literary/search` | `q`, `title`, `author`, `isbn`, `subject`, `language` ISO-639-2, `page`, `limit`, `sort=relevance|new|old|popular` | `{items, nextPage}`. Cada item é o `CatalogEntry` existente, com `key=/works/OL…W` e `metadata.openLibraryWorkId`. |
| GET `/literary/works/:id` | `id=OL…W` | `{id,title,description,subjects,authors,source}`. `authors` contém IDs `OL…A`. |
| GET `/literary/works/:id/editions` | `page`, `limit` | `{items,nextPage}`. Itens `{id,workId,title,publishDate,publishers,languages,isbn,cover,source}`. |
| GET `/literary/open-editions/:id` | `id=OL…M` | Edição no mesmo formato e `external: {kind:'read'|'borrow'|'catalog', url}`. Leitura/empréstimo sempre abrem o site externo. |
| GET `/literary/authors` | `q`, `page`, `limit` | `{items,nextPage}`, itens `{id,name,topWork,source}`. |
| GET `/literary/authors/:id` | `id=OL…A` | `{id,name,bio,birthDate,deathDate,source}`. |
| GET `/literary/free` | `q`, `title`, `author`, `genre`, `language`, `availability=internal|external|catalog`, `format=epub|web`, `sort=relevance|new|old`, `page`, `limit` | `{items,nextPage,genres}`. Edições curadas têm `id,workId,title,author,language,year,genres,description,provider,source,format,availability,rights`. |
| GET `/literary/free/:id` | ID da edição curada | Uma edição. `rights=null` para links apenas externos. |
| POST `/me/literary/books/:id` | ID da edição curada | `{bookId,created}`. Adição idempotente à biblioteca pessoal, com os metadados `literaryEditionId,literaryWorkId`. Use `refresh(true)` e `setScope('personal')` antes de abrir `/app/reader/:bookId`. |
| GET `/me/literary/books/:id/epub` | ID da edição curada e `purpose=read|download|transfer` opcional | Binário `application/epub+zip`, autorizado no servidor. Para o leitor use `authenticatedResponse`, `response.blob()` e `readEpub` existentes. Evite `uploadOriginal` e a persistência de um arquivo de catálogo como EPUB pessoal. |
| GET `/me/literary/recommendations` | Sessão autenticada | `{books,clubs,news}` baseados em interesses da própria conta, com justificativa nos livros. |
| GET `/me/literary/books/:id/clubs` | ID da edição curada | `{items: [{id,name}]}` somente clubes com associação ativa e correspondência inequívoca. |

Use `availability === 'internal' && rights?.read` para mostrar **Ler no app**. Use `rights?.download` ou `rights?.transfer` para as ações correspondentes. Título, ISBN, capa ou disponibilidade externa nunca habilitam acesso ao arquivo por si só. Informações de catálogo salvas podem exibir “Quero ler” e usar os estados, favoritos, progresso e marcadores já disponíveis no espaço pessoal. Para relacionar uma edição a um clube, use as ações de biblioteca do clube e preserve seus controles de função.

## Notícias e debates

| Método e caminho | Campos de entrada | Resposta |
| --- | --- | --- |
| GET `/literary/news` | `category`, `cursor`, `limit` | `{items,nextCursor,categories}`. Item `{id,postId,title,summary,source,url,author,publishedAt,category,imageUrl,bookId}`. Campos opcionais retornam `null` quando a fonte não os autoriza ou fornece. |
| GET `/literary/news/:id` | UUID da notícia | Mesmo item. Use `postId` nas rotas existentes de post, curtida, comentário e salvo. Mostre sempre o link original. |
| POST `/me/literary/news/:id/share` | `{clubId: string}` para compartilhar no clube ou `{debate: true}` para criar debate público | Post real do usuário. Autorizações de membro, perfil, moderação e publicação continuam no serviço de posts. |
| GET `/me/literary/follows` | Sessão autenticada | `{topics:string[],debates:string[]}`. |
| POST `/me/literary/follows` | `{kind:'topic'|'debate',key:string,value:boolean}` | `{value}`. Assunto só é válido em `categories`; debate deve estar visível e ser público. |
| GET `/public/posts?kind=question` | Cursor padrão | Debates públicos. Usar o compositor existente com `kind=question`. |

O feed geral permanece nas rotas de posts atuais. A aba Clubes pode reaproveitar a tela de clubes ou seus componentes. Para notícias, reutilize `PostCard`/comentários ou os serviços de leitura e mutação já usados pelo componente. O post editorial identifica o tópico de discussão e contém a referência ao material publicado externamente. O servidor só agrega fontes verificadas a partir da configuração e deixa os campos de reprodução vazios por padrão.

Use as mensagens de erro existentes, trate o estado vazio quando nenhum item da fonte for literário e preserve o cursor antes de anexar a próxima página. A interface de staging precisa aguardar a API desta branch. Os casos de incompatibilidade com o contrato podem ser registrados neste documento pelos dois agentes.
