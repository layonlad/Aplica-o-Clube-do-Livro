# Design System — "Estante Rosa & Palha"

Desde 15/11/2026 o app tem cara de clube do livro aconchegante, inspirado nas referências em `DESIGN_REFERENCES.md`. A estrutura de camadas é esta:

- **Fundo:** uma estante cheia de livros, fixa atrás de tudo.
- **Véu:** uma camada pastel rosa e palha por cima da estante, para o texto continuar legível.
- **Papel:** o conteúdo fica em folhas de papel de livro levemente amassado.

Laços, estrelas e flores aparecem como adesivos, sempre poucos. Títulos seguem em serifa editorial. O movimento é macio: a página nova entra como folha virada e o marcador da navegação desliza.

O sistema anterior, "Lombadas", continua vivo em dois pontos:
- a faixa de lombadas (`--spines`) segue como assinatura, agora em rosa e palha;
- os nomes antigos de cor viraram apelidos da paleta nova.

## Arquivos

| Arquivo | Conteúdo |
| --- | --- |
| `src/design/tokens.css` | Única fonte de verdade: paleta, tokens semânticos (claro e escuro), tipografia, espaço, forma, sombras, movimento, camadas e acentos por ambiente |
| `src/design/base.css` | Elementos nativos, escala de títulos, foco, seleção, utilitários (`.eyebrow`, `.t-display`, `.sr-only`) |
| `src/design/components.css` | Botões, campos, busca, arquivo, pílulas, progresso, avatar, capa gerada, lombadas, estados vazio e de carregamento, avisos, chips, ficha de data, curtir |
| `src/design/shell.css` | Barra superior, navegação inferior, gaveta, trilho lateral do desktop |
| `src/design/motion.css` | Keyframes em CSS, cascata, `prefers-reduced-motion` |
| `src/design/motion.ts` | Movimento com framer-motion: `pageTurn` (troca de rota), `cascade`/`riseIn`, `settle` (mola dos marcadores) |
| `src/design/ornaments.css` | Adesivos, fita (`.taped`), papel torto (`.paper-tilt`), borda rasgada (`.torn-edge`), xadrez (`.checker`), letra de adesivo (`.t-sticker`) |
| `src/app/ShelfBackdrop.tsx` | Estante fixa + véu, atrás de todas as telas |
| `src/components/Stickers.tsx` | `BowSticker`, `StarSticker`, `FlowerSticker`, `SparkleSticker` (sempre decorativos) |
| `src/assets/estante/` | Imagem da estante. Hoje: `estante-ilustrada.svg` (ilustração própria que se repete sem emenda) |
| `src/assets/papel/papel-amassado.svg` | Textura de papel amassado (filtro SVG, quase branca, aplicada com `multiply`) |
| `src/components/ui.tsx` | Componentes React: `Button`, `Card`, `CoverArt`, `BookStack`, `Spines`, `SkeletonPage`, `ProgressBar`… |
| `src/workspace/workspace.css`, `src/connected/connected.css` | Composição específica de cada tela, usando só tokens |
| `src/styles.css` | Telas do protótipo de demonstração (legado), já apontando para os tokens |

**Regra:** componentes não usam hex, px de cor ou duração soltos. Use um token. Se faltar um, crie-o em `tokens.css` e documente-o aqui.

## Cor

### Paleta base

| Família | Tons | Uso principal |
| --- | --- | --- |
| Rosa (`--rosa-*`) | 50 → 950; **700 `#9A4167`** é a marca; 400 `#E897B4` é o acento; 300 `#F2B7CC` pastel | Marca, botões, links, adesivos, preenchimentos |
| Palha (`--palha-*`) | 50 → 700; **100 `#FBF5E6`** é o fundo; 700 para texto | Fundos, papel, madeira da estante, aviso |
| Vinho (`--vinho-*`) | 500, 600 (texto), 700 (perigo) | Detalhes: fitas, estrelas, xadrez, acento como texto |
| Cacau (`--cacau-*`) | 900, 700, 600, 400 | Texto |
| Sálvia (`--salvia-*`) | 100, 300, 700, 800 | Clubes, sucesso |
| Lilás (`--lilas-*`) | 100, 300, 500, 700 | Informação |

**Nomes antigos:** `--plum-*`, `--coral-*`, `--cream-*`, `--mint-*`, `--honey-*`, `--blue-*`, `--rose-*` e `--ink-*` continuam valendo, mas apontam para a paleta nova (por exemplo, `--plum-700` → `--rosa-700`). Em código novo, use os semânticos.

