# Entrega 06 — leitor original, integrações e validação operacional

Versão de revisão. Não publicada. A autorização atual permite preparar o aplicativo; operações em produção continuam dependentes da aprovação solicitada pelo próprio documento de requisitos.

## Resultado implementado

A aplicação preserva o visual integrado do `main` e os recursos pessoais anteriores. É possível entrar sem conta, usar biblioteca, leitor, caderno e agenda locais e consultar comunidade/descoberta. Conta verificada é necessária para sincronizar e participar. Associação ativa é necessária apenas para o conteúdo privado do clube.

O leitor EPUB original usa ZIP com limites e renderização por uma lista restrita de elementos React. Não injeta HTML, scripts, estilos de editoras, formulários ativos, handlers, frames ou URLs remotas do arquivo. Mantém capítulos, estrutura textual e imagens locais PNG/JPEG válidas. Tem sumário, pesquisa, temas, fonte, margens, marcador, destaque, nota e posição automática por hash/capítulo/offset. As preferências e o progresso usam o estado privado existente e revisão para conflitos. epub.js foi avaliado; a implementação restrita evita executar conteúdo do EPUB dentro de frames. Não promete reproduzir o projeto gráfico exato de uma editora.

O importador conserva metadados e texto simplificado, identifica capa e guarda o original separadamente em IndexedDB (visitante ou namespace da conta). Guardar também o original privado na conta é uma escolha visível no formulário. Arquivos originais não entram no backup JSON; podem ser baixados separadamente. O leitor consegue recuperar o original da conta em outro aparelho. Troca de arquivo não aplica posições/destaques de outro hash.

Compartilhar citação exige abrir o formulário, escolher comunidade ou um clube e confirmar. Copia somente até 280 caracteres e a referência; não inclui nota privada nem EPUB. O acervo do clube admite arquivos enviados expressamente por administrador, com origem, licença e confirmação de distribuição. Download revalida associação e livro atual.

A área de leituras autorizadas inclui um conto EPUB original de demonstração, gerado por `scripts/create-demo-epub.mjs`, e links para condições de acervos oficiais. Não replica obras de terceiros nem transforma disponibilidade na Open Library em licença. Avaliação média e quantidade da Open Library são metadados opcionais, distintos da avaliação pessoal.

Encontros, álbuns, mural, fórum, leituras coletivas, perfis e notificações estão conectados. A descoberta usa contagens reais de conteúdo público visível dos últimos 30 dias para livros conversados, destaques, resenhas, perguntas e indicações. Não utiliza bibliotecas privadas para recomendações. Menções em posts e comentários são reconhecidas por `@identificador` e geram aviso, sem autocompletar.

Capas de clube são privadas por padrão. Exibi-las para visitantes exige uma autorização independente, além de tornar o clube descobrível/público. O compartilhamento de foto de álbum na comunidade exige permissão do álbum e confirmação de quem publica. Cria outra mídia/post público sem copiar identificações, legenda privada ou nome do clube automaticamente. Revogar a permissão durante a transferência impede o commit público.

## Banco e operação

- Migrações 003–015 são aditivas ou ampliam restrições de forma compatível. 001/002 mantêm os checksums publicados. Fórum e encontros são reconciliados sem apagar o JSON de origem. Fonte inválida interrompe a transação inteira.
- `server/ops/runtime-grants.sql` contém permissões explícitas para os objetos da versão. API não recebe CREATE, acesso a migrations, DELETE em usuários ou alteração da auditoria. A aplicação foi testada com papel restrito, não somente com dono do banco.
- Manutenção opcional `MEDIA_CLEANUP_ENABLED=true`: roda enquanto a API está acordada, em lotes pequenos e com advisory lock para evitar dois processos. Não cria cron pago. Apaga avisos com mais de 90 dias e repete a remoção de arquivos já revogados/abandonados.
- PUT com erro mantém tombstone privado e aguarda 30 minutos antes de purgar. Objetos recentemente purgados são revisitados por sete dias para remover escrita tardia do provedor. Exclusão/revogação não depende de a remoção física ter funcionado.
- O bucket `clube-livro-media` permanece privado. Não houve upload de dados de produção, configuração de segredo no Render ou habilitação de manutenção em produção durante esta revisão.
- Responsável de moderação escolhido pelo usuário: `negocio.layon@gmail.com`. O UID foi localizado por consulta somente de leitura e preparado em arquivo local ignorado, sem incluí-lo no frontend ou no repositório. A permissão real ainda não foi aplicada.

