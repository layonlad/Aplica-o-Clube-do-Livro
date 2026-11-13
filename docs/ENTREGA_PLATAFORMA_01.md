# Entrega 01 — auditoria e base de biblioteca/leitura

Data: 13/11/2026. Branch: `codex/plataforma-social`. Não publicada.

Registro do primeiro incremento. As alterações posteriores de clubes/mural/galeria estão em [ENTREGA_PLATAFORMA_02.md](ENTREGA_PLATAFORMA_02.md).

## Situação das fases

| Fase | Estado nesta entrega |
| --- | --- |
| 1 — Auditoria/arquitetura | Concluída: código e schema real inspecionados, diagnóstico, contratos propostos, dependências e aceite registrados |
| 2 — Biblioteca/espaço pessoal | Primeiro incremento implementado e testado; renderização fiel EPUB, capas extraídas do arquivo, catálogo normalizado e compartilhamento de trechos continuam pendentes |
| 3 — Estrutura privada dos clubes | Planejada; não há novos papéis, mural separado nem galeria nova nesta entrega |
| 4 — Comunidade pública | Planejada; feed, perfis públicos, follows, bloqueios e denúncias ainda não implementados |
| 5 — Integrações/notificações | Planejada; sem central de notificações nesta entrega |
| 6 — Qualidade/otimização | Validação desta entrega executada; revisão completa de todas as futuras fases permanece pendente |

## O que mudou

- Biblioteca extraída de `WorkspaceApp.tsx` para `LibraryRoom.tsx`, mantendo as rotas e as funções existentes.
- Metadados editáveis: ISBN, editora, idioma, ano, páginas, sinopse, origem e condições de uso; capas de resultados do catálogo. Metadados não concedem arquivo ou licença.
- Consulta explícita à Open Library pelo backend, com limite de resultados, timeout, cache limitado, controle de frequência e DTO sem dados privados. A pesquisa não executa download de obras.
- Estantes Quero ler/Lendo/Concluídos/Pausados/Abandonados, favoritos e estantes personalizadas. A organização pessoal não altera o acervo de outros membros.
- Leitor extraído para `ReadingRoom.tsx`: capítulos preservados na importação, sumário, busca no conteúdo, fonte/tipografia, margens, temas claro/escuro/sépia, marcador e localização textual estável.
- Destaques de até 280 caracteres, notas privadas e exclusão. A API valida que o trecho corresponde ao texto do livro.
- Preferências e anotações sincronizadas por usuário; updates de progresso com revisão esperada detectam alterações concorrentes. Clientes antigos continuam aceitos, exigindo rollout coordenado para evitar perda de campos por uma API antiga.
- Upload/download de EPUB original privado preparado, com validação de ZIP/mimetype/container, rejeição de arquivo criptografado, limite de 10 MB por arquivo e cota inicial de 50 MB por conta. Nenhum arquivo foi enviado ao bucket para testar.
- Download da API exige token e titularidade em cada consulta. Participação no clube não concede acesso ao arquivo pessoal. Não há URL pública permanente ou token na URL.
- Deduplicação por hash dentro da conta, reserva de upload, finalização validada, revogação lógica antes da remoção física e limpeza repetível de falhas. Remover livro ou substituir backup revoga os arquivos que perderam vínculo.
- Arquivos originais são consultados só ao abrir o painel, evitando uma requisição por livro na carga inicial.

## Infraestrutura autorizada

O proprietário autorizou especificamente criar o bucket **privado** `clube-livro-media` no projeto Neon `wandering-block-99253816`, branch `br-super-term-bco4myiu`. A criação pela ferramenta MCP expirou; a API S3 oficial concluiu a operação, e a listagem Neon confirmou `access_level=private`.

