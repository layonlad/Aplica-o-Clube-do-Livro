# Aplicativo, autenticação e espaços de leitura

## Entrega funcional

O app publicado abre em `/app`, sem exigir cadastro ou participação em clube. Biblioteca, leitor, progresso, avaliações, histórico, agenda, fotos dos encontros, anotações, indicações, sorteio, perfil e aparência estão disponíveis no espaço pessoal. Visitantes persistem seus registros em IndexedDB neste navegador, com exportação/importação de backup JSON no Perfil. A aparência e a meta anual ficam neste aparelho.

Uma conta com e-mail confirmado sincroniza o espaço pessoal com PostgreSQL, sem exigir clube. O usuário pode alternar para o espaço compartilhado de um clube pelo seletor superior. Login por e-mail/senha e Google, recuperação de senha, criação de clube, participantes, criação/aceite/revogação de convites e remoção/reativação de membros continuam disponíveis em `/clubs`. Esses dados usam Firebase Authentication e PostgreSQL.

Os espaços começam vazios, sem participantes, acervos ou estatísticas fictícias. As páginas antigas com dados simulados permanecem apenas no modo `demo`, separado da versão publicada.

## Módulos e persistência

- Livros: título/autor/categoria, destaque de leitura, conteúdo de texto e remoção com confirmação. EPUB sem DRM e TXT de até 10 MB são processados no navegador; até 600 mil caracteres de texto por livro. O leitor apresenta texto, sem importar imagens ou diagramação do EPUB. XML/HTML não é inserido na página: somente texto é renderizado. Há limites para arquivos descompactados, capítulos, itens e tamanho total do espaço.
- Leitor: navegação entre páginas, fonte, modo noturno, marcador, progresso manual, conclusão e avaliação. O progresso do clube é privado por usuário e separado do acervo compartilhado.
- Agenda: data/hora, local, descrição, confirmação individual e até oito fotos JPEG por evento, reduzidas no navegador antes de salvar. Datas são armazenadas como instantes ISO e exibidas no fuso do aparelho.
- Conversas: caderno privado no espaço pessoal; tópicos, comentários, curtidas e proteção de spoilers no clube. Autor é determinado pela API. O responsável modera; cada membro pode excluir seus próprios tópicos.
- Indicações: lista pessoal livre; no clube, uma indicação por membro por rodada. O responsável sorteia e encerra a rodada com `crypto.randomInt` no servidor, guardando participantes e resultado, com auditoria append-only. Ações concorrentes usam lock do clube e versão para impedir resultados duplicados. O sorteio pessoal usa `crypto.getRandomValues` com amostragem sem viés no navegador.
- Backup: exportação do espaço escolhido; importação substitui somente o espaço pessoal, com validação de formato e limites. Ao começar a usar uma conta, o espaço local não é enviado automaticamente: o usuário pode exportar o backup local e importá-lo no espaço da conta.

`002_complete_workspace.sql` adiciona `personal_workspaces`, `club_workspaces` e `club_reading_states`. Os documentos JSONB são limitados e validados por schemas Zod e ações discriminadas; o cliente não grava snapshots arbitrários em clubes. Todas as leituras/mutações compartilhadas verificam associação ativa na transação, usando a mesma ordem de locks da remoção. O responsável gerencia acervo/encontros; membros participam sem poder reescrever o clube. Atualizações usam versão e rejeitam conflitos com HTTP 409. Atualização de progresso não altera a versão compartilhada. Não há sincronização em tempo real; recarregar consulta a versão atual.

## Decisões

