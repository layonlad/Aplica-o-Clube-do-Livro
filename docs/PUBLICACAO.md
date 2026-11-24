# Publicação do Clube do Livro

Produção migrada e verificada em **16/11/2026**, com autorização do dono, para o projeto Google/Firebase `gen-lang-client-0194308411`, nome de exibição **Projeto-clube-do-Livro**. O orçamento autorizado é de **R$ 70/mês**, com alertas; não é um corte automático de cobrança.

Última atualização em **19/11/2026**. O PR 46 publicou a auditoria do backend e as correções de sincronização. Os dois sites servem o build do merge `4c7caf5`, com 106 arquivos verificados por SHA-256. A API e o executor usam a imagem deste mesmo commit. A publicação dispensou alterações no banco e nas permissões.

## Endereços

- [Aplicativo](https://gen-lang-client-0194308411.web.app/#/app).
- [Saúde da API](https://clube-livro-api-34owu4acjq-uc.a.run.app/health).
- [Mapa do projeto](https://layonlad.github.io/Aplica-o-Clube-do-Livro/mapa/).
- [Endereço anterior em compatibilidade](https://project-acb850f4-4bb8-45de-a84.web.app/#/app), usando API e Auth novos.

O app conectado exige uma conta com e-mail confirmado. O acesso aos clubes depende da associação. EPUBs locais permanecem no navegador e no endereço em que foram salvos.

## Recursos de produção

| Recurso | Configuração |
| --- | --- |
| Frontend | Firebase Hosting nos dois endereços, merge `4c7caf5`, PR 46 |
| Autenticação | Firebase Authentication, Google e e-mail/senha, UIDs e provedores preservados |
| API | Cloud Run `clube-livro-api`, revisão `clube-livro-api-00007-kvd`, 1 CPU/1 GiB, mínimo zero, máximo uma instância, concorrência 2 |
| Banco | Cloud SQL `clube-livro-postgres`, PostgreSQL 17, `db-f1-micro`, HDD 10 GiB, zona única, região `us-central1` |
| Papéis SQL | `clube_migrator`, `clube_runtime` e `clube_notifications`, com grants versionados e sem superusuário/DDL no runtime |
| Arquivos | Cloud Storage for Firebase, bucket padrão privado do projeto, acesso público impedido |
| Executor | Cloud Run privado `clube-notifications`, revisão `clube-notifications-00006-cm2`, 1 CPU/512 MiB, mínimo zero, máximo uma instância |
| Agendamento | Cloud Scheduler, `7,22,37,52 * * * *`, UTC, OIDC e identidade exclusiva |
| Configuração privada | Secret Manager, acessos separados por identidade; sem arquivos de chave de serviço |
| Imagens | Cloud Build e Artifact Registry `us-central1/clube-livro`; imagem pelo digest conferido |
| Recuperação | Sete backups Cloud SQL, exportações privadas da migração e origens anteriores preservadas |

Imagem atual da API e do executor construída de `4c7caf508527a1cc92ce3b8f185cfa0fa9386829`, digest `sha256:6541555eaa707de608f079f0f4cc7cb0c3516227c6d6377c26ec2ad854d2fb11`. Passaram 270 testes locais, a validação em Chrome e WebKit e o CI do PR 46. As verificações da publicação cobriram saúde do banco, proteção de rotas privadas, origens de CORS, catálogo e notícias. O executor continuou inacessível sem autenticação.

## Verificações da migração anterior

- Restauração final de 50 tabelas públicas e 140 registros, incluindo controle de migrations, com checksums por tabela e sequências iguais. Dezoito migrations conferidas por hash; nenhuma migration nova.
- 41 objetos, 2.120.610 bytes, preservados nas mesmas chaves e verificados por hash. Quatro contas reais importadas sem alterar UIDs.
- Login com senha importada e ADC, upload assinado, otimização, foto privada, EPUB original e capa exercitados com conta/arquivos sintéticos. Upload de tamanho errado rejeitado e bucket anônimo HTTP 403. Somente os dados sintéticos foram removidos; os checksums originais continuaram iguais após a limpeza.
- Conta sintética excluída nos dois projetos; o token anterior foi recusado pela API nova com HTTP 401.
- API/banco HTTP 200, rotas privadas anônimas HTTP 401, quatro origens Firebase explícitas aceitas e origem indevida recusada no CORS.
- Executor privado recusa anônimo; Scheduler realizou lote autenticado HTTP 200 e zero falhas. Manutenção da API habilitada.
- HTML e quatro assets de entrada publicados nos dois endereços idênticos ao build conectado.
- 189 testes locais aprovados antes da troca: frontend, unitários da API, PostgreSQL e Auth Emulator. CI repete testes, builds, imagem e auditoria.

O ensaio de navegador encontrou diferença de uma página na retomada do EPUB no Chrome móvel e desktop, registrada no mapa para correção específica; abertura, capa e arquivo privado foram conferidos. O frontend existente foi preservado nesta migração. Em Chrome móvel, WebKit móvel e Chrome desktop, capa, abertura, controles, preferências e entrelinha funcionaram, sem transbordamento horizontal ou exceções; o WebKit também retomou a página correta.

Login interativo com a conta Google do dono, recebimento de e-mail e push em aparelho físico não foram automatizados. Dados reais não foram usados como fixtures.

## Operação e publicações futuras

### Staging e numeração

- **Staging** roda com `npm run staging` em [localhost:5174](http://localhost:5174/#/app/ajustes). API, PostgreSQL, arquivos e Auth Emulator são locais e ficam separados dos dados do desenvolvimento regular. O processo persiste contas e dados de teste em `.local-data/staging/`.
- **Produção** usa os endereços do aplicativo da seção Endereços. Configurações identifica o ambiente e a versão no rodapé.
- A base é **1.0**. A candidata da próxima publicação passa a **1.1**, depois **1.2**, e assim por diante. Iterações na mesma candidata usam o mesmo número em `release.json`.
- Abra a candidata local e envie o link para avaliação. Ao iniciar com um commit limpo, Staging grava `.local-data/staging/release.json`, com ambiente, versão, commit e hash do código. Após a aprovação, o build de produção verifica a correspondência e a sequência. Em outra worktree, aponte `STAGING_RELEASE_FILE` para o caminho absoluto desse registro.

### Produção após a aprovação

O [procedimento de migração e recuperação](migracao/FIREBASE_GOOGLE.md) detalha custos, isolamento, permissões e sequência de publicação. Limites não secretos ficam em `infra/google/config.json`.

Para mudanças somente de frontend, compare o backend de main com a versão da API no ar e publique apenas Hosting a partir de cópia limpa do merge aprovado. Migrations, Cloud Build, API/executor e agendamento não precisam ser executados nessa situação.

1. Trabalhar em branch própria, ler/atualizar o mapa e validar o PR/CI.
2. Com autorização para o escopo, aplicar migrations/grants como proprietário, somente quando necessários, preservando recuperação.
3. Construir o commit aprovado no Cloud Build e atualizar API/executor pelo digest. Preservar identidades, mounts, SQL, limites e IAM; conferir saúde e autorização antes do frontend.
4. Preparar `.env.production.local` privado com a configuração pública do app novo e a URL da API. O build recusa emulador e API indisponível.
   Enquanto o servidor oferecer chat nos clubes, manter `VITE_CLUB_CHAT_ENABLED=true` no build de produção.
5. Publicar Hosting no projeto novo e, enquanto necessário para os dados locais, no endereço de compatibilidade. Cada projeto exige a conta proprietária correspondente.
6. Validar publicação, Scheduler e dados sintéticos controlados; atualizar versões reais no mapa.

```bash
npx -y firebase-tools@latest deploy --only hosting --config firebase.production.json --project production
```

O GitHub permanece como código, CI, prévia demonstrativa e mapa. O agendamento de notificações executa no Google Cloud. Os arquivos de deploy legado do GitHub Actions e Render foram retirados do repositório. Render está suspenso; Neon e mídia antiga preservam a fotografia da migração. Não reativar os escritores antigos ou restaurar snapshots sobre gravações novas sem conciliação. A exclusão desses recursos não fez parte desta migração.
