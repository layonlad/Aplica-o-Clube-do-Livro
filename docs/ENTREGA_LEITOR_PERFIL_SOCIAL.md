# Leitor imersivo e perfil social — entrega para revisão

Implementação de 16/11/2026 — [PR 27](https://github.com/layonlad/Aplica-o-Clube-do-Livro/pull/27). **Sem merge e sem publicação em produção nesta tarefa.** A versão publicada permanece `383541f` (PR 25). O nome e a identidade visual existentes foram preservados. O [mapa](https://layonlad.github.io/Aplica-o-Clube-do-Livro/mapa/) reflete `main`; as mudanças descritas aqui dependem da aprovação do PR e de uma liberação posterior.

## Leitor EPUB

- `ImmersiveReader.tsx` ocupa a viewport disponível, respeita safe areas e bloqueia a rolagem externa. Abre sem menus; o centro alterna os controles. Fullscreen nativo é oportunista e também tem botão explícito; existe fallback sem depender da API do navegador.
- `reader-gestures.ts` distingue deslocamento horizontal, toque, movimento vertical, toque longo e bordas reservadas ao navegador. Seleção de texto, links e múltiplos contatos não viram páginas. Setas do teclado e controles acessíveis continuam disponíveis.
- `page-turn.ts` anima uma cópia inerte da folha antiga com rotação 3D, sombra e duração de 280 ms. O texto real mantém seleção, acessibilidade e coordenadas. A animação pode ser desligada; movimento reduzido, ausência da API de animação e capítulos com mais de 1.500 elementos usam virada imediata, evitando cópias pesadas.
- Aparência, sumário/pesquisa e ferramentas ficam em diálogos separados. Fontes, tamanho, peso, entrelinha, parágrafos, margens, alinhamento, temas, fundo personalizado e gestos têm persistência no mecanismo existente. A prévia é imediata; falhas de gravação são informadas.
- Favoritos, marcador, conclusão/avaliação, pesquisa, destaques e anotações continuam disponíveis. A seleção abre um painel próprio; o original nunca acompanha um compartilhamento de trecho.
- `useEpubPagination.ts` e `epub-scroll.ts` preservam posição por deslocamento UTF-16 do DOM sanitizado, equivalente estável para este renderizador. Um ordinal opcional de imagem resolve páginas sem texto e mantém compatibilidade com os marcadores antigos. Mudanças de fonte, viewport e controles reposicionam a âncora; o salvamento é atrasado e evita escrever o mesmo ponto.
- Duas causas concretas corrigidas: a transformação de entrada da rota distorcia coordenadas durante a retomada no Chrome; a antiga altura reduzida do modo de foco criava colunas extras antes de capas. A transformação foi desativada somente na rota do leitor, e páginas/imagens usam a altura real disponível.

O projeto usa o renderizador EPUB próprio já existente, com whitelist de elementos, imagens locais e descarte de scripts, atributos executáveis, formulários e recursos remotos. Não foi substituído por outra biblioteca. Arquivos criptografados continuam exigindo uma edição legível; não houve alteração de DRM, cotas ou distribuição de originais.

## Perfil e navegação

`/app/profile` abre o perfil social da conta confirmada, inclusive se a biblioteca estiver temporariamente indisponível. A restauração da sessão mostra carregamento, evitando acesso a workspace nulo. Visitantes mantêm o perfil local. Conta, meta e backup continuam acessíveis em `/app/settings`.

Cabeçalho com foto, identificador exclusivo, biografia multilinha, contadores e **Editar perfil abaixo da bio**. O editor existente mantém upload validado, recorte, capa e controle de versão; passa a explicitar perfil público/privado. O backend continua garantindo unicidade do identificador. Serviços de clubes, mural, comentários, fórum, encontros, álbuns e notificações resolvem o nome público e a foto atuais, sem copiar a foto para cada registro.

Abas:

- **Publicações:** conteúdo pessoal da comunidade autorizado para o visitante.
- **Clubes:** clubes próprios/administrados para o titular, compartilhados para colegas e metadados públicos apenas quando autorizados. Publicações dos clubes continuam filtradas por associação ativa dos dois leitores.
- **Atividades:** publicações, comentários, tópicos, respostas e participação em clubes, com contexto, autor, data, prévia e acesso ao original. SQL aplica autorização e cursor em cada origem, limita cada ramo antes da agregação e usa índices por autor/data.
- **Salvos:** somente o titular. Publicações salvas revalidam acesso; favoritos, marcadores e contagem de anotações pessoais levam ao leitor. A projeção de leituras é limitada aos 100 livros já permitidos pelo workspace e não retorna texto, notas, arquivos ou dados de clube.
- **Sobre:** preserva gêneros, estatísticas e biblioteca que a pessoa optou por divulgar.

## Matriz de privacidade

| Informação | Visitante sem sessão | Conta sem relação | Seguidor aprovado | Colega ativo no mesmo clube | Titular |
| --- | --- | --- | --- | --- | --- |
| Perfil público disponível | Metadados públicos | Metadados públicos | Metadados públicos | Metadados públicos | Completo |
| Cartão de perfil privado | 404 | Nome, identificador, bio e gêneros escolhidos | Cartão autorizado | Cartão mínimo e clubes em comum | Completo |
| Publicações pessoais de perfil privado | Não | Não | Sim, sem bloqueio/suspensão | Apenas se também for seguidor | Sim |
| Foto privada | Não | Não | Sim | Sim, com associação ativa em comum | Sim |
| Capa privada | Não | Não | Sim | Só se também for seguidor | Sim |
| Contadores/estatísticas de perfil privado | Não | Ocultos | Autorizados; estatísticas dependem da escolha do titular | Só se também for seguidor | Sim |
| Conteúdo/atividade de clube privado | Não | Não | **Não por ser seguidor** | Apenas dos clubes autorizados em comum | Conforme associação atual |
| Salvos, marcadores, notas e EPUB original | Não | Não | Não | Não | Sim |

`audience='public'` continua identificando o ambiente da comunidade no banco; a visibilidade efetiva também depende do perfil, da relação aprovada, da disponibilidade do conteúdo e dos bloqueios. Comentários pessoais e suas mídias/contagens usam a mesma regra. Uma publicação pessoal privada não pode ser copiada para alcance público pelo endpoint de compartilhamento. As permissões de clubes continuam independentes.

Bloqueio em qualquer direção oculta o perfil e o conteúdo, cancela pedidos pendentes e desfaz relações nos dois sentidos. Desbloquear não reapróva ninguém. Suspensão impede novas relações e publicações e retira conteúdo pessoal da descoberta; não cria nem remove automaticamente associação a clubes. A existência de denúncia e os controles de moderação são preservados; esta entrega não concede a moderadores uma leitura geral de textos pessoais privados.

## Relações e notificações

Perfil público permite seguir imediatamente. Perfil privado gera pedido pendente com estados solicitado, cancelado, aceito ou recusado. Só o destinatário pode decidir; pedidos repetidos são idempotentes e ações sobre pedidos já resolvidos retornam 409. Uma nova tentativa após recusa/cancelamento recebe outra identidade de pedido, evitando que uma aprovação antiga aceite a nova tentativa.

As operações e o bloqueio travam os dois usuários em ordem determinística antes de alterar relações. A mudança público → privado preserva os seguidores existentes. Notificações usam o módulo atual, com discriminação de solicitação/aprovação e revalidação antes da leitura ou envio; push continua genérico, sem prévia privada.

## Banco e permissões

**Migration aditiva `019_follow_requests.sql`:** tabela de solicitações com chave única por par e índices de pedidos pendentes e atividades. Não altera migrations antigas, não apaga dados e não duplica seguidores aprovados, perfis ou conteúdo. `follows` continua contendo somente relações aprovadas.

- API: `runtime-grants.sql` acrescenta somente SELECT/INSERT/UPDATE em solicitações, com revogação explícita de grants legados. DELETE, DDL, migrations e alteração de auditoria continuam negados.
- Executor: `notification-worker-grants.sql` acrescenta leitura de `profiles.suspended` e das duas identidades da relação aprovada. Não concede biografia, textos, workspace ou leitura de solicitações.
- Sem novo bucket, nova identidade, credencial, serviço ou dependência de runtime. Firebase Auth, PostgreSQL, bucket privado e rotas de upload existentes são reutilizados.

Novas operações autenticadas:

| Operação | Finalidade |
| --- | --- |
| GET `/v1/me/follow-requests` | Pedidos recebidos, paginados e somente do titular |
| POST `/v1/me/follow-requests/:id` | Aprovar/recusar um pedido recebido |
| GET `/v1/people/:id/activity` | Atividades com autorização atual e cursor |
| GET `/v1/me/profile/saved` | Publicações salvas do titular |
| GET `/v1/me/profile/reading-saved` | Metadados privados de favoritos, marcadores e anotações |

## Verificações

Resultado local: **207 testes aprovados — 73 frontend, 44 unitários da API, 89 PostgreSQL e 1 Auth Emulator.** Builds frontend/API e ensaio das migrations aprovados. Os comandos reutilizam a suíte do projeto. O build inclui a checagem TypeScript; não existe comando separado de lint neste repositório.

- `npm run check`: mapa, frontend, unitários da API com FFmpeg/FFprobe e builds frontend/API.
- `npm run test:integration`: PostgreSQL temporário, privacidade, concorrência, nomes/fotos, novas rotas com papel restrito, worker e ensaio das migrations.
- `npm run test:e2e`: Auth Emulator, identidade/revogação e PostgreSQL temporários.
- `npm audit --audit-level=high`: aprovado, sem altas/críticas; 14 avisos moderados na árvore de ferramentas de desenvolvimento da CLI Firebase. `npm audit --omit=dev --audit-level=high`: zero vulnerabilidades. Nenhuma atualização forçada ou downgrade da CLI foi aplicado.
- Ensaio das migrations 017–019 sobre a base 016: duas aplicações, com preservação de seguidores, posts, vídeo, comentários, preferências e histórico. Nenhum dado de usuário real copiado. O CI usa PostgreSQL 17; o PostgreSQL embarcado local é 18.
- Navegadores locais: Chrome e WebKit a 390×844 e rotação para 844×390; Chrome desktop 1366×900; movimento reduzido no WebKit; perfil também conferido a 320 e 768 px. Testes usam EPUB sintético com capa e três capítulos e três contas descartáveis no Auth Emulator. Nenhum teste foi executado em produção.
- Leitor: abertura sem controles, gestos nas duas direções, teclado, limites de capítulos, efeito de folha, desligamento da animação, fallback de fullscreen, fullscreen nativo desktop, preferências após recarga, retomada paginada e contínua, favoritos, marcador e anotação após recarga.
- Social: ícone de perfil, edição, foto, bio, botão abaixo da bio, privacidade, pedido/aprovação/recusa/cancelamento, atividades autorizadas e recusa HTTP de clube privado a seguidor não membro. As contas sintéticas foram excluídas ao final; os bancos e arquivos locais são descartáveis.

**Limites reais:** navegadores simulados não são aparelhos físicos com Safari iOS/Chrome Android; toque sintético não substitui a validação de gestos nativos e teclado real. Leitor de tela, push físico e desempenho em aparelho intermediário ainda precisam de conferência. O efeito é uma folha em rotação 3D, sem deformação física/curl da malha. No modo rolagem, a âncora textual pode alinhar a linha ao topo depois de alterar a tipografia; em mudança de fonte o número visual da página pode mudar sem perder o trecho. Não foi introduzido cache offline do app nem liberação de arquivos com DRM.

## Validação manual

1. Abrir um EPUB com capa em um celular; confirmar que só a página aparece. Deslizar nas duas direções, tocar no centro e testar os controles nas laterais sem invadir a borda do navegador.
2. Abrir Aa, mudar fonte, entrelinha, parágrafos, margens e fundo; fechar o painel e conferir o texto inteiro. Alternar páginas/rolagem e animação; rotacionar o aparelho.
3. Avançar páginas e capítulos, salvar favorito/marcador e uma anotação, sair e voltar. Recarregar e, com conta, abrir em outra sessão para conferir a persistência.
4. Clicar no ícone Perfil, editar foto/nome/identificador/bio. Confirmar os dados nas publicações e comentários existentes.
5. Com duas contas, tornar um perfil privado, solicitar e aprovar. Confirmar publicação pessoal visível depois da aprovação, sem acesso a clubes privados. Repetir com recusa, cancelamento, unfollow e bloqueio.
6. Usar uma terceira conta membro de somente um clube comum; conferir que a aba Clubes e as atividades não mencionam o outro clube. Salvos e notas pessoais permanecem apenas no próprio perfil.

## Liberação posterior — somente com nova autorização

1. Aprovar o PR e conferir o CI do commit final; preservar recuperação privada e as versões publicadas.
2. Aplicar a migration 019 pelo papel proprietário e os dois scripts de grants. Não executar a API nova antes da tabela nem conceder DDL ao runtime.
3. Construir uma imagem pelo commit aprovado e publicar API e executor pelo digest no Cloud Run. Conferir saúde, 401 sem sessão nas rotas novas, relações, bloqueios e mídia com dados sintéticos autorizados.
4. Publicar os dois Firebase Hosting **depois** da API: o servidor antigo não conhece os novos campos de preferência nem as novas rotas. Manter Auth, bucket, cotas, IAM, CORS e Scheduler atuais.
5. Validar em produção com conta/arquivos descartáveis explicitamente autorizados, limpar somente esses dados e registrar as versões realmente publicadas no mapa.

A migration pode permanecer caso o frontend precise ser revertido. Não apagar a tabela, seguidores ou dados para rollback. O binário antigo pode descartar campos opcionais novos ao gravar preferências; tratar um rollback de backend como operação de compatibilidade, preservar os dados e preferir correção para frente.
