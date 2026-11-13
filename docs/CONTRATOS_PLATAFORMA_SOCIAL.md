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
