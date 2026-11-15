# EPUB privado, entrelinha e notificações — 15/11/2026

A configuração autorizada do Render/GitHub está ativa. O [PR 19](https://github.com/layonlad/Aplica-o-Clube-do-Livro/pull/19) foi mesclado com autorização do dono e publicado na API e no site em `644b10ed1705d33d904fbe6f6a2e289675f4da4d`.

## Publicação concluída

- Render: deploy `dep-dbstv549v7es73bl70h0` confirmado `live` em 15/11/2026 às 16:38 UTC, no commit `644b10e`. Saúde da API/banco aprovada antes do site.
- Firebase Hosting: versão `6bdf5389404c5ad2`, canal live, liberada às 16:39 UTC. HTML e os quatro assets JS/CSS referenciados no HTML conferidos byte a byte com o build conectado.
- [CI do merge](https://github.com/layonlad/Aplica-o-Clube-do-Livro/actions/runs/43736371652): todos os passos aprovados, incluindo Docker, modo conectado, PostgreSQL, Auth Emulator e auditoria. O CI do head aprovado também passou antes do merge.
- Produção: saúde 200; rotas privadas de capa, aparência e push exigem autenticação; comunidade pública 200; CORS da capa aceita a origem do app.
- EPUB sintético importado como visitante no site publicado em Chrome móvel 390 px, WebKit móvel 390 px e Chrome desktop 1366 px. Capa, abertura pela estante, paginação, restauração da página 3, fonte/tema/entrelinha/peso/alinhamento, persistência e rolagem aprovados. Sem exceções JavaScript ou overflow horizontal.
- Entrelinha publicada medida no celular: 22,0875 para 24,9375 px; desktop: 24,18 para 27,3 px. A verificação usa apenas um parágrafo sintético no DOM do navegador isolado, sem publicar conteúdo.
- Nenhuma conta real, livro de usuário ou dado existente foi alterado nos testes de produção. O recebimento push em aparelho físico continua não comprovado.

## Configuração aplicada antes da publicação

- Render: configurações VAPID e limpeza guardadas como segredos, preservando as demais configurações. Deploy `dep-dbsspjui0phs73e1sd0g` confirmado como `live`, executando o mesmo código publicado anteriormente: `5b5a935028094c1e487df5a2cfddac5fd73833e7`. Autodeploy continua desligado; plano Free.
- GitHub: segredos do executor configurados, conexão direta e TLS verificado usando a identidade restrita das notificações; assunto VAPID e URL de limpeza em variáveis. Nenhum valor está no repositório.
- [Executor manual 43729122310](https://github.com/layonlad/Aplica-o-Clube-do-Livro/actions/runs/43729122310): terminou com sucesso e executou o worker, sem pular o processamento por falta de configuração. Nenhuma entrega ou falha foi registrada nessa execução; a limpeza também terminou sem falhas. Isso comprova a ativação, não recebimento em aparelho físico.
- O agendamento gratuito roda aproximadamente a cada 15 minutos e pode atrasar. O usuário precisa habilitar notificações explicitamente no Perfil. No iPhone, o recebimento depende também da instalação e permissão oferecidas pelo sistema.
- Na etapa de configuração, o Firebase ainda estava em `5b5a935`; a publicação posterior de `644b10e` está registrada acima. Nenhum serviço pago, migration, novo papel ou privilégio de banco foi necessário nesta tarefa.

## Leitura e importação publicadas

O leitor anterior tratava qualquer `META-INF/encryption.xml` como DRM. EPUBs podem incluir esse arquivo somente para ofuscação de fontes, inclusive livros adquiridos legitimamente. Agora navegador e API usam a mesma inspeção: metadados de direitos autorais não bloqueiam a importação; ofuscação IDPF e Adobe somente de fontes é aceita, usando fontes do app. Criptografia efetiva de capítulos ou imagens continua exigindo edição legível fornecida pela loja/editora; este trabalho não implementa decifragem de DRM.

A inspeção limita tamanho compactado/descompactado, quantidade de entradas, tamanho dos recursos e dimensões das imagens. Caminhos inválidos, referências externas e entidades XML são recusados. O leitor continua renderizando uma lista segura de elementos, sem executar HTML, scripts ou CSS arbitrários do livro.

- EPUB 3: capa identificada por `cover-image`; EPUB 2: metadados/guia, inclusive imagem raster dentro de página XHTML ou invólucro SVG. JPEG, PNG, WebP e GIF são reconhecidos. Arquivo sem capa raster compatível mantém a ilustração de reserva; uma capa puramente vetorial não é rasterizada.
- Capa própria tem prioridade sobre a capa do catálogo. Biblioteca, leitura em andamento e histórico usam a capa do original; clicar na capa da biblioteca abre o leitor.
- A importação aguarda guardar o original e sua capa antes de confirmar o resultado. Falhas nessa etapa deixam uma mensagem explícita, sem substituir o erro por sucesso genérico.
- Safari/WebKit: novos registros IndexedDB guardam bytes portáveis, evitando a falha ao clonar arquivos do seletor. Registros antigos com Blob continuam legíveis. Cotas e separação por visitante/conta foram mantidas.
- Com conta e armazenamento privado selecionado, outra sessão pode recuperar o original e a capa. Sem conta, a leitura permanece no navegador. A importação pessoal não publica nem compartilha o livro com clubes ou comunidade.
- Nova capa privada é derivada do original pela API, sob autenticação e titularidade a cada consulta. Resposta sem cache HTTP; miniaturas em memória são limitadas a 24 entradas e a dez minutos de reutilização. Nenhum arquivo adicional permanente ou bucket público é criado. A remoção do original revoga também o acesso à capa, mesmo que exista miniatura em memória.

## Controles de leitura

Modo sem distrações, páginas ou rolagem contínua, avanço/retorno por botões, toque/rolagem horizontal e setas do teclado. Sumário e pesquisa ficam recolhíveis; marcações e anotações existentes foram preservadas.

Fonte editorial, sem serifa, Lora ou Merriweather; tamanho de 16 a 32 px; temas claro, escuro e sépia; margens, entrelinha, espessura e alinhamento. As escolhas ficam no navegador e, com conta, são sincronizadas nas preferências já existentes. A posição é guardada como capítulo e deslocamento de texto, sendo recalculada após mudanças de fonte ou largura; o número de páginas pode variar entre aparelhos.

A entrelinha geral do app foi corrigida nas regras finais das publicações e descrições, preservando o padrão visual do Claude. A entrelinha do leitor permanece uma preferência própria. O upload geral de fotografias, informado como funcional pelo dono, não foi refeito.

## Validação

- `npm run check`: 64 testes frontend, 37 unitários da API com codecs reais, builds de frontend/API e validação do mapa aprovados.
- PostgreSQL: 80 testes de integração aprovados. Incluem upload/capa de EPUB com fontes ofuscadas, 401 sem sessão, 404 para outra conta, revogação após remoção, preferências novas/antigas e execução da rota de capa com a matriz atual do papel restrito. `server/ops/runtime-grants.sql` permanece igual.
- Auth Emulator e PostgreSQL: 1 teste aprovado. Total local: 182 testes.
- Navegadores locais com EPUB sintético: Chrome móvel de 390 px, WebKit móvel de 390 px e Chrome desktop de 1366 px. Importação, capa, abertura pela capa, paginação, restauração da página após recarregar, preferências, troca para rolagem, ausência de overflow horizontal e ausência de exceções JavaScript aprovadas.
- Dois contextos independentes autenticados: importação privada no WebKit e recuperação da capa/original no Chrome, sem cópia IndexedDB anterior. Fonte de 24 px, entrelinha de 48 px e Merriweather sincronizadas. Leitura de registro legado com Blob também aprovada.
- Entrelinha de uma publicação real do clube sintético: altura computada passou de 22,0875 px para 24,9375 px ao selecionar Ampla.

Todos os livros, contas e imagens desses testes são sintéticos e locais. O ensaio não representa leitura no aparelho físico do dono, push recebido em telefone, nem validação de um EPUB específico que não foi fornecido. O relatório anterior em `REVISAO_LIBERACAO_CLAUDE.md` descreve o estado antes da ativação acima.

## Procedimento da liberação

Executado após CI aprovado e autorização explícita do dono: merge do PR, publicação da API no Render, validação de saúde/rota protegida e, em seguida, publicação do site conectado no Firebase. A ordem importa porque a API antiga não aceita as novas fontes do leitor.

Não há migrations ou alterações de grants nesta entrega. Não criar cópia de banco com dados de usuários sem necessidade: a liberação não modifica estrutura nem converte livros existentes. Registrar os commits/deploys efetivamente publicados no mapa e validar sem alterar contas reais. Recebimento push em aparelho físico permanece uma verificação separada, dependente da permissão do usuário.
