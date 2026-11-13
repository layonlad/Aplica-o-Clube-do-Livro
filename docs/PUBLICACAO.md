# Publicação do Clube do Livro

Publicado e verificado em **13/11/2026** na conta `negocio.layon@gmail.com`, usando a alternativa gratuita escolhida pelo proprietário. Nenhum serviço pago foi contratado.

## Endereços

- Aplicação: https://project-acb850f4-4bb8-45de-a84.web.app
- API: https://clube-livro-api.onrender.com
- Saúde da API e do banco: https://clube-livro-api.onrender.com/health
- Painel Render: https://dashboard.render.com/web/srv-dbrjddl9fdbs73eikb0g

O modo publicado é **conectado**: cadastro/login, clubes, membros e convites usam Firebase Authentication e PostgreSQL. Biblioteca, EPUB, progresso, avaliações, sorteios, agenda, fotos e fórum continuam no backlog, conforme `BACKEND.md`.

## Recursos configurados

| Recurso | Configuração |
| --- | --- |
| Projeto Firebase | `project-acb850f4-4bb8-45de-a84` |
| App web | `1:193866319464:web:6dfdecacaaef1a76ef9ddd` |
| Hosting | Site padrão do projeto; versão inicial `1081116535d14e0e` |
| Login | E-mail/senha e Google habilitados; domínios próprios `.web.app` e `.firebaseapp.com` autorizados |
| Render | `Layon's workspace`, ID `tea-dbril3bm8hqs73d5n5ig` |
| API | `clube-livro-api`, ID `srv-dbrjddl9fdbs73eikb0g`, Docker, **Free**, região Virginia, uma instância, sem disco |
| Deploy inicial da API | `dep-dbrjde59fdbs73eikcfg`, estado `live`, commit `34758d485c0fa5da4b4711339d93a28ca0ffb814` |
| Branch da API | `codex/backend-auth-convites`; publicação automática desligada |
| Neon | Projeto **Free** `wandering-block-99253816`, região `aws-us-east-1`, PostgreSQL 17 |
| Banco | `clube_do_livro`; branch `production`, ID `br-super-term-bco4myiu` |
| Identidades PostgreSQL | `clube_migrator` para migrations; `clube_runtime` para execução restrita da API |

A migration `001_identity_and_clubs.sql` foi aplicada em transação após aprovação e conferida pelo checksum `9839f5394e4e362143ce2f9cd816625644bd512d8dff59f061fcf81463946386`. As sete tabelas foram confirmadas. A API não pode criar bancos/papéis, ignorar RLS, atualizar o controle de migrations ou alterar/remover auditoria.

O projeto Google permanece com o nome `My First Project`. O alias `production` em `.firebaserc` aponta somente para seu ID. O faturamento Google exigiu pré-pagamento mínimo de R$ 200; o proprietário escolheu a alternativa gratuita em vez de ativá-lo. Cloud Run e Cloud SQL não foram provisionados.

## Autenticação e segredos

A organização Google bloqueou a criação de chaves privadas de contas de serviço. A conta `clube-livro-api` e o papel mínimo `clubeFirebaseUserReader` foram criados, mas nenhuma chave foi emitida e essa identidade não é usada pela API publicada.

A API opera **sem chave privada Firebase**. `FIREBASE_WEB_API_KEY` é a configuração pública do app. O Admin SDK valida assinatura, projeto, emissor e expiração do ID token. Em seguida, `accounts:lookup` consulta exclusivamente a conta do próprio token, verifica desativação e compara `validSince` com `auth_time` para rejeitar revogação. Falhas na consulta impedem acesso. Referência: [Firebase Auth REST — dados da conta](https://firebase.google.com/docs/reference/rest/auth#section-get-account-info).

`DATABASE_URL` usa a identidade `clube_runtime`, com conexão TLS, e está armazenada no arquivo secreto do Render `/etc/secrets/clube-api.env`. O Node carrega esse arquivo ao iniciar o Docker. `.dockerignore` exclui esse arquivo do contexto de construção; seu conteúdo não entra na imagem, no Git ou no frontend. Como alternativa operacional, `DATABASE_URL` também pode ser fornecida diretamente como variável de ambiente secreta.

A configuração pública do frontend fica em `.env.production.local`, ignorado pelo Git. Ela contém o projeto Firebase correto e `VITE_API_URL=https://clube-livro-api.onrender.com`. Nenhuma variável `VITE_` contém segredo de servidor.

## Verificações concluídas

- Build Docker concluído no Render e deploy confirmado como `live`.
- `/health`: HTTP 200, `{"status":"ok"}`; comprova acesso ao Neon pela credencial restrita.
- `/v1/me` sem autenticação: HTTP 401.
- Firebase Hosting: HTTP 200, modo conectado; tela de login aberta no navegador sem erros de console.
- Provedores de login e domínios autorizados conferidos na configuração Firebase.
- Teste real explicitamente autorizado: conta temporária recebeu 403 sem e-mail confirmado, 401 quando desativada e 401 após revogação da sessão. As contas temporárias criadas pelos testes foram excluídas; nenhuma conta preexistente foi alterada e nenhum e-mail foi enviado.
- 15 testes unitários da API e integração de autenticação com emulador/PostgreSQL passaram após a adaptação sem chave. Os testes anteriores de clubes, convites, concorrência e remoção continuam cobertos pelo CI, que passou na versão publicada.

O login interativo com uma conta Google do proprietário e o recebimento real dos e-mails não foram exercitados automaticamente.

## Atualizações futuras

As CLIs Firebase e Render estão conectadas à conta autorizada. Render CLI oficial v2.36.0 está em `.local-data/tools/bin/render`, com checksum do pacote verificado; seu token local foi autorizado por sete dias. A conexão não é necessária para a API continuar funcionando depois desse prazo.

1. Testar e enviar alterações para a branch usada pela API.
2. Executar novas migrations com a identidade `clube_migrator`, fora do Render Free. Não executar migrations com `clube_runtime`.
3. Publicar manualmente a API com `.local-data/tools/bin/render deploys create srv-dbrjddl9fdbs73eikb0g` e conferir o resultado.
4. Publicar o frontend com o comando abaixo. O build exige a API e o banco saudáveis, recusa emulador e força o modo conectado.

```bash
npx -y firebase-tools@latest deploy --only hosting --config firebase.production.json --project production --account negocio.layon@gmail.com
```

Não habilitar plano pago, discos, pre-deploy pago ou autoscaling na alternativa gratuita. Não usar Render Postgres Free: esse banco expira após 30 dias; o armazenamento persistente deste app está no Neon.

## Limites gratuitos

Render Free pode suspender a API após 15 minutos de inatividade e demorar cerca de um minuto para retomar. O cliente aguarda até 75 segundos sem repetir automaticamente ações que alteram dados. Os serviços têm cotas mensais e podem suspender o atendimento ao atingi-las. Não há garantia de disponibilidade equivalente a um serviço pago.

Referências: [Render Free](https://render.com/docs/free), [Neon Free](https://neon.com/pricing).
