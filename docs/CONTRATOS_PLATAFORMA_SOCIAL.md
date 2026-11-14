# Contratos planejados da plataforma

Status: desenho técnico; só rotas implementadas e testadas poderão ser marcadas como disponíveis. A API `/v1` atual continua compatível. Novas rotas paginadas serão separadas do snapshot legado.

## Contratos implementados na entrega 01

- `GET /v1/catalog?q=`: consulta bibliográfica anônima, 2–100 caracteres, até 12 resultados; não expõe biblioteca particular nem arquivo para download.
- `POST /v1/me/workspace` e `/v1/clubs/:id/workspace`: novas ações `book.metadata`, `shelf.add/remove`, `reader.preferences`, `reading.annotate`, `reading.annotation.remove` e campos de `reading.update` para status, favorito, estante, localização e revisão esperada. Preferências e anotações do clube ficam no registro do usuário.
- `GET/POST /v1/me/book-files/:bookId`: consulta de arquivo e upload JSON/base64, autenticados. POST limitado a cinco por minuto, valida EPUB e reserva cota. Somente um original ativo por livro e hash dentro da conta.
- `GET /v1/me/files/:id/content`: download binário autenticado, sem URL de storage no DTO; erro 404 para outro titular ou livro removido.
- `DELETE /v1/me/files/:id`: revoga acesso antes da remoção física; 200 quando purgado, 202 quando a limpeza física precisa ser repetida.

## Contratos implementados nas entregas 02/03

- `GET /v1/discover/clubs`: descoberta anônima paginada de clubes opt-in; não concede acesso ao conteúdo.
- `/v1/clubs/:clubId/settings`, `/members`, `/members/:userId/role`, `/join-requests`, `/join-requests/:id/review` e `/leave`: capacidades e associação validadas no servidor.
- `/v1/clubs/:clubId/posts`: mural privado paginado, com rotas de edição, remoção, like, save, vote e comentários/respostas. Identidade e clube são determinados pela API.
- `/v1/clubs/:clubId/media` e `/media/drafts`: processamento e recuperação paginada de mídia própria. `/v1/media/:id/content` entrega bytes privados após autorização atual; `/v1/media/:id` revoga/exclui conforme titularidade ou moderação.
- `/v1/clubs/:clubId/albums`, `/albums/:albumId/photos`, `/photos/:mediaId/tags` e `/consent`: álbuns, política de upload/download e identificação consentida.
- `/v1/clubs/:clubId/forum/topics`: tópicos paginados, fixados separados, detalhe, edição com versão, moderação, like e respostas com fotos. O mural não é o fórum.
- `/v1/clubs/:clubId/workspace?view=app`: snapshot sem histórico do fórum e com `forumCount`. A projeção anterior e as ações `topic.*` continuam compatíveis pelo adaptador normalizado.

Limites, verificação e pendências: `ENTREGA_PLATAFORMA_02.md` e `ENTREGA_PLATAFORMA_03.md`.

As rotas `/v2` a seguir são propostas para fases futuras, não interfaces já disponíveis.

## Limites e identidade

Todos os identificadores são UUID; cursores opacos codificam `(created_at,id)`. Páginas usam `limit` padrão 20, máximo 50, e retornam `{items,nextCursor}`. Mutação autenticada sempre determina `actor_user_id` no servidor. Texto nunca será renderizado como HTML sem sanitização. Resposta de conflito é 409; recurso privado inacessível retorna 404 para não confirmar sua existência.

| Ambiente | Leitura | Escrita |
| --- | --- | --- |
| Pessoal local | Visitante neste navegador | Visitante; IndexedDB e backup |
| Pessoal da conta | Somente o titular | Titular confirmado; versão por recurso |
| Comunidade | Conteúdo explicitamente público, com bloqueios e remoções aplicados | Conta confirmada, com limites contra abuso |
| Clube | Associação ativa, sem depender de visibilidade de descoberta | Capacidades conforme papel + propriedade do conteúdo |

## Módulos e rotas propostas

- `GET /v2/catalog?query=&author=&genre=&cursor=`: metadados, origem e licença; nunca implica acesso ao arquivo.
- `GET/POST /v2/me/library`, `POST /v2/me/library/:id/status`: referência de edição, estante, favorito e versão.
- `GET/POST /v2/me/reading/:id/progress`: localização estável, versão e data do servidor; alteração concorrente informa conflito sem sobrescrever silenciosamente.
- `GET/POST /v2/me/reading/:id/annotations`: destaques/notas privados com citação curta e localização.
- `POST /v2/media`, `GET /v2/media/:id/content`: upload validado e download autenticado; owner e escopo derivados pelo backend. Resposta pública de post não expõe caminho de EPUB privado.
- `GET/POST /v2/community/posts`, `GET /v2/community/posts/:id`: público explícito; consulta não faz union com mural privado.
- `GET/POST /v2/clubs/:id/posts`: leitura e escrita apenas para membros ativos. `club_id` integra as relações de comentários, mídias e álbuns.
- `POST /v2/posts/:id/like`, `/save`, `/share`, `/comments`, `/poll/vote`: ações idempotentes quando aplicável, versões para edição; share cria referência pública somente se o original já for público.
- `GET /v2/profiles/:handle`, `POST /v2/me/profile`: DTO público distinto; leituras, clubes e estatísticas com visibilidade individual.
- `POST /v2/profiles/:id/follow`, `/block`, `POST /v2/reports`: chaves únicas e checagens de bloqueio simétricas. Report não é publicado no feed.
- `GET/POST /v2/clubs/:id/albums`, `/events`, `/forum/topics`: lista paginada; arquivos e comentários vinculados ao recurso autorizado.
- `POST /v2/clubs/:id/join-requests`, `/members/:id/role`: ingresso/moderação com auditoria; proprietário não pode perder acesso por edição comum.
- `GET /v2/me/notifications`, `POST /v2/me/notifications/read`, `/preferences`: somente titular; hidratação do destino revalida associação e visibilidade.

