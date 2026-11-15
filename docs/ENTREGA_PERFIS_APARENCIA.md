# Entrega — fotos de perfil, perfis visitáveis, abertura animada e aparência

Branch: `claude/perfis-abertura-aparencia`, criada a partir de `codex/plataforma-social` (`0025ddf`). Nada foi publicado em produção.

## O que foi implementado

### 1. Foto de perfil e identidade do usuário
- **Toda conta confirmada pode adicionar, trocar e remover a foto**, mesmo sem perfil público. Em "Meu perfil" e em "Perfil social", o editor (`AvatarUploader`) permite escolher JPG, PNG ou WebP (até 15 MB) e reposicionar a imagem (arrastando ou pelas setas do teclado). Também permite ampliar, ver a prévia no círculo e salvar. Durante o envio aparece um indicador, e mensagens informam o sucesso ou o erro.
- **Processamento:** o navegador recorta em 512 × 512 e comprime em WebP (com JPEG como reserva). O servidor valida de novo e reprocessa com o serviço de mídia existente (`sharp`, limite de 5 MB, cota da conta).
- **Troca e remoção:** ao trocar ou remover, a foto anterior é revogada, e o arquivo deixa de ser entregue imediatamente.
- **Sem foto:** aparecem as iniciais sobre uma cor da paleta, escolhida de forma estável pelo nome.
- **`UserAvatar` e `UserIdentity`** (`src/components/UserAvatar.tsx`) mostram o avatar circular em 5 tamanhos, o nome com link para o perfil e metadados. Estão no mural público, no mural do clube, nos comentários, no fórum (lista, tópico e respostas), na galeria, nos participantes de encontros, nos membros do clube, nas solicitações de entrada, no Explorar e no trilho lateral.
- **A foto é uma referência viva ao perfil, nunca uma cópia:** trocar a foto atualiza publicações e comentários antigos.

### 2. Perfis visitáveis
- `/app/people/:id` abre ao clicar no nome ou na foto. A página tem capa (ou faixa de lombadas), foto grande, @usuário, biografia, contadores, clubes em comum, Seguir/Bloquear/Denunciar e Voltar.
- **Abas acessíveis** (`role=tablist`, navegação por setas):
  - **Publicações Públicas:** posts públicos do autor, paginados, com link para a publicação original.
  - **Publicações dos Clubes:** só posts dos clubes em que o visitante também participa, com o nome do clube e um link para abri-lo.
  - **Sobre:** gêneros, estatísticas, estante e clubes públicos, conforme a privacidade escolhida pelo dono.
- **Perfil privado:** quem compartilha um clube vê nome, foto e as publicações do clube em comum. Quem não compartilha recebe "Perfil indisponível".

### 3. Abertura com livro (`src/app/BookOpening.tsx`)
- **Sequência:** um livro grande de capa roxa surge, a capa abre devagar, três folhas viram, o nome "Clube do Livro" aparece na página da direita e algumas páginas voam como pássaros (referência visual enviada). No fim, a câmera entra na página até o papel cobrir a tela inteira e se desfazer no app.
- **Tamanho:** aberto, o livro ocupa quase toda a largura do celular. O zoom final é calculado para a tela de cada aparelho.
- **Duração:** cerca de 4,8 s (atualizada em 15/11/2026; antes 2,6 s), com curvas de movimento mais suaves. Fica abaixo de 5 s porque movimento automático mais longo exigiria um controle de pausa (WCAG 2.2.2). Só CSS 3D (`transform` e `opacity`), sem vídeo nem biblioteca.
- **Uma vez por sessão do navegador:** trocar de página não reinicia a abertura. O app carrega por baixo ao mesmo tempo, sem atraso artificial.
- **Sem botão de pular** (pedido do dono em 15/11/2026). Quem navega pelo teclado ainda pode encerrar com Esc.
- **Movimento reduzido:** livro já aberto, com só um esmaecimento de cerca de 0,9 s.
- **Aparelhos com 2 núcleos ou menos, ou com economia de dados:** versão leve de cerca de 2,8 s: a capa abre e a página cobre a tela, sem folhear.
- **Sem clarão:** um script no `index.html` aplica o modo claro ou escuro salvo antes do primeiro desenho.