- API Node.js 24 LTS + TypeScript + Fastify, em `server/`, como workspace npm.
- PostgreSQL 17 ou superior, independente do Firebase. `pg` com SQL parametrizado, migrations SQL versionadas e checksum. Não introduzir ORM antes de haver necessidade; os limites transacionais ficam explícitos neste domínio pequeno.
- Firebase ID token verificado no servidor, incluindo revogação e conta desativada. Com `FIREBASE_WEB_API_KEY`, o Admin SDK valida assinatura, emissor, audiência e expiração; `accounts:lookup` consulta a própria conta com seu token e compara `validSince` com `auth_time`. Sem essa variável, o Admin SDK usa `verifyIdToken(token, true)` e ADC. E-mail confirmado obrigatório para todas as operações privadas; falhas de consulta impedem acesso.
- Associação ativa ao clube é consultada no PostgreSQL em cada operação. O papel nunca vem do cliente, do endereço da página ou de um claim editável.
- Papéis implementados: responsável (`owner`) e membro (`member`). Admin delegado e transferência de propriedade ficam para uma etapa própria com permissões explícitas.
- Qualquer conta confirmada pode criar até cinco clubes próprios. Criar conta não dá acesso a clubes existentes; a entrada nesses clubes exige convite. O primeiro visitante nunca se torna dono de um clube já existente.
- Autenticação do navegador usa persistência de sessão. O app não copia bearer tokens para armazenamento próprio.
- Livros importados são convertidos em texto; fotos são reduzidas a JPEG. O conteúdo fica no espaço JSONB protegido, sem depender de Firebase Storage ou do disco efêmero do Render. Limites: 100 livros/encontros/rodadas, 200 conversas e 8 milhões de caracteres serializados por espaço. Armazenamento em grande escala e distribuição do EPUB original ficam fora desta versão.

## Organização

```text
server/
  migrations/001_identity_and_clubs.sql
  src/
    app.ts          HTTP, limites, CORS, validação e autenticação
    auth.ts         validação de identidade com Firebase Admin
    config.ts       configuração validada e proteção contra emulador em produção
    contracts.ts    tipos de respostas compartilhados com o frontend
    database.ts     pool e transações
    service.ts      clubes, associação, convites e auditoria
    migrations.ts   executor de migrations com checksum e lock
  test/             testes com PostgreSQL real e Firebase Auth Emulator
src/auth/           SDK cliente, sessão, login e verificação de e-mail
src/connected/      clubes, participantes e convites ligados à API
```

## Executar localmente

Requisitos: Node.js >= 24.12 e npm. Não é preciso criar um projeto Firebase real.

### Inicialização automática, sem Docker

```bash
npm ci
npm run dev:local
```

Esse comando inicia PostgreSQL em `127.0.0.1:54329`, aplica migrations, inicia Auth Emulator, API e frontend e mostra `http://localhost:5173`. Banco e exportação das contas do emulador ficam em `.local-data/`, ignorada pelo Git. Encerre com Ctrl+C para salvar as contas. O lançador usa exclusivamente o projeto `demo-clube-do-livro` e configuração local própria. Não carrega as credenciais de produção. As portas 54329, 9099, 4000, 3001 e 5173 devem estar livres. O binário PostgreSQL de desenvolvimento é instalado pelo pacote `embedded-postgres`; em sistemas sem suporte ao pacote, use a opção Compose abaixo.

### Serviços separados com Compose

Requer Docker com Compose ou PostgreSQL local equivalente.

Na raiz:

```bash
npm ci
cp .env.example .env
cp server/.env.example server/.env
docker compose up -d
npm run db:migrate
```

Abra três terminais na raiz e execute um comando em cada:

```bash
npm run auth:emulator
npm run api:dev
npm run dev -- --host 127.0.0.1
```

Abra `http://localhost:5173`. O frontend deve usar essa origem porque é a permitida pela API. Se a porta 5173 estiver ocupada, libere-a ou atualize `FRONTEND_ORIGIN`. A API escuta em `127.0.0.1:3001`, o Auth Emulator em `127.0.0.1:9099` e a interface do emulador em `http://127.0.0.1:4000`.

Crie uma conta. O emulador imprime o link de verificação no terminal; abra esse link e volte para clicar em **Já confirmei meu e-mail**. Crie o clube e um convite. Abra o link do convite em uma janela anônima, crie/confirme outra conta e aceite. A pessoa passa a aparecer na lista de participantes. Remova-a pela conta responsável e atualize o clube na segunda conta: a API recusará o acesso.