## Evidências

- 32 testes de frontend, 28 testes unitários de API (incluindo processamento real de MP4), 50 de integração com PostgreSQL e 1 com Firebase Auth Emulator passaram: 111 no total. O CI do commit 24c36c0 também passou com build demo/conectado, imagem Docker e auditoria. Os pequenos ajustes finais de feedback/rascunhos passam novamente pelo CI antes da liberação.
- Ensaio de todas as migrações sobre a estrutura extraída de produção, restaurada apenas localmente: zero linhas de usuários copiadas, checksums de base conferidos, dados sintéticos preservados e segunda execução idempotente. Reexecutar após qualquer nova migration.
- Navegador real local: publicação pública com foto e comentário persistente; perfil opt-in; EPUB de demonstração importado como visitante, ilustração, capítulos, marcador/posição retomados, destaque e nota privada preservados após recarga. Console sem erros.
- Conferência móvel 390 × 844: comunidade e leitor sem transbordamento horizontal. Ajustes de foco no menu, barra lateral sem encolher, campos e alvos de toque consistentes.
- Evidências com dados exclusivamente sintéticos: [comunidade pública](evidence/community-public.jpg), [comunidade móvel](evidence/community-mobile.jpg), [leitor com destaque privado](evidence/epub-reader.jpg) e [leitor móvel](evidence/epub-mobile.jpg).
- Revisão autenticada final: encontro criado com livro, RSVP preservado após recarga, álbum com data/encontro preenchidos, recuperação de foto preparada e cópia pública criada somente após as duas autorizações. Console sem erros.
- Build com a configuração Firebase real existente passou após a API Render responder saudável. Não houve deploy. Render confirmado no plano Free, sem suspensão e com autodeploy desligado.

## Limites conhecidos e transparência

Esta é uma implementação funcional com limites explícitos para a infraestrutura gratuita: 100 títulos por espaço, arquivos EPUB até 10 MB, 50 MB de originais pessoais, 50 MB de EPUBs por clube e 50 MB de mídia social por conta. Uma imagem enviada tem até 5 MB; vídeo MP4 até 10 MB/30s. O leitor limita recursos descompactados a 20 MB e 1.500 entradas, capítulos de até 3 MB e imagens PNG/JPEG de até 2 MB/20 MP. SVG, DRM, CSS original e formatos avançados de EPUB não são executados. A leitura simplificada tem até 600 mil caracteres; o original separado permite ler o restante dentro dos limites do arquivo.

A biblioteca e o progresso ainda usam os snapshots pessoais limitados do modelo anterior; social, fórum, calendário e galeria não exigem carregar todo o histórico. Não há instalação offline via service worker, notificações push/e-mail, ranking personalizado por IA, nem promessa de capacidade ilimitada no Free. Render pode dormir; a manutenção retoma quando a API acorda. A licença de um arquivo compartilhado é declarada pelo administrador; não é uma validação jurídica automatizada.

Excluir dados específicos e desativar o perfil estão disponíveis; a exclusão automática integral de uma conta Firebase não faz parte desta versão. Não alegar certificação ou conformidade jurídica integral com a LGPD. Auditoria e fontes legadas preservadas para reconciliação/reversão precisam de política operacional de retenção aprovada antes de descarte definitivo.

## Fontes técnicas consultadas

- [EPUB.js](https://github.com/futurepress/epub.js), [fflate](https://github.com/101arrowz/fflate), [sharp](https://sharp.pixelplumbing.com/api-constructor/), [FFmpeg](https://ffmpeg.org/ffmpeg.html).
- [API de busca da Open Library](https://openlibrary.org/dev/docs/api/search) e [campos de avaliações no esquema oficial](https://github.com/internetarchive/openlibrary/blob/master/conf/solr/conf/managed-schema.xml).
- [Portal Domínio Público](https://portal.mec.gov.br/dominio-publico), [Biblioteca do Senado](https://www12.senado.leg.br/institucional/biblioteca/faq-biblioteca) e [condições do Standard Ebooks](https://standardebooks.org/about/standard-ebooks-and-the-public-domain). Os links são referências às condições da origem, não autorização genérica de redistribuição.
