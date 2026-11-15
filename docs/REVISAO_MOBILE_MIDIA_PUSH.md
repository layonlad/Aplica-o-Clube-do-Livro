# Feed móvel, fotografias, comentários, aparência e notificações

Base revisada: `45b2bf9`, com os PRs 10–12 incorporados. O nome e a identidade atuais foram preservados; nenhum nome novo foi definido. Nenhum recurso de produção foi alterado nesta tarefa. A versão publicada continua `a66cbc2` até a aprovação da próxima liberação.

## Auditoria e interface

As quatro capturas recebidas mostram texto longo, mídia, compositor com categoria obrigatória, instruções técnicas e a referência de organização dos comentários. A branch e a worktree do Claude estavam limpas, sem alterações posteriores para reaproveitar. A correção dedicada de capa/GIF do PR 10 continua preservada.

As causas encontradas foram o limite visual de altura de 480px e recorte genérico nas imagens, miniaturas de 360px usadas também no feed, grade com várias fotos por linha, formulário comum misturado com tipos especializados, comentários em lista plana recarregada após cada ação e a personalização que alterava marca/acento sem um campo de fundo. O navegador também podia focar um controle parcialmente visível durante o teste e deslocar a lista; as verificações de rolagem agora usam controles inteiramente visíveis.

- Feed ocupa a largura útil, mantém parágrafos e quebra palavras/URLs extensas. Sem truncamento ou `maxLength` arbitrário no compositor. API e banco têm limites técnicos de 50 mil caracteres por publicação, 10 mil por comentário e 256 KiB por requisição textual. Discussões mantêm os limites técnicos anteriores no servidor.
- Compositor comum: texto, fotos e publicar. Enquete tem ação própria; encontros continuam na agenda. Tipos e registros históricos permanecem no banco. Reenvios de publicações e comentários usam identificação e hash para retornar o mesmo registro após perda da resposta HTTP.
- Fotografias em carrossel com rolagem por toque, teclado, navegação e contagem. O feed mantém as proporções verticais, horizontais e quadradas. Visualizador modal tem zoom até 4× e rolagem própria; não desabilita o zoom nativo.
- Comentários com avatar, nome e texto juntos, data relativa, curtida, resposta, edição própria com versão, opções discretas e respostas agrupadas em um nível visual. Atualizações substituem apenas o comentário afetado e mantêm páginas/rolagem. Responder a uma resposta avisa também seu autor, mesmo com agrupamento visual no comentário original; o destino real integra a verificação de reenvio e comentários bloqueados não aceitam respostas. O campo fica no rodapé do painel e aceita fotos opcionais. Bloqueios, denúncias e exclusão permanecem.
- Painéis usam o topo de camadas nativo do `dialog`, safe areas e `VisualViewport`, sem navegação móvel sobreposta. O teclado é detectado pela redução real da área disponível. Animações respeitam a preferência de menos movimento.
- Fundo tem controle próprio, prévia imediata, persistência local e no backend e aplicação antes da pintura inicial. Tokens de superfícies, texto, estados, bordas e botões acompanham a escolha com contraste; preferências antigas sem fundo continuam válidas.

## Originais de até 100 MB

JPEG, PNG e WebP estáticos têm upload direto por formulário POST assinado, limitado à chave, tipo, tamanho exato e validade curta. A assinatura não ultrapassa a expiração do envio. A API recebe somente metadados e comandos; o bucket permanece privado. Um HEAD permite retomar a finalização sem reenviar bytes já recebidos. Cancelamento, progresso, recuperação de rascunhos e reenvio estão na interface.

A API baixa o original em stream limitado para arquivo temporário privado, confere o tamanho real e usa Sharp com validação de formato, orientação, limite de 40 megapixels, timeout e um processamento por instância. Gera WebP sem EXIF: imagem até 2560px, feed até 1440px e miniatura até 480px, sem ampliar imagens pequenas. O cliente carrega progressivamente a versão de feed; o zoom busca a maior versão autorizada. GIFs continuam no fluxo animado existente, limitado tecnicamente a 8 MB/150 quadros; não é anunciado suporte a HEIC/RAW.

Cotas: 50 MB de versões otimizadas por conta, incluindo a nova versão de feed; um envio de original aberto por conta; 40 originais por dia; reserva global de 1 GB de temporários até a limpeza ser confirmada. Frequência dos endpoints novos é por conta autenticada. Não se armazenam nome original, EXIF ou original permanente. O limite do provedor Free continua valendo para o conjunto dos arquivos do projeto.