O PostgreSQL do Compose persiste em um volume exclusivo. `docker compose down` desliga os serviços sem apagar esse volume. A senha do exemplo serve apenas para o ambiente local. As contas do emulador são temporárias: ao reiniciá-lo, use uma base de desenvolvimento compatível ou configure exportação/importação explícita; não associe contas pelo e-mail para contornar mudanças de UID.

## Contrato HTTP

Todas as rotas `/v1` exigem `Authorization: Bearer <Firebase ID token>` e e-mail confirmado. Respostas de erro seguem `{ "error": { "code": "...", "message": "..." } }`.

| Método e rota | Acesso e finalidade |
| --- | --- |
| `GET /health` | Disponibilidade da API e banco |
| `GET /v1/me` | Perfil e clubes com associação ativa |
| `POST /v1/clubs` | Criar clube próprio: `{name, timezone?}` |
| `GET /v1/clubs/:clubId` | Membro ativo; clube e participantes, sem e-mails |
| `GET /v1/clubs/:clubId/invites` | Responsável; últimos 100 convites, sem segredo/hash |
| `POST /v1/clubs/:clubId/invites` | Responsável; `{email?, maxUses?, expiresInDays?}` |
| `DELETE /v1/clubs/:clubId/invites/:inviteId` | Responsável; revogar convite |
| `POST /v1/invites/accept` | Conta confirmada; `{token}` |
| `DELETE /v1/clubs/:clubId/members/:userId` | Responsável; remover acesso de membro |
| `POST /v1/clubs/:clubId/members/:userId/restore` | Responsável; reativar membro removido |

Criação retorna HTTP 201; remoções/revogações/reativação retornam 204. Erros principais: 400 para payload/convite inválido, 401 para sessão inválida, 403 para falta de permissão/e-mail não confirmado, 404 para entidade fora do clube, 409 para conflito e 429 para excesso de tentativas.

## Convites e concorrência

São gerados 32 bytes criptograficamente aleatórios, codificados em base64url; somente SHA-256 fica no banco. O segredo é retornado uma vez na criação e enviado no corpo do aceite, nunca em uma URL da API. O link do frontend usa o fragmento (`#/invite?token=...`), que não é enviado ao servidor pelo navegador. Não inserir ferramentas de analytics nessa página.

Validade: 1–30 dias, padrão de 7. Usos: 1–50, padrão de 1. Convite vinculado a e-mail tem exatamente um uso e exige coincidência com o e-mail confirmado do token. Os convites sempre concedem papel de membro.

O aceite trava a linha do clube e do convite, verifica validade, revogação, e-mail e limite, cria associação, consome o uso e registra auditoria na mesma transação. Reenvio pelo mesmo usuário ativo não consome um segundo uso. Convite antigo não reativa membro removido: somente o responsável pode fazê-lo por ação explícita.

Remoção e demais operações sensíveis seguem a mesma ordem de locks. Nenhum cache de autorização mantém acesso depois que a transação de remoção termina. A conta Firebase permanece existente. Ações administrativas e aceite geram auditoria append-only, sem senha, token ou conteúdo do convite.

## Verificações

```bash
npm run check
npm run test:integration
npm run test:e2e
npm audit
```

Os testes de integração iniciam um PostgreSQL real temporário via `embedded-postgres` e o desligam ao terminar; não exigem Docker. Alternativamente, defina `TEST_DATABASE_URL` para um PostgreSQL local cujo nome contenha `test`. Cada execução usa um schema aleatório isolado, removido ao fim. Nunca aponte testes para produção.

`test:e2e` integra o SDK Admin ao Auth Emulator e à API com PostgreSQL: cadastro, bloqueio antes da verificação, login, clube, convite, aceite, remoção e conta desativada. Os testes de interface cobrem a barreira de e-mail, estados vazios, controles por papel e falhas no aceite. A validação visual/manual complementa esses testes; o script não automatiza o navegador.

