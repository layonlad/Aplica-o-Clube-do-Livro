# Diagnóstico das entregas de 20 a 23 de novembro de 2026

## O que chegou a cada ambiente

| Mudança | Estado verificado |
| --- | --- |
| Central de notificações, banners, preferências e Web Push do Claude, PR #58 | Integra o site 1.4. A central consulta a API periodicamente. |
| Layout com coluna de até 430 px, novas abas dos clubes e reorganização de Leituras, PR #59 | Integra o site 1.4, com DM Sans e Merriweather como padrões. |
| Versão do site, PR #60 | Os dois manifestos públicos informam 1.4, commit 82d607a e o mesmo identificador de origem. O registro no PR #61 segue em revisão. |
| Backend da central e ajustes do chat, PR #62 | Candidata 1.5 com a migration 023. O PR segue aberto. |
| Sinal de tempo real via Firestore, PR #63 | Mesclado no PR #62, em f54e2f6, com migration 024 e ativação por configuração. |
| Partida da API com carregamento sob demanda e cache de compilação do Node, PR #64 | Main em 4dac617. API 00009-dab e executor 00008-rfk recebem 100% do tráfego de seus serviços. Saúde da API retornou HTTP 200. |
| Registro da API em produção, PR #65 | Documentação em revisão com a revisão ativa, o backup anterior e o relato de publicação sem migration. |

## Achados

1. **Prioridade alta na candidata 1.5 · publicação do sinal depende de trabalho após a resposta.** A API chama o publicador no gancho onResponse e a função dispara trabalho assíncrono. A revisão ativa usa CPU alocada durante requisições. Quando a resposta termina e a instância fica ociosa, a CPU deixa de estar garantida. A fila SQL permite recuperar o sinal em uma chamada posterior, mas o intervalo até a próxima tentativa pode ser o do executor de quinze minutos. Validar a publicação enquanto a requisição da API ou do executor ainda está aberta e medir a latência sem tráfego adicional. [Código do PR #63](https://github.com/layonlad/Aplica-o-Clube-do-Livro/pull/63/files) · [Alocação de CPU no Cloud Run](https://cloud.google.com/run/docs/configuring/billing-settings#cpu-allocation-impact)
2. **Prioridade média · a central mantém avisos removidos.** Em reprodução com o sinal ativo, a API passou a retornar zero não lidas e lista vazia. O contador local caiu para zero, mas a publicação continuou na lista. A atualização combina a página recebida com todos os itens anteriores, preservando os que sumiram. A verificação ao abrir o destino permanece como proteção. A mesma combinação existe na versão 1.4, onde a queda do contador por si só também deixa de solicitar a lista. [PR #58](https://github.com/layonlad/Aplica-o-Clube-do-Livro/pull/58) · [PR #63](https://github.com/layonlad/Aplica-o-Clube-do-Livro/pull/63)
3. **Prioridade média na candidata 1.5 · o primeiro sinal não confere mudanças atrasadas.** Depois da consulta de abertura, um aviso recebido antes da primeira leitura do Firestore entra na versão inicial. O cliente usa essa versão como referência e deixa o contador em zero até uma mudança seguinte ou a consulta periódica. Reprodução confirmou o contador zerado após dois segundos mesmo com o sinal entregue. [PR #63](https://github.com/layonlad/Aplica-o-Clube-do-Livro/pull/63)
4. **Prioridade média · a inscrição do Web Push pode continuar vinculada à conta anterior depois de sair.** A inscrição é preservada na reabertura, corrigindo o cancelamento a cada acesso. O logout do site publicado só encerra a sessão Firebase. Até a inscrição ser desativada ou trocada, um aparelho compartilhado ainda pode receber um aviso genérico da conta anterior. A notificação do sistema contém mensagem genérica, e a API confere a sessão ao abrir o destino. A candidata já tenta limpar inscrições do FCM no logout. Revisão de código, com validação de Web Push em aparelho ainda pendente. [PR #58](https://github.com/layonlad/Aplica-o-Clube-do-Livro/pull/58) · [PR #62](https://github.com/layonlad/Aplica-o-Clube-do-Livro/pull/62)
5. **Prioridade baixa · a integração reintroduz um carregamento imediato do módulo do Firestore.** O publicador novo importa firebase-admin/firestore estaticamente. O ponto de entrada importa o publicador mesmo com a configuração desligada. Isso contorna parte da estratégia de carregamento sob demanda do PR #64. A união passou em build. O efeito na próxima partida segue sem medida. [PR #63](https://github.com/layonlad/Aplica-o-Clube-do-Livro/pull/63) · [PR #64](https://github.com/layonlad/Aplica-o-Clube-do-Livro/pull/64)

## Partida a frio

Comparei o intervalo entre Starting new instance e Server listening no Cloud Logging, pareado por revisão e instância. Mediana anterior de 3,51 s em 11 partidas, faixa de 2,82 a 7,08 s. Mediana atual de 2,86 s em 47 partidas, faixa de 1,69 a 5,30 s. Redução observada de cerca de 19%. As amostras são de produção e têm horários e volumes diferentes. A métrica termina quando a aplicação começa a escutar e não inclui o tempo da primeira tela.

## Validação

- O CI de #62, #63, #64 e #65 concluiu com sucesso nas respectivas versões consultadas.
- A união local do PR #62 em f54e2f6 com a main em 4dac617 foi concluída sem conflitos. Passaram 139 testes do frontend, 61 da API, 110 de integração com PostgreSQL e Firestore emulado, dois testes de release, mapa e builds. O teste de vídeo foi pulado na execução local sem codecs.
- Em Chrome local, duas contas de teste passaram por login, convite, aceite, chat e central. Um segundo aviso apareceu sem recarregar depois de estabelecida a escuta no Firestore. A central e Leituras do clube ficaram sem rolagem horizontal nas larguras 320, 390 e 1280 px.
- Dois testes descartáveis produziram as falhas de atualização descritas nos itens 2 e 3. Esses testes ficaram isolados da suíte publicada.
- A revisão de publicação nesta rodada foi somente de leitura. iPhone físico e Web Push do sistema continuam sem validação nesta rodada.