### 4. Aparência e personalização (`/app/theme`, acessível pelo card em "Meu perfil")
- **Temas:** Padrão, Roxo, Coral, Azul, Verde, Dourado e Personalizado (seletor de cor).
- **Contraste:** cores personalizadas passam por `ensureContrast`, que escurece ou clareia a cor até atingir AA (4,5:1) e avisa quando ajustou. Todos os temas prontos passam em AA com texto branco.
- **Modo:** claro, escuro ou automático (segue o sistema).
- **Fontes:** fonte dos títulos e fonte dos textos, escolhidas entre Fraunces, Playfair Display, Lora, Merriweather, Plus Jakarta Sans, Inter, Manrope, DM Sans e Poppins (todas SIL OFL, auto-hospedadas). As extras só são baixadas quando escolhidas ou nesta tela, para as amostras.
- **Formato dos cartões:** arredondado, suave ou reto.
- **Prévia em tempo real em todo o app**, com o aviso "Prévia ativa · alterações ainda não salvas" e os botões **Aplicar alterações**, **Cancelar** e **Restaurar padrão**. Sair da tela sem aplicar descarta a prévia.
- **Persistência:** neste navegador e, com conta, em `personal_workspaces.preferences.appearance`, recuperada após o login em qualquer aparelho.
- **Leitor de livros:** mantém as próprias preferências de leitura, separadas da aparência geral.

## Alterações de backend (pontuais, aditivas e sem migração)

| Arquivo | Mudança |
| --- | --- |
| `media-service.ts` | Upload marcado como foto de perfil não exige perfil público. A foto do perfil também pode ser lida por quem tem clube ativo em comum com o dono; antes, só se o perfil fosse público. |
| `profile-service.ts` | `setAvatar` (troca ou remoção, devolvendo a anterior para revogar) e `person` (cartão mínimo: perfil público ou clube em comum, listando só clubes em comum). |
| `post-service.ts` | `author.avatarId` em todas as publicações e comentários; `sharedClubPosts` filtra no SQL pela associação ativa do visitante e respeita bloqueios. |
| `forum-service.ts`, `service.ts`, `event-service.ts`, `album-service.ts`, `club-management.ts` | `avatarId` dos autores, membros, participantes, quem enviou fotos e solicitantes (referência ao perfil). |
| `appearance-schema.ts` / `appearance.ts` (novos) | Esquema validado (cor só em hex) e serviço que grava em `preferences.appearance` com o mesmo lock da linha usado pelas ações do espaço pessoal. |
| `workspace-model.ts` | `preferencesSchema` passa a preservar `appearance`; sem isso, as ações do espaço apagavam a preferência. |
| `public-routes.ts` | `POST/DELETE /v1/me/avatar`, `GET/POST /v1/me/appearance`, `GET /v1/people/:id` e `GET /v1/people/:id/club-posts`. |
| Contratos | `avatarId` opcional em `Member`, autores de post, comentários, fórum e fotos de álbum. |

Nenhuma tabela, coluna ou permissão de banco nova; `runtime-grants.sql` não muda. A projeção `author` agora inclui `avatarId: null`, e o teste que comparava o objeto exato foi atualizado.

## Testes

- **Frontend:** 41 testes (32 existentes e 9 novos, em `src/app/personalization.test.tsx`), cobrindo contraste de todos os temas, ajuste de cor personalizada, abertura (versões, pular, não repetir, saída automática), iniciais e link do perfil e validação de arquivo.
- **API unitários:** 27 (1 pulado, já existente).
- **API e PostgreSQL:** 54 testes (50 existentes e 4 novos, em `server/test/profiles.integration.test.ts`):
  - **Foto:** pode ser enviada sem perfil público; colega de clube vê, estranho e anônimo recebem 404; arquivo inválido é recusado.
  - **Troca de foto:** posts antigos e a lista de membros mostram a nova; a anterior é revogada; a remoção zera a referência.
  - **Privacidade:** João vê só o Clube A da Maria, nada do Clube B (nem nome nem id); estranho recebe lista vazia e 404; sem login, 401; ao sair do clube o acesso some.
  - **Aparência:** salvar e ler, cor inválida recusada, preservada após uma ação do espaço, isolada por conta.