## Modelagem por migrações aditivas

1. Catálogo: `books`, `book_editions`, `book_files`, `user_library`, `user_shelves`, `reading_progress`, `reading_highlights`, `reading_notes`. Arquivos pertencem a usuário/escopo; a referência ao catálogo não compartilha bytes.
2. Comunidade: `profiles`, `follows`, `user_blocks`, `posts`, `post_media`, `post_likes`, `comments`, `comment_likes`, `saved_posts`, `poll_options`, `poll_votes`, `reports`, `moderation_actions`.
3. Clubes: `club_settings`, `club_role_assignments`, `club_join_requests`, `club_readings`, `forum_topics`, `forum_replies`, `club_events`, `event_attendees`, `event_albums`, `album_media`.
4. Integração: `notifications`, `notification_preferences`, outbox transacional para produção de notificações sem duplicação.

FKs compostas devem impedir vincular mídia/comentário/álbum de um clube a outro. Índices incluem autor + data, clube + data, post + data e usuário + não lida. Likes/votos/follows usam chave composta única. Auditoria de moderação não armazena EPUB, corpo de comentário, token ou e-mail.

As tabelas legadas permanecem até backfill e reconciliação. A troca de leitura é feita por módulo; não executar dual-write sem controle de versão e testes de consistência. Fotos antigas inline precisam de migração de bytes para storage privado antes de remover o formato antigo.

## Contratos efetivamente implementados nas entregas 04–06

O desenho `/v2` acima é histórico e não foi publicado. A implementação modular mantém `/v1`:

- `GET /public/posts`, `/public/posts/:id`, `/public/posts/:id/comments`, `/public/profiles`, `/public/profiles/:id`, `/public/discover` e `/public/media/:id/content`: leitura anônima ou autenticada; header inválido não vira sessão anônima. Bloqueios, perfil público, remoções e publicação explícita são verificados na consulta. Descoberta resume apenas conteúdo visível dos últimos 30 dias.
- `POST /public/posts`, `/:id/edit`, `/:id/like`, `/:id/save`, `/:id/vote`, `/:id/share`, `/:id/comments` e ações de comentário: conta verificada; publicação/comentário exigem perfil público. Edição usa versão. Compartilhamento interno só referencia original público.
- `GET/POST /me/profile`, `POST /public/profiles/:id/follow` e `/block`, `GET /me/blocks`: preferências e identidade pública, relações idempotentes e bloqueios. Biblioteca exibida é uma projeção de título, autor e status; sem corpo, notas ou arquivos.
- `POST /public/media`, `GET /public/media/drafts`: mídia própria preparada para publicação pública; rascunho sem referência pública só pode ser lido pelo titular. Capa de clube tem autorização pública independente da descoberta do nome.
- `POST /reports`, `GET /me/moderation`, `GET /moderation/reports?clubId=`, `POST /moderation/reports/:id/review`: moderação privada por papel; pública por allowlist server-side de Firebase UIDs. Não entrega biografia/post tornado privado depois da denúncia a um moderador público.
- `GET /me/notifications`, `/unread`, `POST /me/notifications/read`, `GET/POST /me/notification-preferences`: central privada, preferências e referências revalidadas. Novas consultas materializam convites por e-mail e lembretes de encontros nas próximas 24h. Não enviam e-mail/push.
- `POST /me/invitations/:id/accept`: apenas convite dirigido ao e-mail verificado da conta; sem divulgar o token do convite e sem contornar remoção de membro.
- `GET/POST /clubs/:clubId/events`, `GET /:id`, `POST /:id/edit`, `/rsvp`, `GET /:id/attendees`, `POST /:id/attendees/:userId`, `GET /:id/legacy-photos` e `DELETE /:id`: calendário relacional paginado, vínculos de livro/tópico, RSVP e presença administrativa. Filtros `from`, `until`, `order=asc|desc`; cursor usa a data do encontro.
- `GET /clubs/:clubId/albums?eventId=`, `POST /albums/:albumId/policy`, `POST /albums/:albumId/photos/:mediaId/publish-public`: seleção de encontro, política com versão e cópia pública com autorização do álbum + confirmação explícita do participante. A autorização é revalidada na mesma transação da publicação.
- `GET/POST /clubs/:clubId/book-files/:bookId`, `GET /club-files/:id/content`, `DELETE /club-files/:id`: EPUB compartilhado pela administração, com origem/licença/autorização, acesso por membership atual e cota. Identificadores/arquivos pessoais não são aceitos como arquivos de clube.
- `POST /me/workspace` e `/clubs/:id/workspace`: `reading.update` aceita `epubLocator` e `epubBookmark` com hash SHA-256, capítulo e offset; `reading.epub.annotate` e `reading.epub.annotation.remove` são privadas por usuário/livro. Citação até 280 caracteres, nota até 2.000, 200 destaques EPUB/livro. Revisão impede sobrescrita silenciosa do progresso.

O snapshot novo omite histórico de fórum e fotos antigas dos encontros; calendário e fotos usam consultas paginadas/expansão explícita. O adaptador legado preserva ações e projeções limitadas durante o rollout. Rotas legadas de clube podem retornar 403; recursos novos de mídia/publicação usam 404 quando o titular ou escopo não dá acesso. Nenhuma resposta de erro inclui SQL, credenciais ou conteúdo privado.
