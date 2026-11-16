# Migração integral para Firebase/Google Cloud

Destino autorizado: `gen-lang-client-0194308411`, nome de exibição `Projeto-clube-do-Livro`, região `us-central1`. O dono autorizou até R$ 70/mês para preservar PostgreSQL. O identificador do projeto foi preservado.

## Resultado da troca — 16/11/2026

PR 23 incorporado em `9ad583c` com CI aprovado. [Site novo](https://gen-lang-client-0194308411.web.app/#/app) e [compatibilidade](https://project-acb850f4-4bb8-45de-a84.web.app/#/app) publicados usando API/Auth do destino. A API está na revisão `clube-livro-api-00002-j59`; o executor privado na `clube-notifications-00001-sxb`. Imagem construída de `8f0ddd3`, digest e verificações em [PUBLICACAO.md](../PUBLICACAO.md).

A cópia final confirmou as mesmas 50 tabelas, 140 registros, sequências e 41 objetos do ensaio. Contas reais preservadas; fixture de senha, seus registros e objetos removidos, com token excluído recusado. Lote Scheduler HTTP 200 e zero falhas. Render suspenso, workflow antigo desativado e novos cadastros no Auth anterior bloqueados; origens mantidas para recuperação.

## Arquitetura e custo

- Firebase Hosting: frontend conectado e mapa em `/mapa/`.
- Firebase Authentication: Google/e-mail, com os UIDs, estados de confirmação e hashes preservados. A mudança de projeto pode exigir novo login.
- Cloud Run: API usando a imagem Docker do repositório, identidade própria, mínimo zero, máximo uma instância, concorrência 2, 1 CPU/1 GiB e pool de 5 conexões.
- Cloud SQL PostgreSQL 17: Enterprise, `db-f1-micro`, zona única, HDD de 10 GiB, sem aumento automático de disco, proteção contra exclusão e sete backups. A configuração inicial é pequena e não inclui alta disponibilidade.
- Cloud Storage for Firebase: bucket privado padrão, sem ACL pública, sem versões/soft delete de originais temporários. Upload direto por política POST V4 limita chave, MIME, tamanho exato e validade; geração da leitura fixada, CRC32C e limites de bytes preservados.
- Cloud Scheduler: executor com 1 CPU/512 MiB (mínimo do ambiente Gen2), mínimo zero, máximo uma instância e pool de 3 conexões. Mesmo intervalo aproximado de quinze minutos; chama executor HTTP privado no Cloud Run. IAM e token Google com audiência e identidade exatas são conferidos antes de tocar na fila. Uma identidade SQL separada continua sem acesso aos textos privados. O executor abre/fecha o pool por lote e solicita limpeza limitada à API.
- Artifact Registry e Cloud Build: imagem do commit revisado, sem segredos no código-fonte enviado. A identidade de build lê somente o prefixo de fontes do bucket operacional, sem acesso aos backups, banco, mídia ou segredos da aplicação.
- Secret Manager: configurações privadas fora de `VITE_*`, código e mapa. Identidades de serviço sem arquivos de chave.

A tabela oficial em reais consultada em 16/11/2026 informou aproximadamente R$ 46,77 para 730 horas da máquina mínima e R$ 5,49 para HDD de 10 GiB, antes de backups, tráfego e demais serviços. A previsão inicial fica próxima de R$ 55–65 para o baixo uso atual, sem garantia de fatura fixa. Alertas do projeto foram configurados em R$ 35, R$ 56 e R$ 70, incluindo previsão de ultrapassagem; orçamento não interrompe cobrança. Limites de instâncias/pool e retenção reduzem o consumo. Custos existentes de outros projetos da conta não fazem parte desse orçamento.

O executor HTTP evita o mínimo de um minuto cobrado por execução de Cloud Run Jobs. Não foram contratados compromissos anuais, alta disponibilidade, réplicas ou VPC paga.

Referências: [Cloud SQL](https://cloud.google.com/sql/pricing), [Cloud Run](https://cloud.google.com/run/pricing), [Storage](https://cloud.google.com/storage/pricing), [orçamentos](https://cloud.google.com/billing/docs/how-to/budgets).

## Preservação dos dados

Ensaio concluído: 50 tabelas públicas, incluindo controle de migrations, 140 registros, checksums por tabela e sequências iguais após restauração. As 18 migrations foram conferidas pelos respectivos hashes. A cópia usa snapshot PostgreSQL compartilhado com `pg_dump`, conexão direta e TLS com CA verificada; credenciais não são passadas na linha de comando.

Papéis `clube_migrator`, `clube_runtime` e `clube_notifications` foram recriados sem superusuário, criação de papéis/bancos ou bypass de regras. O dump não copia ACLs de outros provedores; as duas matrizes de grants versionadas e a revogação pública da função privilegiada são reaplicadas. Nenhuma migration nova.

41 objetos, cerca de 2,1 MB, foram copiados para as mesmas chaves de objeto, com comparação SHA-256 após leitura do destino. A cópia final é incremental; arquivos de origem não são apagados. Bucket operacional é separado da mídia e tem retenção de trinta dias para as cópias operacionais; backups gerenciados do SQL têm retenção própria.

Quatro contas reais foram exportadas privadamente. Uma conta sintética adicional, sem envio de e-mail, demonstrou que a senha importada funciona e o UID permanece igual. Somente essa identidade de teste será removida ao terminar. Arquivos de exportação, parâmetros de hash, manifests de objetos e credenciais ficam fora do Git.

O conteúdo guardado exclusivamente no navegador não faz parte do banco ou bucket. O endereço antigo será mantido em compatibilidade, servindo o frontend conectado ao projeto novo: assim, o IndexedDB do mesmo navegador continua acessível e os UIDs preservados mantêm a separação de contas. O novo endereço tem armazenamento de navegador próprio. Não se deve redirecionar cegamente todos os visitantes e tratar EPUBs locais como se tivessem sido transferidos à nuvem.

## Sequência de liberação

1. Revisar/validar o PR e o mapa; compilar a imagem do commit exato no Cloud Build.
2. Guardar configurações no Secret Manager e publicar a API nova com limpeza periódica desligada durante o ensaio. Conferir saúde, autenticação, identidade do banco, grants, bucket privado e upload assinado.
3. Publicar o executor privado, ainda sem disparos agendados. O serviço da API é acessível pela internet, mas rotas privadas continuam exigindo Firebase Auth; o executor não recebe acesso anônimo.
4. Na janela de troca, interromper o executor antigo e suspender a API Render. Conferir ausência de escritores antigos; registrar o isolamento antes de exportar a cópia final.
5. Comparar o destino com o ensaio antes de substituí-lo. Se ele recebeu gravações não previstas, parar e revisar. Restaurar a fotografia final da origem e reaplicar/validar os grants e todos os checksums. Reexportar/importar contas preservando UIDs.
6. Somente depois de validar o destino, publicar o frontend no Firebase novo e a cópia de compatibilidade no Hosting antigo, ambos usando API/Auth/Storage novos. CORS aceita somente as quatro origens Firebase explícitas, sem curingas.
7. Ativar o Scheduler novo, executar um lote real de teste e conferir saúde, login sintético, privacidade de mídia/EPUB e navegador móvel/desktop. Remover exclusivamente os dados sintéticos controlados. Habilitar manutenção da API no destino.
8. Registrar hashes, versões/deploys, conferências e limitações no mapa. Render e Neon antigos permanecem como recuperação, sem novas gravações. A exclusão definitiva não faz parte desta migração.

Se houver problema antes da abertura do destino, retomar a origem preservada. Depois de aceitar gravações no destino, não restaurar cegamente um snapshot anterior: primeiro identificar e preservar as gravações novas. Não executar duas filas ou dois backends graváveis em paralelo.

## Publicações futuras

Os parâmetros de capacidade ficam em `infra/google/config.json`. O Cloud Build usa `cloudbuild.yaml`; enviar o commit aprovado e informar a substituição `COMMIT_SHA`, sem diretórios locais ou arquivos de ambiente. `git archive` do commit é uma fonte reproduzível para o build.

Atualizar a imagem do serviço API e do executor com o digest conferido, preservando identidade, instância SQL, secret mounts, limites e IAM. Conferir saúde e compatibilidade antes do site. `npm run build:production` valida projeto/API e gera o app mais `dist/mapa`; depois publicar somente Hosting no projeto correto. Grants/migrations são operações separadas, como proprietário, quando houver alterações de esquema. Merge não deve disparar deploy automático em produção.

O GitHub continua como repositório e CI; os serviços de produção e a execução agendada ficam no Google. O link compartilhado do mapa no GitHub Pages é mantido, além da cópia no Firebase.

## Verificação antes da troca

189 testes locais aprovados: 64 frontend, 44 unitários da API, 80 PostgreSQL e 1 Auth Emulator; builds e mapa aprovados. As validações incluem políticas de upload exatas, geração/limite de leitura, rejeição de streams maiores/menores, origens CORS exatas e identidade/audiência do executor. O armazenamento continua testável em S3 para recuperação, enquanto produção nova usa ADC/GCS.
