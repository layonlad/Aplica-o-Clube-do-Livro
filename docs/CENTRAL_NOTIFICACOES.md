# Central de notificações · candidata 1.5

## O que existe e onde integrar

O Firebase Auth autentica a pessoa. A API Fastify determina sua identidade a partir do token verificado. O PostgreSQL guarda associações, bloqueios, preferências, caixa e entregas. Só a API lê o corpo do chat no Firestore dedicado. As regras desse banco negam acesso direto. O executor privado do Cloud Run e o acionamento após gravações reaproveitam a fila do Web Push. A implementação dispensa Functions, coleções por usuário e um segundo serviço de mensageria.

| Origem confirmada | Tipo no contrato | Destino |
|---|---|---|
| Envio no chat | club.chat.message.created | Mensagem e clube |
| Mural ou foto publicada pelo álbum no mural | club.wall.post.created | Publicação do clube |
| Publicação selecionada pela moderação | community.highlight.published | Publicação pública |
| Menção em publicação, comentário ou chat | user.mentioned | Publicação com contexto ou mensagem |
| Resposta direta no chat, comentários ou debate | comment.reply.created | Mensagem, publicação ou tópico |
| Convite endereçado | club.invitation.created | Convite vigente |
| Escolha do livro atual ou sorteio | club.reading.started | Livro do clube |
| Criação, edição relevante e lembrete | club.event.created, club.event.updated, club.event.reminder | Encontro |

O ranking de descoberta é calculado por engajamento. Para publicar um destaque com aviso, a moderação chama `POST /v1/public/posts/:id/highlight`. A rota exige uma publicação pública dos últimos 30 dias com perfil público ativo, guarda a autoria da curadoria e prioriza a publicação na seção de destaques. Repetir o comando para o mesmo post é idempotente. O ranking orgânico continua funcionando.

## Contrato para o Claude Code

Os tipos compartilhados estão em `server/src/notification-contracts.ts`. O SDK sem componentes visuais está em `src/notifications/client.ts`. O site 1.4 já usa src/notifications/store.ts para a central, o sino e os banners. Ao incorporar o canal novo a esse serviço, substitua a consulta periódica e mantenha uma conexão por aba. Crie uma instância de `notificationClient(user)` por sessão Firebase. A identidade vem do token em todas as rotas.

| Método do SDK | API sob /v1 |
|---|---|
| listNotifications(cursor?, limit?) | GET /me/notifications · padrão 20, máximo 50 |
| subscribeToNotifications(callback), subscribeToUnreadCount(callback) | GET /me/notifications/sync com revisão opaca opcional |
| markNotificationAsRead(id), markAllNotificationsAsRead() | POST /me/notifications/read com id ou objeto vazio |
| getNotificationPreferences(), updateNotificationPreferences(patch) | GET e POST /me/notification-settings |
| registerPushToken(token, platform, installationId, previousWebEndpoint?) | POST /me/push/devices |
| unregisterPushToken(token) | DELETE /me/push/devices com token no corpo |
| Abrir um aviso | GET /me/notifications/:id · devolve destino autorizado, 404 se indisponível |
| Desassociar instalação no logout | DELETE /me/push/devices/:id com a sessão do proprietário |

A lista e o contador compartilham a conexão. Inicie a assinatura enquanto a tela estiver ativa e invoque os retornos de cancelamento no desmontar, na troca de sessão e quando o app for para segundo plano. Ao reabrir, o primeiro snapshot recupera o estado atual. Use o cursor para o histórico. O servidor espera até oito segundos em um canal PostgreSQL exclusivo da conta. Chat e central compartilham o limite de uma espera por instância, preservando capacidade para escrita. Em contenção o SDK respeita o intervalo sugerido pelo servidor. Falhas temporárias usam espera progressiva até 30 segundos.

O modo padrão do chat entrega menções e respostas. A configuração da sala prevalece sobre o modo global. O modo all cria uma entrada por mensagem elegível. O modo grouped reúne as mensagens comuns por clube e janela de cinco minutos, mantém a mensagem mais recente como destino e preserva menções e respostas separadas. Silenciar o clube também oculta os avisos já existentes. O controle global de push altera somente a entrega no aparelho. O cadastro de assinatura é independente do plano comercial.

