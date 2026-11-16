# Publicação do Clube do Livro

Produção migrada e verificada em **16/11/2026**, com autorização do dono, para o projeto Google/Firebase `gen-lang-client-0194308411`, nome de exibição **Projeto-clube-do-Livro**. O orçamento autorizado é de **R$ 70/mês**, com alertas; não é um corte automático de cobrança.

Última atualização: **PR 25, commit `383541f`**, publicada após a migração. API e executor antes dos dois sites, sem migrations ou grants. [Relatório e resultado de cada teste](publicacoes/2026-11-16-pr25.md).

## Endereços

- [Aplicativo](https://gen-lang-client-0194308411.web.app/#/app).
- [Saúde da API](https://clube-livro-api-34owu4acjq-uc.a.run.app/health).
- [Mapa do projeto](https://layonlad.github.io/Aplica-o-Clube-do-Livro/mapa/).
- [Endereço anterior em compatibilidade](https://project-acb850f4-4bb8-45de-a84.web.app/#/app), usando API e Auth novos.

A entrada continua livre, sem cadastro ou participação em clube. Biblioteca e livros apenas locais permanecem no navegador e na origem em que foram salvos. O endereço de compatibilidade evita abandonar esse IndexedDB; o novo endereço possui armazenamento local próprio. Conta é opcional para sincronizar; convites dão acesso somente aos clubes correspondentes. A mudança de projeto Firebase pode exigir novo login.

## Recursos de produção

| Recurso | Configuração |
| --- | --- |
| Frontend | Firebase Hosting, código `383541f` do PR 25; visual do Claude preservado |
| Autenticação | Firebase Authentication, Google e e-mail/senha, UIDs e provedores preservados |
| API | Cloud Run `clube-livro-api`, revisão `clube-livro-api-00003-cbz`, 1 CPU/1 GiB, mínimo zero, máximo uma instância, concorrência 2 |
| Banco | Cloud SQL `clube-livro-postgres`, PostgreSQL 17, `db-f1-micro`, HDD 10 GiB, zona única, região `us-central1` |
| Papéis SQL | `clube_migrator`, `clube_runtime` e `clube_notifications`, com grants versionados e sem superusuário/DDL no runtime |
| Arquivos | Cloud Storage for Firebase, bucket padrão privado do projeto, acesso público impedido |
| Executor | Cloud Run privado `clube-notifications`, revisão `clube-notifications-00002-q8q`, 1 CPU/512 MiB, mínimo zero, máximo uma instância |
| Agendamento | Cloud Scheduler, `7,22,37,52 * * * *`, UTC, OIDC e identidade exclusiva |
| Configuração privada | Secret Manager, acessos separados por identidade; sem arquivos de chave de serviço |
| Imagens | Cloud Build e Artifact Registry `us-central1/clube-livro`; imagem pelo digest conferido |
| Recuperação | Sete backups Cloud SQL, exportações privadas da migração e origens anteriores preservadas |

Imagem atual da API e executor construída a partir de `383541f0153e645567b8a6153ddf4c206e22a8c7`, digest `sha256:1c45d391af4055c023f4c54281fadb1c5122f77dee225c949037d4df6043a60f`. CI do commit aprovado; 194 testes locais e testes pós-publicação registrados no relatório do PR 25. A configuração de recuperação anterior foi preservada privadamente.

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

O [procedimento de migração e recuperação](migracao/FIREBASE_GOOGLE.md) detalha custos, isolamento, permissões e sequência de publicação. Limites não secretos ficam em `infra/google/config.json`.

1. Trabalhar em branch própria, ler/atualizar o mapa e validar o PR/CI.
2. Com autorização para o escopo, aplicar migrations/grants como proprietário, somente quando necessários, preservando recuperação.
3. Construir o commit aprovado no Cloud Build e atualizar API/executor pelo digest. Preservar identidades, mounts, SQL, limites e IAM; conferir saúde e autorização antes do frontend.
4. Preparar `.env.production.local` privado com a configuração pública do app novo e a URL da API. O build recusa emulador e API indisponível.
5. Publicar Hosting no projeto novo e, enquanto necessário para os dados locais, no endereço de compatibilidade. Cada projeto exige a conta proprietária correspondente.
6. Validar publicação, Scheduler e dados sintéticos controlados; atualizar versões reais no mapa.

```bash
npx -y firebase-tools@latest deploy --only hosting --config firebase.production.json --project production
```

O GitHub permanece como código, CI, prévia demonstrativa e mapa. O workflow antigo de notificações está desativado e não possui mais agendamento no código. Render está suspenso; Neon e mídia antiga preservam a fotografia da migração. Não reativar os escritores antigos ou restaurar snapshots sobre gravações novas sem conciliação. A exclusão desses recursos não fez parte desta migração.
