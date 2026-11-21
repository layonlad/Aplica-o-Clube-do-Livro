# Notificações: o que o site já usa e o que falta no servidor

Frontend entregue pelo Claude em `claude/central-notificacoes`. Esta lista é para o Codex. As telas já funcionam com as rotas atuais; cada item abaixo é uma melhoria que o servidor precisa oferecer antes de o site exibir o recurso.

## O que o site usa hoje (sem rota nova)

| Uso | Rota |
| --- | --- |
| Contador do sino (já calculado no servidor) | `GET /v1/me/notifications/unread` |
| Lista paginada (20 por página, cursor) | `GET /v1/me/notifications?limit=20&cursor=` |
| Conferir antes de abrir (conteúdo removido ou acesso perdido → 404 `NOTICE_NOT_FOUND`) | `GET /v1/me/notifications/:id` |
| Marcar uma / todas como lidas | `POST /v1/me/notifications/read` `{ id? }` |
| Preferências da conta | `GET/POST /v1/me/notification-preferences` |
| Push do aparelho (Web Push com VAPID) | `/v1/me/push/config`, `/subscriptions`, `/status` |
| Modo do chat em cada clube (todas, menções e respostas, comunicados, silenciado) | `GET/POST /v1/clubs/:id/chat/settings` |
| Aceitar / recusar convite | `/v1/me/invitations/:id/accept` e `/decline` |

O serviço único do site é `src/notifications/store.ts`:
- uma consulta por aba, compartilhada por todas as telas;
- com o sinal de tempo real ligado, na hora em que a versão muda e numa conferência a cada 5 min (ver [TEMPO_REAL.md](TEMPO_REAL.md));
- sem o sinal, a cada 30 s com a aba visível;
- na hora quando o app volta ao primeiro plano, a conexão volta ou chega um push (o worker avisa a página);
- espera progressiva em caso de erro.

A lista só é relida quando o contador sobe ou o sinal avisa uma mudança.

## Situação na candidata local 1.5

Os itens 1, 3, 4 e 5 abaixo têm contrato implementado na API candidata. No item 1, a rota `/me/notifications/sync` atende uma espera por vez; o tempo real para todos vem do sinal descrito em [TEMPO_REAL.md](TEMPO_REAL.md). O item 2 recebe contextId e identificadores de autoria, com texto e miniatura reservados para evolução. O push segue as categorias da caixa e dispõe de uma chave geral independente. As telas publicadas na 1.4 continuam usando o contrato anterior. Veja os métodos, migração e testes em [Central de notificações](../CENTRAL_NOTIFICACOES.md).

## Lista registrada na entrega da versão 1.4

1. ~~**Tempo real de verdade.**~~ Resolvido com um sinal de versão por pessoa no Firestore, desligado por padrão. A espera longa não cabe na API de uma instância com concorrência 2. Ver [TEMPO_REAL.md](TEMPO_REAL.md).
2. **Texto e miniatura de cada notificação.** A API devolve só tipo, alvo, clube e autor. Para mostrar "Ana enviou uma mensagem: *trecho*" e a foto do mural, faltam:
   - `summary` (trecho curto, já filtrado por privacidade e bloqueios);
   - `thumbnailMediaId` (mídia que a pessoa pode ver);
   - `contextId` exposto para levar ao comentário ou à resposta exata.
3. **Categorias separadas nas preferências.** Hoje são cinco: `interactions`, `mentions`, `clubs`, `events` e `readings`. O pedido do dono separa:
   - mensagens do chat;
   - mural e fotos;
   - destaques da comunidade (não existe notificação desse tipo);
   - respostas (hoje estão em `interactions`);
   - convites (hoje estão em `clubs`).

   Quando a API devolver campos novos, o site acrescenta os interruptores.
4. **Chat "mensagens agrupadas".** O chat aceita `all | mentions | announcements | silent`. Falta o modo agrupado: um resumo a cada N minutos em vez de um aviso por mensagem.
5. **Silenciar um clube inteiro.**
   - Hoje dá para silenciar só o chat de cada clube.
   - Falta silenciar mural, fórum e encontros de um clube específico, por exemplo `POST /v1/me/notification-preferences/clubs/:id { muted }`, aplicado no filtro `visibleNotification` e no envio de push.
6. **Push por categoria.** Hoje o push segue as mesmas preferências da central. Se o dono quiser "só na central, sem push" por tipo, é preciso um campo por categoria.

## Limitações por plataforma (não são pendências)

- **Android e computador:** Chrome, Edge e Firefox recebem push com o app fechado. O pedido de permissão só sai do toque em "Ativar notificações", nunca ao abrir o app.
- **iPhone/iPad:** Web Push só com iOS 16.4+ e o app adicionado à Tela de Início. Fora disso, a tela explica como instalar. O Safari exige um aviso visível para cada push, então ele aparece mesmo com o app aberto.
- **App nativo:** não existe. Nada usa FCM/APNs nativo, e a interface não promete isso.

## Correção feita junto

`src/main.tsx` removia todos os service workers do endereço a cada abertura do app conectado. Isso incluía `push-sw.js`, e remover o worker apaga a inscrição de push do aparelho. Agora só o worker antigo do modo demonstração é removido.