## Dispositivos e privacidade

O cliente pede permissão de notificação e obtém um token do SDK oficial do Firebase para sua plataforma. Mantenha um UUID aleatório estável por instalação. Cadastre o token após consentimento e renove o cadastro quando o token mudar ou periodicamente enquanto a permissão estiver ativa. Ao migrar um navegador do Web Push para FCM, informe o endpoint anterior no cadastro para revogação atômica e use apenas um transporte por instalação. Enquanto usar o Web Push existente, mantenha o fluxo VAPID já publicado.

O backend usa a credencial de serviço do ambiente para enviar ao FCM. Em uma promoção, validar a API Firebase Cloud Messaging e a permissão cloudmessaging.messages.create na identidade que executará o envio. Ativar FCM_PUSH_ENABLED=true tanto na API quanto no executor. Para iOS, configurar a credencial APNs no projeto Firebase, capacidades e permissão do usuário. Para Android, preparar o app Firebase, canais e permissão do sistema. Para web, preparar service worker, VAPID do projeto e tratamento de abertura. O SDK do cliente deve descartar o token do provedor no logout ou na revogação da permissão. O app já tenta desassociar o ID da instalação antes de encerrar a sessão. Offline, a revogação remota requer conectividade e a implementação nativa deve tratar também a revogação local.

Antes de abrir o destino, consulte a API novamente. Nenhum token, trecho de mensagem, título de clube ou spoiler faz parte do conteúdo exibido pelo push. Um token vinculado a outra conta ou instalação retorna 409. Falhas transitórias do FCM têm retentativas. Token reconhecido pelo provedor como inválido é revogado. Aceite do FCM indica recebimento pelo serviço. Confirmar exibição, toque e navegação requer um dispositivo com permissão. Consulte a documentação oficial de [envio](https://firebase.google.com/docs/cloud-messaging/send/admin-sdk) e [ciclo de vida de tokens](https://firebase.google.com/docs/cloud-messaging/manage-tokens).

## Fila, custo e operação

A migration 023 acrescenta preferências parciais, instalações FCM, destaques publicados e eventos duráveis à estrutura existente. Eventos para vários destinatários resolvem até 32 membros na primeira página da transação e o restante em páginas de até 200. Cursor, deduplicação e criação da caixa são confirmados juntos. Erros em uma página preservam o cursor e liberam outros eventos. Após oito tentativas, inspecione last_error e failed_at e, após corrigir a causa, redefina somente a linha afetada para nova tentativa. O executor recolhe eventos concluídos após sete dias. A caixa mantém a retenção de 90 dias. O aviso na caixa independe do aceite de qualquer dispositivo.

Observe pendingEvents, oldestEventSeconds, failedEvents, created, sent, retry, cancelled, throttled e failed nos lotes. Envio externo seguido de falha antes de confirmar o resultado no banco pode causar repetição. Use notificationId para deduplicação no dispositivo. Nenhum FCM é solicitado pelos testes. O custo cresce com destinatários ativos × eventos e, para push, com aparelhos inscritos. O modo individual pode criar uma linha por destinatário por mensagem e até cinco entregas por pessoa. A cadência do Scheduler existente é de quinze minutos. Há também processamento oportunista após gravações. Este ensaio funcional não constitui teste de capacidade nem previsão de fatura.

## Ensaio e promoção

Use Node conforme .nvmrc, npm ci e npm run staging. A candidata usa PostgreSQL e emuladores locais em localhost:5174. O sinalizador FCM permanece desligado por padrão. Para validação sem rede externa, rode npm run check, a integração com o emulador Firestore conforme o workflow checks e npm run test:e2e. Confira mapa:check e mapa.

Após aprovação do dono, registrar cópia de recuperação, aplicar migration 023 e os dois arquivos de permissões, promover API e executor antes do site e testar com dados descartáveis. Com FCM ainda desligado, validar a caixa e o Web Push preexistente. Habilitar FCM somente com configuração das plataformas e testar recebimento em primeiro e segundo plano. Para interromper o transporte FCM, desative a flag na API e no executor. As notificações internas continuam salvas. Mantenha um executor compatível com a migration 023 para concluir o fan-out pendente, inclusive durante reversão do site.
