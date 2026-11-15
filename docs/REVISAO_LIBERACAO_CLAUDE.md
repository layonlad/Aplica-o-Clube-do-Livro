# Revisão da entrega do Claude em 15/11/2026

> Registro histórico anterior à ativação do push nesta data. A configuração foi concluída e a correção de entrelinha preparada na entrega [EPUB e notificações](LEITURA_EPUB_E_NOTIFICACOES.md). Os achados abaixo descrevem a conferência original.

O PR 14 foi incorporado e publicado em `30a110b`. Depois, o PR 16 introduziu o visual compacto, a abertura maior e mais lenta e opções de texto, densidade, entrelinha e formato. A API Render e o Firebase executam o código de `5b5a935`; `5e8ceb8` acrescenta somente o registro da publicação no mapa, via PR 17. O nome atual foi preservado.

## Conferência independente

- Render: deploy `dep-dbsru13bc2fs73cd6sd0` ativo, commit `5b5a935028094c1e487df5a2cfddac5fd73833e7`.
- Firebase: HTML e os cinco arquivos JS/CSS referenciados no HTML são idênticos, byte a byte, ao build conectado local da versão revisada.
- API: `/health` respondeu 200; aparência, configuração push e tickets de fotografia responderam 401 sem login.
- Neon: 18 migrations registradas, última `018_push_notifications.sql`.
- CI do commit publicado: todos os passos aprovados, incluindo Docker, modo conectado, PostgreSQL, Auth Emulator e auditoria. [Execução](https://github.com/layonlad/Aplica-o-Clube-do-Livro/actions/runs/43723494045).
- Repetidos localmente: 60 testes de frontend, 32 unitários da API com codecs reais, builds e validação do mapa, todos aprovados. PostgreSQL e Auth Emulator desta versão foram conferidos pelo CI; não foram repetidos nesta revisão.
- Produção aberta como visitante em WebKit móvel 390px, Chromium móvel 360px e desktop 1366px: sem exceções JavaScript ou overflow horizontal. A abertura terminou; o app ficou acessível sem conta. Fonte-base padrão de 15px; seleção de 18px e fundo personalizado persistiram após recarregar. Estes testes gravaram somente preferências no navegador isolado, sem dados de contas reais.

## Pendências confirmadas

### Push e execução externa ainda não foram ativados

Não estão presentes no Render `PUSH_PUBLIC_KEY`, `PUSH_PRIVATE_KEY`, `PUSH_SUBJECT` ou `PHOTO_CLEANUP_TOKEN`. A listagem de segredos do repositório retornou vazia. A fila, identidade restrita e código estão preparados, mas o usuário ainda não recebe push fora do aplicativo. O workflow agendado não processa a fila sem configuração. A manutenção da API acordada permanece habilitada.

A autorização para essa configuração gratuita já foi concedida pelo dono nesta conversa. A tentativa anterior de gravar o segredo do Render foi impedida por falha do controle automático de aprovação por limite de uso, antes de executar a ação. Isso não corresponde a uma nova autorização pendente do dono. Nesta revisão foram conferidas somente a presença das configurações e os nomes dos segredos; nenhum valor foi exibido ou publicado.

### A entrelinha escolhida não chega ao texto das publicações

A opção altera `--leading-relaxed` para `1.9`, mas regras posteriores de `.post-body` em `src/community/community.css` mantêm `line-height:1.55` (regra geral e regra móvel). Elas sobrescrevem a integração feita no início do arquivo pelo PR 16.

Reprodução em produção, usando um parágrafo sintético com a mesma classe do texto do post e fonte-base de 18px: no celular, a altura computada ficou em aproximadamente 26,505px antes e depois de escolher entrelinha ampla; no desktop permaneceu em 29,016px. O token mudou corretamente, mas a altura não. Não é falha de persistência da API. É necessário fazer as regras finais de publicações consumirem o token de entrelinha, mantendo o padrão visual desejado, e verificar o estilo computado no navegador.

## Limites desta revisão

Não foram refeitos upload direto no bucket com conta autenticada, testes de comentários privados ou recebimento em aparelho físico. O código de uploads do Codex foi preservado pelo Claude; sua validação real após publicação continua pendente. Sem configuração push, também falta validar a limpeza externa de temporários quando o Render dorme.

Esta revisão não mudou a API, o site, as credenciais nem os dados de produção. As pendências foram registradas no mapa. Nenhuma mudança do design do Claude foi revertida.
