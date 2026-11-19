# Biblioteca Gratuita e Notícias Literárias

## Arquitetura e divisão de trabalho

A biblioteca pessoal e a dos clubes já usam workspaces em PostgreSQL. A API Fastify autentica com Firebase Auth, entrega arquivos pessoais do armazenamento privado e usa o mesmo serviço de posts para curtidas, comentários, salvos, bloqueios e moderação. O frontend React já possui leitor EPUB, preferências de leitura e persistência de posição.

A API adiciona o módulo `server/src/literary/` a essa estrutura. Catálogo e edições têm identificadores separados. O arquivo autorizado é empacotado uma vez na imagem da API. O workspace guarda a referência por conta, com estado e posição individuais. Notícias e assuntos seguidos usam a migration aditiva 020. As discussões são posts existentes com um autor editorial reservado, com o mesmo controle de visibilidade. O perfil editorial fica privado e não pode autenticar.

As telas, os componentes Coral e a navegação vieram do PR 43 do Claude Code. A integração usa o adaptador `src/literary/api.ts` e o leitor existente, sem carregar o EPUB na cota pessoal. O [contrato de integração](CONTRATO_FRONTEND.md) cobre rotas, campos e fluxos.

## Fontes e direitos

- A Open Library fornece pesquisas, obras, autores, edições, disponibilidade externa e capas oficiais. O servidor usa cache em memória, fila de até quatro solicitações distintas, uma partida de requisição a cada 1,1 segundo, uma repetição em caso de falha transitória e teto de 20 resultados por página. A consulta de empréstimo usa o identificador da edição exata. [APIs oficiais](https://openlibrary.org/developers/api)
- O catálogo inicial contém uma edição interna e oito referências oficiais externas do Project Gutenberg e Standard Ebooks. O adaptador de curadoria `scripts/literary/import-catalog.py` lê o CSV oficial do Gutenberg ou um Atom OPDS do Standard Ebooks obtido com permissão. Ele seleciona as edições explicitamente pedidas e gera candidatos locais com link oficial e `rights: null`. A descrição dos direitos do provedor é uma referência para curadoria. A disponibilidade de EPUB no Gutenberg precisa ser confirmada na página da edição. Compare identificadores de edição, autoria e título antes de incluir candidatos no catálogo. [Catálogo Gutenberg](https://www.gutenberg.org/ebooks/offline_catalogs.html) · [Licença Gutenberg](https://www.gutenberg.org/policy/license) · [Feeds Standard Ebooks](https://standardebooks.org/feeds)
- *A Cartomante* usa o texto original em português de Machado de Assis na coletânea *Várias Histórias* (1896), com capa tipográfica produzida para o arquivo. O original está em domínio público no Brasil. O EPUB inclui crédito e CC BY-SA 4.0 para a transcrição e o empacotamento, conforme aplicável. O servidor verifica jurisdição, evidências, permissões para a finalidade pedida e SHA-256 `eac519d66161560bc76b39d1b5ddf7cf45bb7911f5e1f25f49ea14e284363b40` antes de entregar o arquivo a uma conta autenticada. [Lei brasileira, art. 41](https://www.planalto.gov.br/ccivil_03/leis/l9610.htm) · [Coletânea no MEC](https://machado.mec.gov.br/obra-completa-lista/item/43-varias-historias) · [Transcrição, revisão 518402](https://pt.wikisource.org/w/index.php?title=A_Cartomante&oldid=518402) · [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/)
- A Agência Brasil e a Radioagência Nacional fornecem RSS oficial. A coleta filtra assuntos literários, normaliza datas, remove duplicatas e conserva manchete, fonte, data, autoria quando presente e link original. Resumos e imagens de terceiros ficam sem conteúdo até haver autorização aplicável. Um item só é associado a um livro com correspondência inequívoca de título e autoria. [RSS da EBC](https://agenciabrasil.ebc.com.br/feed/) · [Condições editoriais](https://agenciabrasil.ebc.com.br/sobre)

## Staging

1. Na branch `codex/biblioteca-noticias`, rode `npm ci` e `npm run dev:local`. O lançador inicia PostgreSQL e Firebase Auth Emulator locais, aplica migrations e serve site em `http://localhost:5173` e API em `http://127.0.0.1:3001`. O diretório ignorado `.local-data` guarda esses dados.
2. Para coletar manchetes reais no PostgreSQL local, rode em outro terminal o comando abaixo enquanto o lançador estiver ativo. Mantenha o comando e suas variáveis no ambiente local. O importador valida host, nome do banco e modo de execução.

   ```sh
   DATABASE_URL="postgresql://clube_local:$(cat .local-data/postgres-password)@127.0.0.1:54329/clube_local" \
     NODE_ENV=development FRONTEND_ORIGIN=http://localhost:5173 \
     FIREBASE_PROJECT_ID=demo-clube-do-livro FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
     npm run news:sync --workspace server
   ```

3. Com contas locais, abra Livros Gratuitos, adicione *A Cartomante*, abra o leitor e confira retomada. Verifique as restrições das edições externas. Em Notícias, abra o link original, curta, comente, salve, siga um tema e crie um debate. Compare o compartilhamento feito por um integrante com a rejeição de um estranho. A descoberta de clubes considera somente associação ativa.
4. Em staging separado, aplique a migration 020 e depois `server/ops/runtime-grants.sql` como proprietário do banco. Valide a API com o papel restrito. `LITERARY_NEWS_SYNC=true` é opcional e usa a chamada protegida de manutenção do executor existente, com aquisição de janela no banco e até uma consulta por fonte por hora. Uma fonte indisponível não descarta os registros das outras fontes. A configuração vem desativada por padrão.

## Validação do backend

- `npm run check` com codecs de vídeo, 109 testes de frontend e 51 unitários da API, builds frontend/API e validação do mapa.
- `npm run test:integration`, 93 testes PostgreSQL. Inclui migration 020, papel restrito, entrada idempotente, leitura do EPUB, isolamento de contas, gravação do progresso, deduplicação de notícias, curtida, comentário, salvos, compartilhamento no clube, debate e assuntos seguidos.
- `npm run test:auth --workspace server` sob Firebase Auth Emulator, dois testes aprovados.
- Consulta real por *Dom Casmurro* retornou três resultados e três edições pedidas. A edição OL58615644M retornou empréstimo externo. Nesta execução, a primeira consulta levou aproximadamente 1,61 s e a repetição em cache menos de 1 ms, sem nova chamada. Essa medição local é uma amostra.
- As duas URLs RSS oficiais responderam. A amostra tinha um item literário da Radioagência. Os adaptadores de importação foram exercitados com CSV e OPDS de teste.
- Chrome local validou as telas combinadas, as larguras 320, 360, 375, 390, 393, 414, 430, 768 e 1280 px, a adição e leitura de *A Cartomante*, três viradas, a retomada na mesma página, a cota pessoal em zero e a discussão de uma notícia importada do RSS oficial.

## Arquivos e liberação

A implementação está em `server/src/literary/`, `server/assets/literary/`, `server/migrations/020_literary_news.sql`, `server/ops/runtime-grants.sql`, `server/scripts/literary-news-sync.ts` e `scripts/literary/import-catalog.py`. Workspace, posts, descoberta e executor receberam a conexão necessária. Os testes novos ficam em `server/test/literary.*.test.ts`; os ensaios de atualização e permissões foram ampliados. O gerador do mapa descobre as rotas do novo módulo.

Testes em aparelhos físicos, filtros avançados no frontend, recomendações na interface e controles de compartilhamento no clube e de assuntos seguidos continuam para evolução das telas. As rotas correspondentes estão no contrato. Produção aguarda aprovação do merge e autorização de liberação. A ordem de publicação é migration e permissões, API/executor, validação das rotas, frontend e teste ponta a ponta.