### Estante, véu e papel

| Token | Onde | Para quê |
| --- | --- | --- |
| `--shelf-image`, `--shelf-size`, `--shelf-repeat` | `base.css` | Imagem da estante. Para usar uma foto: `url(foto)`, `cover`, `no-repeat` |
| `--shelf-blur` | `tokens.css` | Desfoque da estante (profundidade) |
| `--veil-color`, `--veil-tint`, `--veil-strength`, `--veil-center` | `tokens.css` | Véu pastel por cima da estante; o centro é mais denso, onde fica o texto |
| `--paper` | `base.css` | Textura de papel. `:root[data-paper='off']` desliga |
| `--shadow-paper` | `tokens.css` | Sombra curta e assimétrica de folha apoiada |

Superfície de papel: `background-color: var(--surface); background-image: var(--paper); background-size: 560px; background-blend-mode: multiply;` (ou a classe `.paper`). Já vem em `.card`, `.notice`, trilho, gaveta, navegação inferior e cartões de entrada. Telas que não sobrepõem a estante (leitor) mantêm fundo próprio e opaco.

### Tokens semânticos

`--bg`, `--bg-sunken`, `--surface`, `--surface-raised`, `--surface-tint`, `--text`, `--text-muted`, `--text-subtle`, `--text-on-brand`, `--border`, `--border-strong`, `--divider`, `--brand`, `--brand-hover`, `--brand-soft`, `--brand-ink`, `--accent`, `--accent-soft`, `--accent-ink`, `--success*`, `--warning*`, `--danger*`, `--info*`, `--focus-ring`, `--overlay`.

O tema escuro é ativado com `:root[data-theme='dark']`, que o `ThemeProvider` define. Ele redefine os mesmos nomes; os componentes não mudam.

**Compatibilidade:** os nomes antigos (`--color-primary`, `--color-muted`, `--color-soft`…) continuam existindo como apelidos. As telas novas do Codex (`LibraryRoom`, `ReadingRoom`) herdam a paleta sem nenhuma alteração.

### Ambientes

O shell define `data-space` conforme a rota e o escopo. Isso muda só `--space-accent*` (sobrelinha, indicador ativo da navegação):

| `data-space` | Quando | Acento |
| --- | --- | --- |
| `personal` | Espaço pessoal (Início, Agenda, Caderno…) | Rosa-chiclete |
| `library` | Biblioteca, Leitor e Histórico | Rosa-framboesa |
| `club` | Qualquer tela dentro de um clube; área de clubes | Sálvia |
| `community` | Comunidade, Explorar, perfis | Palha |

### Contraste (WCAG 2.2 AA)

| Par | Razão |
| --- | --- |
| Texto cacau `#3A2228` sobre palha `#FBF5E6` | 13,4 |
| Texto secundário `#6C4D54` sobre palha | 6,8 |
| Texto sutil `#7C5D63` sobre palha-200 `#F5EBD0` | ≥ 4,5 |
| Rosa-framboesa `#9A4167` (link) sobre palha | 5,8 |
| Branco sobre rosa-framboesa (botão) | 6,3 |
| Vinho-600 `#A32A40` (acento como texto) sobre palha | 6,5 |
| Cacau sobre rosa-chiclete (botão de acento) | 6,6 |
| Sálvia-700, palha-700, lilás-700 sobre palha | 5,6 / 5,4 / 6,6 |
| Escuro: texto `#F8EEDC` sobre `#1E1417` | 15,6 |
| Escuro: rosa-300 sobre fundo; rosa-950 sobre rosa-300 | 10,6 / 9,8 |

Rosa 300/400/500, palha 300/400, sálvia 300 e lilás 300 **nunca** são cor de texto sobre fundo claro. Texto sobre um preenchimento de marca usa `--text-on-brand` (branco no claro, rosa-950 no escuro), nunca `white` fixo.

Sobre a estante, o texto fica sempre em papel ou com o véu por trás. Texto pequeno não vai direto sobre a imagem.

## Tipografia

- **Fraunces Variable** (eixos `opsz` e `wght`, mais o itálico): títulos, numerais, capas, citações e saudação. O tamanho óptico ajusta o desenho automaticamente ao tamanho do texto.
- **Plus Jakarta Sans Variable** (`wght`): interface e textos corridos.
- As duas são auto-hospedadas via `@fontsource-variable` (licença SIL OFL), sem requisição a terceiros. O `unicode-range` baixa só os subconjuntos usados.