O workflow `checks.yml` roda compilação dos dois modos, testes de interface, configuração, integração, Auth Emulator e auditoria npm. O GitHub Pages continua publicando explicitamente `VITE_APP_MODE=demo`.

### Auditoria de dependências

Na validação de 13/11/2026, `npm audit --omit=dev` não reportou vulnerabilidades. A auditoria completa mantém 14 ocorrências moderadas na cadeia de desenvolvimento do `firebase-tools` (OpenTelemetry, glob/minimatch e uuid). Nenhuma ocorrência alta/crítica permanece. O override de `@grpc/grpc-js` aplica a correção da série 1.x à dependência transitiva do SDK Firebase; o produto usa apenas os módulos App/Auth. O CI bloqueia ocorrências altas/críticas. Reavaliar os avisos moderados quando a CLI publicar dependências corrigidas, sem executar o downgrade incompatível sugerido por `npm audit fix --force`.

## Ativação em produção

Antes de publicar o modo conectado, definir um projeto Firebase exclusivo, provedor PostgreSQL, hospedagem da API e origem HTTPS do frontend. Esses recursos não são provisionados pelo código.

1. Criar banco e usuários de aplicação/migration separados; limitar privilégios do usuário da API. Aplicar migrations com o usuário de implantação. A conexão deve verificar TLS conforme o provedor; não desabilitar verificação de certificado.
2. No projeto exclusivo, habilitar os provedores Email/Password e Google que serão usados, domínio autorizado e mensagens de verificação/recuperação. Ativar proteção contra enumeração de e-mails. Configurar política de senha no provedor.
3. Servidor: `NODE_ENV=production`, `DATABASE_URL`, `FIREBASE_PROJECT_ID`, `FRONTEND_ORIGIN=https://...`, `HOST=0.0.0.0` quando exigido pela plataforma. Para operar sem chave privada, definir `FIREBASE_WEB_API_KEY` com a chave pública do mesmo projeto; a conta é consultada exclusivamente com o token do próprio usuário. Como alternativa, usar ADC/identidade de workload com acesso a `firebaseauth.users.get`. Nunca criar uma variável `VITE_` com segredo de servidor. No Docker, `/etc/secrets/clube-api.env` é um arquivo opcional de ambiente carregado pelo Node, excluído do contexto de construção.
4. Remover variáveis de emulador do servidor e frontend. Build do frontend com `VITE_APP_MODE=connected`, URL HTTPS da API e configuração pública do app Firebase correto.
5. `npm run api:build`; aplicar migrations; iniciar com `npm start --workspace server`. Hospedar o frontend compilado em serviço estático próprio. Testar duas contas reais antes de liberar convites.
6. Configurar backups/restauração, observabilidade sem dados sensíveis, retenção/auditoria e exportação/exclusão de dados. O limite atual de requisições é por processo/IP; para múltiplas instâncias, usar um limitador compartilhado/gateway. `trustProxy` permanece desligado até conhecer os proxies confiáveis da hospedagem.

O modo conectado não registra service worker e usa `Cache-Control: no-store` nas respostas privadas. A estratégia offline de livros privados precisa ser desenhada na etapa do leitor.

## Próximas entregas

1. Biblioteca: livros/metadados, Storage privado, pipeline de validação e autorização de EPUBs.
2. Leitor: sanitização, CFI, sincronização de progresso, notas e histórico.
3. Comunidade: sorteio transacional, agenda/RSVP, fotos, fórum e moderação.
4. Administração avançada: delegação de permissões, transferência de propriedade e ciclo de vida de dados.

Referências: [Firebase — verificar tokens](https://firebase.google.com/docs/auth/admin/verify-id-tokens), [Auth Emulator](https://firebase.google.com/docs/emulator-suite/connect_auth), [transações com pg](https://node-postgres.com/features/transactions), [locks do PostgreSQL](https://www.postgresql.org/docs/current/explicit-locking.html).
