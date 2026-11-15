# Liberação dos ajustes sociais móveis

Publicação autorizada pelo dono em 14/11/2026: merge do PR #11, cópia privada gratuita, migration 016, revogações de permissões, API Render, site Firebase, validação e mapa. Nenhum plano pago contratado; dados reais não foram editados para testes.

- Código publicado na API e no site: `a66cbc21428a5974628bedebbf1112197f7c9f02`, merge do PR #11. Inclui a capa/GIF do PR #10 do Claude.
- CI de main aprovado: [execução 43662999187](https://github.com/layonlad/Aplica-o-Clube-do-Livro/actions/runs/43662999187). Prévia/Pages do merge também aprovados.
- App: https://project-acb850f4-4bb8-45de-a84.web.app/#/app
- API: https://clube-livro-api.onrender.com/health

## Banco e recuperação

Nova cópia privada `backup-pre-mobile-a66cbc2-20261114`, branch `br-misty-king-bcz7iw1n`, pronta e sem compute. A cópia anterior também foi preservada. As cópias não incluem gravações posteriores; restauração ou exclusão exige autorização específica.

Checksums das migrations 001–015 conferidos antes da operação. Migration 016 aplicada e registrada, com revogações em transação pelo proprietário de migrations. A ferramenta SQL exige uma instrução por item: a primeira tentativa com SQL composto foi rejeitada e revertida integralmente; a conferência confirmou 15 migrations antes da execução corrigida. Estado final: 16 migrations e FK composta da capa presente.

A auditoria encontrou uma regra legada de `ALTER DEFAULT PRIVILEGES` do proprietário de migrations, que concedia CRUD em toda tabela nova. O script anterior revogava somente as tabelas iniciais. O ajuste em `runtime-grants.sql` reconcilia todas as tabelas explícitas e retira os defaults de tabelas/sequências antes de restaurar a matriz testada. Não amplia permissões nem altera dados; deve ser executado pelo proprietário que cria as tabelas.

Verificação final por catálogo: zero diferenças entre privilégios efetivos e a matriz explícita do script; zero defaults desse proprietário concedidos a `clube_runtime`. Continuam negados DDL, leitura de migrations, alteração da auditoria e exclusão de usuários. A associação `album_media` não permite UPDATE; o álbum permite UPDATE e não DELETE. Teste de regressão reproduz CRUD em todas as tabelas e defaults futuros, executa os fluxos restritos e confirma ausência de concessões automáticas numa tabela descartável local.

## Publicação e validação

Render continua Free, branch main e autodeploy desligado. Deploy `dep-dbsglrm1egvs73dq82t0` ativo no commit acima. Firebase Hosting publicado depois da API, com a conta proprietária já conectada; não houve alteração de Auth, IAM ou plano.

Validações sem escrita em produção: health e banco, comunidade pública, novas operações de capa protegidas por autenticação, HTML idêntico ao build e `Cache-Control: no-store`. Assets referenciados pelo HTML comparados com os arquivos locais. Nenhum usuário de teste foi criado nesta etapa, nem fotos/álbuns reais alterados.

Chrome isolado na versão publicada: 390×900 e 1440×1080, documento sem transbordamento horizontal e nenhuma exceção JavaScript. Os fluxos autenticados de GIF, comentários e escolha da capa foram validados localmente com conteúdo sintético antes da liberação. Isto não afirma um teste em aparelho físico ou gravações autenticadas nesta produção.

Verificações anteriores: 44 testes frontend, 29 unitários da API, 61 PostgreSQL e 1 Auth Emulator (135); builds e ensaio idempotente das migrations aprovados. Após corrigir a regra de grants, repetidos os 61 testes PostgreSQL e o build da API, aprovados. O CI do PR de registro verifica novamente a versão final dos scripts e testes.

Detalhes e evidências locais: [entrega social móvel](ENTREGA_SOCIAL_MOBILE.md). Este registro e o mapa preservam a distinção entre código executável publicado e o commit posterior de documentação/operação SQL, sem acionar novo deploy automático.