Credencial `Clube do Livro API - private media` criada com escopos `storage:read` e `storage:write`, sem AI Gateway/Functions. O escopo disponível é por branch e descendentes, não por usuário final ou por objeto; a autorização dos usuários pertence à API. O projeto permanece exclusivo deste app. O segredo foi preservado em arquivo local 0600 em `.local-data/secrets/neon-media.env` no checkout principal, ignorado pelo Git. Não foi instalado no Render, colocado no frontend ou exibido em respostas.

A disponibilidade e as cotas gratuitas foram verificadas em [Neon Pricing](https://neon.com/pricing.md). Nenhum upgrade ou plano pago foi contratado.

## Migrações preparadas, não aplicadas em produção

- `003_reading_preferences.sql`: adiciona `preferences` com default compatível às tabelas pessoais e de progresso do clube. Não apaga snapshots ou altera migrations antigas.
- `004_private_book_files.sql`: tabela de arquivos privados com FKs de titular, limites, índices de unicidade e fila de estados para limpeza. O `book_id` aponta ao item do snapshot legado e é validado pela API; a normalização futura deverá convertê-lo para FK real após backfill/reconciliação.

As duas migrações foram aplicadas apenas nos bancos locais temporários dos testes. A base de produção conserva 001/002.

Também foi feito um ensaio com 56 definições de objetos exportadas dos catálogos do PostgreSQL de produção (tabelas, constraints, índices, funções e triggers), sem copiar linhas de usuários. A estrutura foi restaurada em PostgreSQL local isolado; os checksums 001/002 foram conferidos, uma fixture sintética legada foi inserida e 003/004 foram executadas duas vezes. O conteúdo e os registros anteriores foram preservados e a nova ação de progresso funcionou. Foi usado PostgreSQL embarcado 18 no ensaio; o CI cobre PostgreSQL 17, a versão de produção. Este ensaio não valida ACLs do papel restrito nem transferência real no bucket. Não foi criada uma branch Neon com cópia de dados. Um teste de regressão com base 001/002 e conteúdo legado reproduz a preservação em cada execução do CI.

## Verificação

- 14 testes de interface/importação/layout de leitura, 24 unitários da API, 17 integrações PostgreSQL e uma integração Auth Emulator/PostgreSQL passaram.
- Build de demonstração, build conectado e compilação da API concluídos.
- Prévia no navegador: cadastro com metadados, abertura do leitor, mudança para sépia, avanço de página, retomada após reload e seleção/salvamento de destaque privado. Console sem erros observados.
- O teste de arquivos usou um adapter de memória e PG local, incluindo acesso cruzado negado, deduplicação, falha de exclusão, revogação de download e limpeza posterior. Não valida uma transferência real no storage de produção.

## Operação e próxima publicação

Publicar somente após revisão e autorização específica para esta entrega. Ordem: revisar o ensaio de migrações concluído em ambiente isolado, executar migrações 003/004, conceder SELECT/INSERT/UPDATE em `private_book_files` à identidade de execução, configuração dos cinco envs de storage no servidor, deploy da API, verificações e depois frontend. Nunca enviar esses envs em variáveis `VITE_`. A aplicação publicada atual fica preservada até esse aceite.

Configuração de servidor: `MEDIA_BUCKET`, `AWS_ENDPOINT_URL_S3`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`. Sem configuração, a API responde `STORAGE_UNAVAILABLE`; não recorre a storage público ou disco temporário.

Remoções que falham fisicamente e uploads abandonados há mais de 15 minutos podem ser limpos com `npm run media:cleanup --workspace server -- --apply`, em lotes limitados e com as credenciais da API injetadas de forma segura. O comando altera dados/objetos: não foi executado em produção. Antes do rollout, definir quem executará e monitorará essa limpeza e o prazo operacional de retenção. Não há worker/cron de produção ativo nesta entrega.

Rollback: manter 001/002 e os dados originais. As migrações são aditivas, mas retornar a uma API antiga pode eliminar campos opcionais novos ao salvar snapshots; não fazer downgrade durante uso ativo sem estratégia de compatibilidade e cópia validada. Não reverter por DROP de tabelas/colunas em produção.
