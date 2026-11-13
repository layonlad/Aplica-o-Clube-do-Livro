# Auditoria para evolução da plataforma

Data: 13/11/2026. Base: `bd94489` (`main`). Requisitos: `PLATAFORMA_SOCIAL_REQUISITOS.md`.

## Estado observado

| Área | Implementado | Diferença para o novo produto |
| --- | --- | --- |
| Identidade | Firebase Auth e validação de sessão/revogação no Fastify | Perfil público separado da identidade privada; bloqueios, preferências e exclusão de conta |
| Visitante | Espaço pessoal IndexedDB, sem cadastro | Preservar esta entrada; comunidade pública deve poder ser lida sem conta |
| Conta pessoal | Biblioteca, progresso, avaliação, notas e backup em PostgreSQL | Metadados completos, estantes, capítulos, destaques, anotações e arquivo EPUB original privado |
| Clubes | Vários clubes, owner/member, convites com hash, remoção/reativação | Admin/moderador, descoberta opt-in, solicitações, mural e galeria próprios |
| Conteúdo | Fórum, fotos de eventos e sorteios em JSONB por clube | Feed público e mural privado paginados; comentários, likes e notificações normalizados |
| Leitor | Texto extraído do EPUB/TXT, páginas fixas, marcador e progresso | Capítulos, sumário, busca, tipografia/margens/temas e destaques privados |
| Infraestrutura | Firebase Hosting/Auth; Render Free; Neon Free | Storage persistente privado ainda não provisionado; não armazenar vídeos no JSONB nem no disco efêmero |
| Qualidade | Vitest, Testing Library, PG temporário, Auth Emulator, CI | Ampliar cenários de isolamento, paginação, uploads, moderação e navegação |

O Neon foi consultado somente em leitura. Foram confirmadas dez tabelas: `users`, `clubs`, `club_memberships`, `invites`, `invite_acceptances`, `audit_logs`, `schema_migrations`, `personal_workspaces`, `club_workspaces` e `club_reading_states`. Não existem tabelas de feed, seguidores, perfis sociais ou notificações. A produção não foi migrada.

Depois desta auditoria inicial, o proprietário autorizou criar o bucket privado e a credencial de storage. A operação e as mudanças efetivamente implementadas estão em `ENTREGA_PLATAFORMA_01.md`; não houve deploy ou migration da nova aplicação em produção.

Dependências principais: React 18, React Router 7, Vite 8, TypeScript, Fastify 5, `pg` 8, Zod 4, Firebase Web/Admin e fflate. O projeto usa npm workspaces e SQL versionado com checksum; manter esses padrões, sem introduzir ORM, trocar autenticação ou reescrever a aplicação.

## Riscos e decisões

1. **Volume e concorrência:** o snapshot JSONB inteiro contém texto de livros e imagens; GETs recebem lock de escrita e carregam todo o histórico. É adequado apenas ao volume limitado atual. Novos módulos sociais terão tabelas próprias e cursor `(created_at,id)`, com limite máximo de página. Não ampliar o snapshot para virar feed.
2. **Privacidade:** `users.email` permanece exclusivamente na API autenticada. `profiles` expõe somente campos escolhidos pelo titular. Visibilidade pública será opt-in; clubes existentes continuam privados. Publicar em um clube jamais cria cópia pública.
3. **Arquivos:** Render tem disco efêmero; Firebase Storage não está provisionado na alternativa gratuita atual. Definir storage privado e limite de custo antes de ativar vídeos/arquivos remotos. Não criar URLs públicas duráveis para EPUBs ou fotos privadas.
4. **Migração:** preservar migrations 001/002 e seus checksums. Adicionar tabelas e campos opcionais; manter leitura dos backups v1 e o acesso aos dados antigos. Backfill deve ser idempotente, gerar contagens de reconciliação e ser testado em ambiente isolado antes da autorização de produção.
5. **Permissões:** manter o proprietário protegido. Moderação, acervo, membros e configuração terão capacidades explícitas, validadas na mesma transação que a alteração. Não confiar em papel, autor ou visibilidade recebidos do navegador.
6. **Operações públicas:** leitura anônima terá DTO próprio e paginação. Mutação exige identidade confirmada. Likes/follows/salvamentos terão chaves únicas; bloqueio deve ser aplicado em feed, pesquisa, perfil, comentários e notificações.
7. **Dados pessoais:** não enviar automaticamente notas, arquivos, metas ou histórico ao perfil público. Conteúdo de notificações privadas será consultado com autorização atual, inclusive após remoção de membro. Exclusão e retenção precisam preservar integridade e minimizar auditoria.
8. **Compatibilidade:** alterações nesta branch não são compatíveis com reversão indiscriminada para uma API antiga que apaga campos novos de snapshots. Publicação exige rollout API antes de frontend e plano de rollback por versão.

## Avaliação do leitor

Foi consultado o projeto oficial [epub.js](https://github.com/futurepress/epub.js), que fornece renderização EPUB e navegação. A integração completa exige tratar scripts, recursos externos, iframes, CFI e armazenamento do arquivo original. O importador atual usa [fflate](https://github.com/101arrowz/fflate) e renderiza somente texto, reduzindo a superfície de código ativo. A primeira evolução amplia esse caminho preservando capítulos, metadados e localização textual; não deve ser anunciada como renderização fiel do EPUB original.

## Plano de execução e aceite

| Fase | Entrega e dependências | Critério de aceite |
| --- | --- | --- |
| 1 | Auditoria, matriz, arquitetura, contratos e migração | Situação real documentada, sem alteração em produção |
| 2 | Metadados, estantes, capítulos, busca, destaques/notas e preferências; depende de identidade/backup existentes | Dados antigos continuam legíveis; nota privada não aparece no clube; posição retoma; importação inválida falha sem apagar dados |
| 3 | Capacidades, configurações/solicitações, mural privado, álbuns e fórum; depende de media privado para uploads remotos | Membro de A não lê B; remoção revoga novas consultas; só autor/moderação altera conteúdo; galeria vinculada ao evento |
| 4 | Perfis opt-in, feed, enquetes, follows, likes, comentários, bloqueios, denúncias e Explorar | DTO sem e-mail; sem duplicações; cursor estável; conteúdo privado nunca aparece nas consultas públicas |
| 5 | Central de notificações e links entre livro, leitura coletiva, evento e publicação | Nenhuma notificação revela item inacessível; compartilhamento exige seleção explícita de público/clube |
| 6 | Testes integrados/E2E, acessibilidade, desempenho e operação | Suites passam, cargas limitadas, upload verificado, migração ensaiada, release revisável |

Cada fase gera código, testes e registro de pendências. A aprovação anterior do merge da versão atual não substitui a autorização específica para publicar a nova rede social. O novo documento exige aprovação antes de operações de produção; preparar a entrega revisável antes de solicitá-la. Nenhum plano pago será contratado implicitamente.