A finalização tem trava e transação idempotentes. Chaves derivadas determinísticas permitem remover resíduos de uma queda antes do commit. O original é removido após sucesso; o executor solicita nova limpeza após expiração e margem de segurança, reaplica a remoção durante um dia e guarda diagnóstico sem credenciais. Falhas têm espera e não liberam a reserva prematuramente. Metadados encerrados são descartados após sete dias. Arquivos de usuários já publicados não são removidos por essa limpeza.

Novas publicações de mural/comunidade, discussões e comentários aceitam somente fotos, com validação no servidor. Vídeos históricos continuam legíveis; mídia das outras áreas e EPUBs permanecem. Compartilhar uma cópia de foto de álbum na comunidade continua exigindo consentimento e revalidação de autorização.

O Neon declara suporte a POST assinado, HEAD e CORS e limite superior a 100 MB: [compatibilidade S3](https://neon.com/docs/storage/s3-compatibility), [limites de armazenamento](https://neon.com/docs/storage/overview). A compatibilidade real do POST assinado/CORS com o bucket do app ainda precisa do teste isolado da liberação autorizada. A implementação foi validada com armazenamento sintético e o mesmo adaptador S3 em testes de política e stream.

## Notificações internas e push

A opção **Receber notificações** fica no Perfil e na central. Não pede permissão ao iniciar. Mostra não solicitado, permitido, bloqueado e indisponível, permite desativar este aparelho e mantém a central quando push não é suportado. No iPhone, explica a instalação na Tela de Início, conforme o [WebKit](https://webkit.org/blog/13878/).

Foi escolhido Web Push com VAPID, compatível com os serviços dos navegadores, preservando Firebase Auth. Isso evita exigir uma identidade administrativa Firebase para envio. Chaves privadas ficam somente nos serviços executores autorizados. O navegador envia endpoint e chaves da própria assinatura por uma rota autenticada; há validação da curva, limite de aparelhos e lista de hosts de serviços push para impedir uso como proxy de HTTP. Uma assinatura de outra conta não pode ser tomada pela API.

Comentários, respostas, menções, curtidas, convites e encontros preservam os avisos internos. Novas publicações de clube usam fila de distribuição em lotes. Menções ignoram e-mails e validam perfil/associação/bloqueios; editar e retirar uma menção retira sua visibilidade. Lembretes permitem 15 minutos, 1 hora, 1 dia ou desativado. Não existe módulo de mensagens privadas neste app; ele não foi criado.

Cada notificação gera entregas por aparelho, com chave única, lease, tentativas limitadas, espera crescente, limite de dez notificações distintas por conta/hora e revogação de endpoints 404/410. Eventos repetidos da mesma conversa são agrupados por contexto antes do push. O envio revalida a notificação, preferências, bloqueios, recurso e participação atuais. O payload contém somente o identificador opaco da notificação; a mensagem é genérica e não inclui nomes, clube, trechos, imagens ou URL privada. Ao tocar, o app consulta o aviso autorizado e abre o conteúdo. O service worker não intercepta requisições nem cria cache offline.

Quando a API está ativa, mutações sociais podem iniciar uma entrega em segundo plano, sem polling que mantenha o Neon acordado. Um executor GitHub Actions separado consulta a fila e agenda lembretes mesmo com Render suspenso. A identidade SQL dele recebe apenas colunas necessárias à política e à fila, sem textos privados, estado dos espaços, alteração de usuários, DDL ou auditoria. Uma função de existência de livro com escopo fixo retorna somente booleano. O executor solicita limpeza limitada à API por credencial separada; não recebe credenciais S3.

O agendador gratuito roda a cada 15 minutos e tem disparo manual. A fila persiste, retoma falhas e limites e não depende de tráfego do usuário. GitHub informa que agendamentos podem atrasar ou ser descartados em carga elevada e que repositórios públicos inativos podem ter schedules desativados: [regras do schedule](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule). Esta solução não promete horário exato, SLA ou recebimento imediato em aparelho fechado. Push depende de permissão, rede e política do sistema; avisos internos continuam disponíveis. Planos pagos não são necessários para a proposta.

Retenção: central 90 dias, entregas/distribuições concluídas sete dias, aparelhos inativos 90 dias e assinaturas revogadas sete dias. O workflow registra contagens, retorna falha para entregas definitivamente rejeitadas/limpeza falha e conserva códigos de diagnóstico na fila, sem registrar payloads, endpoints ou credenciais. Operações futuras podem consultar esses estados sem afrouxar a auditoria.

## Verificação e limites

A entrega inclui regressões de upload de 100 MB por arquivo, política assinada exata, stream excedente, formato disfarçado, limite de decodificação, cancelamento, duplicação, fotos/edição em comentários, escopo de clubes, permissões de runtime, menções editadas, fila push com transporte simulado, revogação, preferências, lembretes e identidade restrita do executor. Há também testes do pedido explícito de permissão, recuperação sem reenviar bytes e contraste sobre fundos claros, escuros e intermediários.

Prévia isolada com Auth Emulator, PostgreSQL e arquivos sintéticos, em WebKit móvel de 390px, Chromium móvel de 360px e desktop de 1440px: carrossel, foto vertical sem corte, zoom, curtida sem reiniciar a lista, resposta, upload/publicação e fundo persistido após recarregar. As capturas usam contas e imagens sintéticas. O ensaio também inclui tablet de 768px. Não houve overflow horizontal nas quatro larguras: 360, 390, 768 e 1440px. A cor computada do fundo correspondeu ao HEX escolhido e persistiu após recarregar.

Resultado local final em 15/11/2026: **168 testes passaram** — 57 frontend, 32 unitários da API com codecs reais, 78 integração PostgreSQL e 1 Auth Emulator. Builds de frontend/API e validação do mapa passaram. A estrutura de produção restaurada localmente, sem copiar linhas de usuários, aceitou as migrations até 018 e a segunda execução idempotente. Uma regressão adicional parte da base 016, cria somente registros sintéticos e confirma preservação de texto, tipo histórico, vídeo, comentário e preferências após a atualização. O papel `clube_runtime` executou o fluxo novo com os grants explícitos; o executor restrito foi impedido de ler textos e o estado privado dos espaços.

Capturas da prévia isolada (dados sintéticos; aviso do Auth Emulator preservado): [feed móvel](evidence/mobile-v2/feed-webkit.png), [comentários](evidence/mobile-v2/comments-webkit.png), [aparência](evidence/mobile-v2/appearance-webkit.png). Os números dos testes e a execução de CI do commit final constam também no PR.

Não foram usados dados reais para testes nem testados recebimento push em aparelho físico, teclado nativo ou uma instalação física como PWA. A verificação com WebKit é uma aproximação do Safari, não um teste em iPhone real. Nenhuma assinatura, credencial ou infraestrutura de push foi criada em produção nesta tarefa.

## Liberação que requer autorização

1. Aprovar e incorporar o PR e conferir CI.
2. Criar cópia de recuperação e aplicar as migrations novas e os grants explícitos, sem reescrever migrations já publicadas.
3. Criar a identidade SQL `clube_notifications`, restrita pelos grants do executor.
4. Gerar o par VAPID e a credencial da limpeza; guardá-los no Render/GitHub Actions. Configurar as URLs públicas e demais nomes de configuração, sem valores no Git/mapa.
5. Conferir e aplicar CORS de POST para a origem exata do app com `server/scripts/configure-photo-cors.ts --apply`, preservando outras regras; sem alterar a privacidade do bucket.
6. Publicar API, testar as novas operações com arquivos/contas descartáveis e limpeza explícita, publicar Firebase e habilitar o workflow externo. Confirmar assinatura/recebimento no aparelho autorizado e atualizar a versão no mapa.

Scripts de grants não criam identidades nem senhas. O configurador de CORS é dry-run por padrão. O workflow de notificações não faz operações enquanto as configurações autorizadas estiverem ausentes. Nada dessa lista foi executado em produção nesta etapa.

## Preparação da liberação autorizada em 15/11/2026

PR 13 incorporado; cópia privada adicional criada sem compute próprio, antes das migrations 017–018 e dos grants explícitos. Identidade do executor conferida sem DDL, criação de papéis, bypass de RLS, leitura dos textos privados ou estado dos espaços, exclusão de usuários e alteração da auditoria. A entrega rápida da API agora segura a trava dentro de uma transação: o PgBouncer mantém a mesma sessão durante o processamento e libera a trava automaticamente no fim, inclusive em falhas. A identidade externa usa conexão direta. Versões finais e resultados de produção serão registrados após concluir a publicação.
