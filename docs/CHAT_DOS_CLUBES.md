# Chat dos clubes

## Candidata local

Na raiz, com as dependências instaladas, Node 24 e Java 21, execute `npm run staging:chat`. Abra http://localhost:5178 em dois navegadores, com duas contas de teste confirmadas e participantes do mesmo clube. O lançador inicia Auth, Firestore Standard e PostgreSQL em loopback. Entre no clube e abra **Chat do clube**. O menu oferece preferências pessoais e os controles correspondentes ao papel do participante.

## Arquitetura e privacidade

A API Fastify valida a sessão Firebase. O PostgreSQL já contém os clubes, os participantes, os bloqueios, o fórum e as notificações. A migration 022 adiciona metadados de mensagens, preferências, reações e denúncias. O banco Firestore dedicado `clube-chat` guarda um documento por mensagem em `clubs/{clubId}/messages/{id}`. O SDK do cliente não tem permissão de leitura ou gravação direta. A conta de serviço da API usa IAM para ler e escrever os textos. O executor de notificações consulta somente metadados no PostgreSQL.

Em cada envio, a API verifica o vínculo atual, a suspensão, o silenciamento, o intervalo e os destinatários. Usa um identificador estável em tentativas repetidas. A transação SQL só publica o metadado depois da confirmação da escrita no Firestore. Uma falha de commit pode deixar um documento inacessível até a expiração pelo TTL. O histórico tem 30 mensagens por página e cursor estável. A listagem filtra bloqueios antes de buscar os textos. A resposta de atualização sem mudança dispensa a releitura dos textos. O processo desperta o cliente após o commit e revalida o acesso. A espera dura até oito segundos; clientes adicionais consultam após 1,8 s para manter capacidade na API existente. Avaliar a latência e o volume de leituras com tráfego representativo antes de ampliar o grupo inicial.

A área de leitura usa a etapa configurada pelo administrador. O espaço com spoilers sempre oculta o texto inicialmente. Citações também ocultam spoilers. Presença e digitação ficam adiadas; não há gravações por tecla. Notificações de menção, resposta, atividade e fixação respeitam a preferência do clube e passam pelos controles existentes de bloqueio e frequência. O push transporta apenas o identificador da notificação.

## Validação e liberação

- A suíte de integração usa PostgreSQL e o emulador Standard: `npx firebase emulators:exec --project demo-clube-chat --config firebase.chat.json --only firestore 'npm run test:integration'`. Encerre primeiro o Staging que usa a mesma porta.
- Em 19/11, passaram 114 testes de frontend, 58 unitários da API, 97 de integração e dois do Auth Emulator. No ensaio do chat, a API usou papel SQL restrito. Foram conferidos acesso direto negado, vínculo, bloqueio, remoção, respostas, reações, denúncias, fixação, silenciamento, notificações, paginação e repetição do envio.
- Chrome e WebKit, com contas e servidores locais, trocaram mensagens e abriram Debates e Membros. O ensaio passou em 320, 360, 375, 390, 393, 414, 430, 768, 820 e 1024 px. O campo foi conferido em viewport reduzida e orientação horizontal. O teclado virtual do sistema ainda precisa de validação. O cenário de navegador não mede carga de produção.
- Para a promoção, configurar o banco Firestore Standard em us-central1, conferir negação direta pelas regras, TTL de 90 dias e exceções de índices em firebase.chat.json. Conceder acesso à identidade da API restrito a esse banco. Confirmar o backup antes da migration aditiva 022 e aplicar os grants atualizados de API e executor. Verificar a manutenção de metadados vencidos e a política TTL ativa do Firestore.
- Construir a API e o executor para o commit aprovado. Ativar `CLUB_CHAT_ENABLED=true` e iniciar com `CLUB_CHAT_CLUB_IDS` contendo apenas o clube de teste. Publicar o site conectado com `VITE_CLUB_CHAT_ENABLED=true` depois de validar a API. Executar smoke com duas contas de teste, um visitante e um usuário removido. Ampliar a lista de clubes após confirmação.
- Para interromper a entrega de mensagens, desativar a flag do servidor; para retirar a entrada da navegação, publicar o site com a flag do frontend desligada. Preservar documentos, migrations e demais recursos.
- Acompanhar custo de leituras por atualização, escritas, exclusões pelo TTL, conexões, latência da API e fila de push. O orçamento combinado é de R$ 70/mês e os alertas são informativos.

A produção e o commit publicado devem ser registrados no mapa somente após a verificação remota da versão. Esta candidata foi verificada localmente.
