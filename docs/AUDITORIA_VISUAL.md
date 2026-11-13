# Auditoria visual — Clube do Livro

Data: 13/11/2026 · Base auditada: `main` em `bd94489`, modo conectado como visitante, viewports 375×812 e 1280×800.

As telas foram abertas no navegador e capturadas. A avaliação não se baseou só no código.

## Diagnóstico por prioridade

### P0 — quebra visual ou de uso

| Problema | Onde | Situação |
| --- | --- | --- |
| Atalhos "Indicações e sorteio" e "Meu histórico" quebravam uma palavra por linha. A classe `quick-card` esperava ícone, texto e seta, mas recebia só texto. | Início | Corrigido: novo `quick-tile` com ícone, título e descrição |
| A rolagem não voltava ao topo ao trocar de rota. A Biblioteca abria no meio da página. | Todas | Corrigido no shell (`scrollTo` por rota) |
| O `input type=file` nativo aparecia sem estilo ("Escolher arquivo / Nenhum arquivo escolhido"). | Biblioteca, Agenda, Perfil | Corrigido: `.file-button` cobre o rótulo com o input invisível, que continua focável e clicável |
| O seletor "Você está em" e o aviso de visitante ocupavam a primeira dobra de **todas** as páginas, e o título da página ficava abaixo da dobra no celular. | Todas | Corrigido: o seletor foi para a barra superior (mobile) e para o trilho lateral (desktop); o aviso aparece só no Início e pode ser dispensado |
| No desktop, as opções secundárias (Indicações, Histórico, Clubes, Aparência) só abriam por um menu escondido no rodapé do trilho. | Desktop | Corrigido: seção "Explorar" sempre visível no trilho |

### P1 — identidade e hierarquia

- **Tipografia de sistema** (Trebuchet/Georgia), sem personalidade editorial e com escala tipográfica inconsistente entre as telas. Substituída por Fraunces e Plus Jakarta Sans, com escala de tokens.
- **Paleta restrita a roxo e dourado**, com muito cinza-bege. Agora há uma paleta expressiva (roxo, coral, amarelo, menta, azul, rosa, creme) aplicada por papel semântico.
- **Cartões iguais em todas as telas**: mesmo raio, mesma sombra e mesmo peso. Agora existem variações intencionais (destaque de leitura, ledger de números, ficha de data, cédula de indicação, linha do tempo, faixa de convite).
- **Números em três cartões idênticos** no Início. Viraram um "ledger" editorial com numerais em Fraunces.
- **Estados vazios genéricos**, só com texto. Ganharam uma pilha de livros ilustrada e uma chamada clara.
- **Livros sem capa**: só iniciais num gradiente. Agora cada livro tem uma capa tipográfica única, derivada do título, com lombada e faixa de cor.

### P2 — movimento e acabamento

- Não havia transição entre páginas, e o único movimento era a gaveta. Agora há entrada de página, cascata, capa que "abre", título revelado, curtida com "pop", gaveta com fundo animado e indicador ativo de navegação. Tudo respeita `prefers-reduced-motion`.
- O foco era visível só em parte dos controles. Agora há anel de foco único (`--focus-ring`) e "Pular para o conteúdo".
- A gaveta não fechava com Esc nem devolvia o foco. Corrigido.
- O botão de curtir era um `♡` textual, sem estado acessível. Agora tem `aria-pressed`, ícone e animação.

### P3 — ainda pendentes (fora do escopo desta etapa)

- **Biblioteca e leitor** estão sendo reescritos pelo Codex (`LibraryRoom` / `ReadingRoom` na branch `codex/plataforma-social`). Esta etapa só aplicou tokens a eles. O redesign visual completo entra depois da integração (ver `FRONTEND_BACKEND_INTEGRATION.md`).
- **Perfil e Aparência**: o Codex está alterando o `ProfileView`, então nesta etapa ele recebeu só tokens.
- **Rede social, mural do clube e notificações** ainda não existem no código. Os tokens de ambiente (`data-space="community"`) já estão prontos para eles.
- O aviso "Running in emulator mode" do Firebase cobre a navegação inferior **em desenvolvimento**. Ele não aparece em produção.

## Verificações desta etapa

- `npx tsc -b`: sem erros.
- `npx vitest run src`: 13/13 testes passam.
- `vite build`: concluído; CSS de 19,7 kB gzip, e fontes carregadas por `unicode-range` (só o subconjunto latino é baixado para texto em português).
- Contraste: todos os pares de texto principais passam em WCAG AA (tabela em `DESIGN_SYSTEM.md`).