Desde 15/11/2026 o tamanho-base é **15 px** (`--text-scale: 0.9375` × 16 px), e tudo é medido em `rem`. A pessoa pode trocar o tamanho-base em Aparência (Pequeno 14, Padrão 15, Grande 16, Maior 18 px), e o app inteiro acompanha. O tamanho de fonte do navegador continua sendo respeitado.

| Token | Valor | Uso |
| --- | --- | --- |
| `--text-display` | clamp(2rem → 3.6rem) | Título do Início |
| `--text-h1` | clamp(1.6rem → 2.5rem) | Título de página |
| `--text-h2` | clamp(1.3rem → 1.75rem) | Seções |
| `--text-h3` | 1.15rem | Títulos de cartão |
| `--text-h4` | 1.0333rem (Jakarta 700) | Subtítulos de interface |
| `--text-subtitle` | 1rem | Linha de apoio |
| `--text-body` | 1rem | Texto |
| `--text-small` | 0.875rem | Metadados, textos de ajuda |
| `--text-caption` | 0.78rem | Legendas |
| `--text-button` | 0.9rem, 700 | Botões |
| `--text-overline` | 0.72rem, 800, espaçamento 0.14em | Sobrelinhas (`.eyebrow`) |

**Campos de texto nunca ficam abaixo de 16 px em telas de toque** (regra em `base.css`), mesmo com o texto do app menor; abaixo disso o iPhone amplia a página ao focar. O leitor tem tipografia própria (`--font-reading`, `--reading-max: 66ch`) e controles independentes.

## Espaço, forma e profundidade

- **Espaço:** base de 4px × `--density` (`--space-1` a `--space-16`). `--density` = escolha da pessoa em Aparência (`--density-user`: compacto 0,88, padrão 1, amplo 1,12) × aperto automático no celular (`--density-screen`: 0,88 abaixo de 600 px). Margem lateral fluida `--gutter` (14px → 40px). Largura de conteúdo `--content-max: 1040px`.
- **Controles:** `--control-sm 34`, `--control-md 40`, `--control-lg 44` px de altura, e `--field-pad-y`/`--field-pad-x` nos campos. Acompanham só a densidade escolhida, nunca o aperto do celular, para o toque continuar confortável (44 px nos campos e ícones).
- **Formatos:** `--radius-card` (cartões), `--radius-button` (botões, pílulas de filtro) e `--radius-field` (campos) seguem as escolhas em Aparência → Formatos.
- **Raios:** `xs 6`, `sm 10`, `md 14`, `lg 20`, `xl 28`, `pill`, e `--radius-book` (3px na lombada, 10px na borda). `--radius-card` segue a preferência do usuário em Aparência.
- **Sombras:** `--shadow-1` (repouso), `--shadow-2` (hover), `--shadow-3` (flutuante: gaveta, navegação inferior, cartão de entrada) e `--shadow-book`. Todas quentes, tingidas de roxo, nunca cinza puro.
- **Camadas:** `--z-header 20`, `--z-nav 30`, `--z-drawer 100`, `--z-toast 200`.

## Breakpoints

| Largura | Comportamento |
| --- | --- |
| < 420px | Some o chip "Entrar" da barra (ele continua na gaveta) |
| ≥ 560px | Atalhos em duas colunas |
| ≥ 640px | Formulários em duas colunas (`.form-row`); remoção em linha nas indicações |
| ≥ 960px | Tela de entrada dividida com painel editorial |
| ≥ 1024px | Trilho lateral fixo (272px) substitui a barra superior e a navegação inferior |
| ≥ 1440px | Trilho com 296px |

## Movimento

| Token | Valor | Uso |
| --- | --- | --- |
| `--dur-instant` | 120ms | Pressionar (escala 0,97) |
| `--dur-fast` | 180ms | Hover e cor |
| `--dur-base` | 260ms | Componentes, indicador de navegação |
| `--dur-slow` | 380ms | Gaveta, cascata, curtida |
| `--dur-page` | 420ms | Entrada de página, capa que abre, título |
| `--ease-out` | cubic-bezier(.22,1,.36,1) | Padrão |
| `--ease-spring` | cubic-bezier(.34,1.56,.64,1) | Curtida, ícones de navegação, marca |
| `--ease-page` | cubic-bezier(.2,.8,.2,1) | Troca de rota |

