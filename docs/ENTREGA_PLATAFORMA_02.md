# Entrega 02 — permissões, mural e galeria privados

Branch: `codex/plataforma-social`. Desenvolvimento isolado, sem merge ou deploy em produção. Esta entrega amplia a fase 3; o fórum normalizado, a comunidade pública e as notificações ainda serão concluídos em incrementos seguintes. A entrega 01 continua registrada como histórico.

## Implementado

- Proprietário, administrador, moderador e membro, com capacidades verificadas no backend. Só o proprietário delega papéis. Administradores não removem o proprietário nem administradores pares. Moderadores podem remover conteúdo, mas não convidam, promovem membros ou administram o acervo.
- Configurações do clube com descrição, cor, descoberta opt-in e versão esperada. Clubes existentes continuam privados. Um clube público na busca ainda exige aprovação para participar; seu conteúdo não se torna público.
- Descoberta anônima de metadados de clubes, solicitações paginadas, aprovação/recusa auditadas, saída do membro e participantes com cursor e pesquisa. A saída revoga o vínculo; o retorno depende de reativação administrativa, como uma remoção.
- Mural privado normalizado: reflexões, resenhas, citações curtas, perguntas, enquetes, indicações, registros de encontro, conquistas e comunicados. Comunicados são limitados à administração. Publicações têm referência bibliográfica sem acesso implícito ao arquivo.
- Curtidas e salvamentos idempotentes, uma escolha por pessoa nas enquetes, comentários, respostas, curtidas em comentários, exclusão própria/moderada e controle de versão para edição de publicações.
- Consultas paginadas por data + UUID, filtros de tipo, data e texto. Cursores preservam microssegundos do PostgreSQL. Nada do mural é acrescentado ao snapshot JSONB.
- Galeria com álbuns privados, encontro legado opcional, data, descrição, política de adição de arquivos e opção de download. Até quatro arquivos por envio e cem por álbum. Os registros publicados no álbum aparecem no mural privado, com a mesma conversa e as mesmas curtidas.
- Marcações de participantes só exibem o nome após aceite da própria pessoa; recusas não podem ser repropostas por terceiros. Nomes de membros removidos deixam de ser exibidos nas marcações.
- Fotos são decodificadas e transformadas em WebP, com remoção de metadados, limite de pixels, redução a 1280 px e miniatura de até 360 px. SVG/HTML, formatos desconhecidos e arquivos inválidos são recusados.
- MP4 até 10 MB/30 segundos/1920 px de entrada é inspecionado e transcodificado para H.264/AAC, com miniatura WebP. Decoders têm protocolos/formatos restritos, prazo de execução, saída limitada, processamento serial e arquivos temporários próprios removidos ao terminar. A imagem Docker inclui FFmpeg do Debian; o CI testa um MP4 real sintético.
- Arquivos privados são entregues pela API com token e autorização atual. O DTO contém identificadores e dimensões, sem caminhos S3. Mídia ainda não vinculada a publicação/álbum é visível somente ao autor. Retirada de membro revoga novas consultas.
- Cota inicial de 50 MB por titular para fotos/vídeos, separada da cota EPUB. Remoção revoga acesso antes da limpeza física. O comando de limpeza cobre EPUB e mídia social, inclusive uploads abandonados e mídias não publicadas há mais de um dia. Ainda não há cron/worker de produção.
- Interface responsiva com mural, galeria, ampliação acessível, publicação, comentários, filtros e estados vazios. Os módulos são carregados sob demanda. O clube selecionado é lembrado na sessão do navegador e revalidado contra as associações atuais.

## Migrações e operação

- `005_club_permissions.sql`: expande a constraint de papéis, preservando a unicidade e a associação ativa do proprietário; acrescenta configurações e solicitações.
- `006_private_community.sql`: acrescenta publicações, reações, comentários, votos, tags, mídia, álbuns e consentimentos. Chaves compostas impedem associar mídia/publicação/álbum de clubes diferentes. O escopo público existe no modelo para a fase seguinte, sem rota pública de publicação nesta entrega.
- As migrations são aditivas para as tabelas existentes, sem backfill, remoção ou alteração de snapshots. O vínculo do álbum ao encontro legado é validado na transação da API; a futura normalização de eventos deverá convertê-lo em FK real.
- Nenhuma destas operações foi executada na base de produção. Após aprovação, será necessário migrar, conceder os privilégios mínimos nas novas tabelas e publicar a API antes do frontend. `DELETE` é necessário nas tabelas de reações, tags e vínculos; registros principais usam exclusão lógica. Auditoria continua somente append.
- A identidade S3 autorizada continua restrita aos escopos de storage da branch exclusiva deste app. Nenhum plano pago foi contratado, objeto de teste enviado ao bucket ou segredo instalado no Render.
- O servidor de desenvolvimento tem um adapter em `.local-data/media-private`, ativado exclusivamente com projeto `demo-clube-do-livro` + Auth Emulator. A entrada de produção nunca importa esse adapter e não usa disco efêmero como fallback.
- O botão de download respeita a configuração do álbum. Isso não impede alguém de salvar uma imagem já visualizada; a interface explica essa limitação.

## Validação

- 18 testes de interface/importação/leitura, 27 unitários da API (incluindo MP4 real com `RUN_VIDEO_TESTS=1`), 24 integrações PostgreSQL e uma integração Auth Emulator/PostgreSQL.
- Testes críticos incluem bloqueio de autopromoção, proteção do proprietário, aprovação concorrente, paginação com timestamps iguais, edição obsoleta, like/voto único, associação de mídia de outro clube/titular, consentimento, revogação e repetição de limpeza após falha.
- Navegador local: login de conta sintética, troca de clube, curtida/voto preservados após reload, comentário persistido e visível também no álbum, ampliação e download autenticado. Layout de 390 px sem transbordamento horizontal observado; console sem erros na verificação final.
- As contas, os textos, a ilustração e os arquivos desta validação são sintéticos e locais. A transferência S3 em produção permanece sem teste nesta entrega.

## O que permanece pendente

Fórum com tópicos normalizados e paginados, capítulos, fixação e encerramento; perfis públicos e controles de privacidade; feed público, follows, bloqueios e denúncias; notificações e integração entre ambientes; catálogo/arquivos de distribuição autorizada; renderização completa de EPUB; revisão final de qualidade/operação. Nenhum destes itens deve ser anunciado como concluído apenas por existir no plano ou no schema.
