# Entrega 04 — comunidade pública e central de notificações

Em revisão na branch `codex/plataforma-social`. Não publicada e sem migrações em produção.

## Implementação

- Migração 009: perfis privados por padrão, identificador público único, nome público separado da conta, biografia, gêneros, foto/capa e opções independentes para biblioteca, estatísticas e clubes públicos. Não expõe e-mail, conteúdo do livro, anotações ou arquivos pessoais. Suspensão de perfil não pode ser revertida pelo próprio titular.
- Feed público com leitura anônima, paginação, pesquisa por texto/livro/autor/hashtag, tipos de publicação, filtros seguindo/salvos, enquetes, curtidas idempotentes, comentários/respostas e edição com versão. Compartilhamento interno contém referência ao original: ocultar/excluir o original retira o acesso ao original.
- Reutiliza o modelo relacional e componentes privados com escopo explícito. Chaves compostas impedem anexar mídia de clube a post público. Upload público requer perfil público; rascunhos permanecem privados até publicação. Imagens/vídeos passam pelo mesmo processamento e cotas. Bucket continua privado e a API verifica acesso antes de entregar bytes.
- Seguidores, bloqueio simétrico na comunidade e denúncias. Bloqueio remove relações de seguidores; usuário pode consultar/desfazer seus bloqueios. Conteúdo público continua acessível anonimamente, fato explicado na interface.
- Moderação pública por lista de Firebase UIDs configurada somente no servidor (`PLATFORM_MODERATOR_UIDS`, vazia por padrão). Papéis de clube não concedem autoridade global. Denúncias privadas ficam com os moderadores do clube. Decisões têm motivo, registro específico e auditoria append-only.
- Navegação para comunidade, exploração, perfil social, notificações e moderação autorizada. Descoberta reúne perfis, busca bibliográfica e clubes que optaram por aparecer. Referências de livros podem ser adicionadas à biblioteca pessoal mesmo estando em um clube; não copia arquivos nem texto privado.
- Migração 010: central de notificações, preferências por categoria e deduplicação transacional para curtidas, comentários/respostas, menções, seguidores, convites por e-mail, pedidos/aprovações e fórum. Consulta revalida recurso, visibilidade, bloqueio, membership e permissão administrativa; DTO não guarda o corpo da publicação nem segredo de convite. Janela visível de 90 dias.
- Aceite dentro do app para convite dirigido ao e-mail verificado da conta. Convites por link continuam com token. Remoção prévia de membro não pode ser contornada pelo convite.
- Separação entre autor anônimo e autenticado: header inválido é rejeitado, nunca convertido em leitura anônima. Conteúdo privado continua exigindo autenticação.

## Validação

- 28 testes de frontend e 36 de integração passaram antes da última ampliação de cobertura de estatísticas/suspensão. API compilou; build conectado passou antes de adicionar a central visual.
- Testes novos verificam opt-in, nome público, ocultação de dados pessoais, mudança de privacidade, bloqueio nos dois sentidos, unicidade de reações, paginação, arquivos privados versus públicos, compartilhamento e moderação; notificações verificam preferências, deduplicação, revogação e convite com e-mail correto.
- Revisão real no navegador local: login sintético, criação de perfil público com biblioteca/estatísticas/clubes desativados, envio de WebP sintético, publicação com foto, comentário e persistência após recarga. Console sem erros. Capturas em `/private/tmp/clube-comunidade-publica.jpg` e `/private/tmp/clube-comunidade-mobile.jpg`.
- Conferência móvel em 390 × 844: largura do documento igual à viewport, sem transbordamento horizontal. Corrigido encolhimento da barra lateral desktop; ajuste adicional mantém a busca em sua própria linha no celular.
- O seletor de arquivos do controle do navegador demorou cerca de 47 minutos para devolver o comando, embora o upload tenha terminado. Não atribuir esse atraso à API: os testes locais de processamento são rápidos.

## Ainda em trabalho

A integração de eventos/livros/leitura coletiva aos avisos, retenção física agendada, galerias vinculadas ao calendário, leitor EPUB com layout original e área de fontes autorizadas continuam nas fases 05–06. Não declarar a plataforma inteira concluída. O feed é cronológico; ranking de popularidade e recomendações personalizadas ainda não foram implementados. Menções são reconhecidas pelo identificador público no texto e geram aviso, sem autocompletar. Os gatilhos não enviam e-mails ou mensagens externas.

## Liberação

Para publicar, preparar validação final, cópia de segurança e plano de reversão. Solicitar autorização concreta para aplicar 003–010 no Neon, instalar credenciais server-side no Render e publicar frontend/API. A autorização do bucket não autoriza essa liberação. Nenhuma conta ou perfil real foi alterado durante os testes.