**Movimentos editoriais:** `cover-open` (a capa gira sobre a lombada), `title-reveal` (o título sobe como uma linha impressa), `ribbon-drop` (marcador da navegação ativa), `spines-slide` (a faixa de lombadas entra) e a capa que inclina no hover (`CoverArt tilt`).

**Movimentos da estética Estante** (framer-motion, `src/design/motion.ts`):

| Movimento | Onde | Como |
| --- | --- | --- |
| `pageTurn` | Troca de rota (`.route-view` nos shells) | A página nova entra deslizando da direita e assenta (opacidade + `x`) |
| `layoutId="nav-pill"` + `settle` | Navegação inferior e trilho | O marcador do item ativo desliza de uma aba para a outra com mola |
| Estante | `ShelfBackdrop` | Entra com leve zoom ao abrir; desloca até 28px ao rolar (profundidade). Não se move com movimento reduzido |
| Adesivos | `.sticker--float` | Laço e estrela balançam devagar; a flor gira; o brilho pisca |
| Cartão interativo | `.card--interactive:hover` | Sobe 3px e inclina 0,4° (papel na mão) |

**Regras:**
- Anime só `transform` e `opacity`. A exceção é `clip-path` no título.
- Nada de reprodução automática.
- Com `prefers-reduced-motion: reduce`, o CSS zera animações e transições, e o `MotionConfig reducedMotion="user"` (em `main.tsx`) faz o framer-motion pular o movimento.
- Não deixe `transform` permanente em contêineres de página: ele prende elementos `position: fixed` dentro deles. As variantes terminam em `transform: none`.

## Componentes

| Componente | Classe ou API | Notas |
| --- | --- | --- |
| Botão | `<Button variant="primary\|secondary\|ghost\|danger\|accent">` | Formato pílula, 44px mínimo, pressão com escala |
| CTA em link | `.button-link` | Para navegação com aparência de ação |
| Link de texto | `.text-link` com seta | A seta desliza no hover |
| Cartão | `.card`, `--raised`, `--flat`, `--tint`, `--interactive` | Varie a superfície conforme a função; não use o mesmo cartão em tudo |
| Campos | `.workspace-form`, `.access-form`, `.input` | Hover e foco com halo da marca |
| Busca | `.search-field` com ícone | Foco no contêiner |
| Arquivo | `label.file-button > input[type=file]` | O input fica invisível sobre o rótulo; continua acessível |
| Filtros e abas | `.filter-pills` | Rolagem horizontal sem barra |
| Progresso | `<ProgressBar>` | `aria-label`, valor limitado a 0–100, cresce ao entrar |
| Capa gerada | `<CoverArt title author size tilt>` | 8 combinações AA escolhidas por hash do título |
| Pilha de livros | `<BookStack>` | Ilustração dos estados vazios |
| Lombadas | `<Spines>` / `--spines` | Assinatura visual; use no máximo uma vez por bloco |
| Carregamento | `<SkeletonPage label>` | `role="status"` só enquanto carrega |
| Aviso | `.notice`, `.access-error`, `.toast-status` | Informação, erro e confirmação |
| Chip | `.chip`, `--accent`, `--success`, `--warning` | Rótulos curtos (ex.: Spoiler) |
| Ficha de data | `.date-tile`, `--past` | Agenda e Início |
| Curtir | `.like-button[aria-pressed]` | Coração com "pop" |
| Gaveta | `.drawer-layer > .drawer` | Esc fecha, foco entra no botão de fechar e volta ao gatilho |

## Ícones

Lucide (já era dependência), traço 1,9 a 2,2, tamanhos 14–22px, sempre com `aria-hidden` quando há texto ao lado. Não use ícones como decoração repetida em todo cartão.

## Checklist para telas novas

1. Use os tokens semânticos, nunca a paleta base direto (exceto em capas e ilustrações).
2. Comece com `Intro` (sobrelinha, título e apoio) e no máximo uma ação primária.
3. Desenhe os estados vazio, carregando, erro, poucos itens, muitos itens e texto longo.
4. Teste em 375px e 1280px, nos temas claro e escuro, só com teclado e com movimento reduzido.
5. Se a cor transmite informação, ela precisa de um texto ou ícone junto.