- **Builds e auditoria:** builds demo e conectado concluídos; `npm audit --omit=dev`: 0 vulnerabilidades.

## Validação visual

Feita numa pilha de revisão isolada: banco Postgres temporário, API desta branch e Auth Emulator próprio na porta 9199, com contas e dados sintéticos. O ambiente do Codex não foi usado.

- **Mural privado:** a foto da Maria aparece para o João; o João sem foto aparece como "JP". Depois que o João envia a foto, o post antigo dele passa a mostrá-la, assim como o trilho lateral.
- **Comentário → perfil da Maria:** "Em comum" mostra só o clube compartilhado; a aba de clubes mostra só o post desse clube; o texto do outro clube não aparece na página.
- **Aparência:** azul, escuro, Playfair e Inter em prévia → Cancelar volta ao padrão → Aplicar salva. Depois de apagar o armazenamento do navegador (simulando outro aparelho), a aparência voltou da conta.
- **Abertura:** conferida quadro a quadro em 1024 px e 375 px; livro fechado e livro aberto centralizados.
- **Rolagem horizontal:** nenhuma em 375 px no perfil e na Aparência.

## Pendências resolvidas (branch `claude/pendencias-perfis`)

- **Foto nas notificações:** a lista de notificações devolve `actorAvatarId` (referência ao perfil atual) e mostra a foto de quem gerou o aviso. A entrega da imagem continua sujeita à mesma regra: perfil público, ou clube ativo em comum. Teste de integração novo.
- **Foto no compositor do mural:** o campo "O que sua leitura despertou hoje?" mostra a foto da própria conta. O hook `useOwnAvatar` faz uma consulta por sessão e atualiza na hora quando a foto muda; o trilho lateral usa o mesmo hook.
- **Link direto para post de clube:** `/space/:clubId?post=<id>` troca para o clube e abre a publicação no mural, com "Voltar ao mural". A aba "Publicações dos Clubes" do perfil usa esse link ("Ver no mural do clube").
- **Tablet (768 px):** 17 telas verificadas sem rolagem horizontal. Links de texto avulsos agora têm área de toque de 44 px (WCAG 2.2, critério 2.5.8).
- **Telas sem estilo quando abertas diretamente:** Notificações, Explorar, Moderação, Perfil e telas de clube passam a importar o CSS de que dependem. Antes, ao abrir a URL direto (sem passar pelo mural), apareciam sem estilo.
- **Integração com a revisão do Codex (`a034dd4`, `ca8169e`):** a revogação atômica da foto e a exigência de autor ativo no clube foram mantidas. Os testes dele e o novo convivem no mesmo arquivo.

## Pendências e limites

- **Solicitações de entrada:** mostram a foto, mas não têm link, porque a pessoa ainda não é membro e o perfil pode ser privado.
- **Foto trocada em outro aparelho:** o próprio avatar só se atualiza nesta aba depois de recarregar a página (uma consulta por sessão).
- **Não testados:** leitor de tela real e o recorte em celulares com câmera (o envio por arquivo foi testado no navegador).
- **Abertura como overlay:** ela fica por cima do app enquanto ele carrega. Se a API demorar mais que a abertura, o app mostra o próprio carregamento, sem prolongar a animação.

## Possíveis conflitos com o Codex

Arquivos de backend alterados: `media-service.ts`, `profile-service.ts`, `post-service.ts`, `forum-service.ts`, `service.ts`, `event-service.ts`, `album-service.ts`, `club-management.ts`, `public-routes.ts`, `workspace-model.ts`, `contracts.ts`, `community-contracts.ts`, `forum-contracts.ts` e o teste `community.integration.test.ts` (uma asserção).

No frontend, mudaram `SocialProfile.tsx`, `ClubWall.tsx`, `ClubForum.tsx`, `ClubGallery.tsx`, `ClubCalendar.tsx`, `ClubSettingsPanel.tsx`, `ConnectedApp.tsx`, `Explore.tsx`, `WorkspaceApp.tsx` (`ProfileView` e `ThemeView`), `WorkspaceShell.tsx` e `ThemeProvider.tsx`.

`package.json` e `package-lock.json` ganharam 7 pacotes de fontes. Se o lock conflitar, aceite um lado e rode `npm install`.
