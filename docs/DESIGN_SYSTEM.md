# Design System — "Lombadas"

O conceito parte do ritmo de cor de uma estante: lombadas diferentes lado a lado. A base é creme e calma, porque a leitura vem primeiro. A cor aparece em faixas, capas e acentos de ambiente, nunca como ruído.

## Arquivos

| Arquivo | Conteúdo |
| --- | --- |
| `src/design/tokens.css` | Única fonte de verdade: paleta, tokens semânticos (claro e escuro), tipografia, espaço, forma, sombras, movimento, camadas e acentos por ambiente |
| `src/design/base.css` | Elementos nativos, escala de títulos, foco, seleção, utilitários (`.eyebrow`, `.t-display`, `.sr-only`) |
| `src/design/components.css` | Botões, campos, busca, arquivo, pílulas, progresso, avatar, capa gerada, lombadas, estados vazio e de carregamento, avisos, chips, ficha de data, curtir |
| `src/design/shell.css` | Barra superior, navegação inferior, gaveta, trilho lateral do desktop |
| `src/design/motion.css` | Keyframes, entrada de página, cascata, `prefers-reduced-motion` |
| `src/components/ui.tsx` | Componentes React: `Button`, `Card`, `CoverArt`, `BookStack`, `Spines`, `SkeletonPage`, `ProgressBar`… |
| `src/workspace/workspace.css`, `src/connected/connected.css` | Composição específica de cada tela, usando só tokens |
| `src/styles.css` | Telas do protótipo de demonstração (legado), já apontando para os tokens |

**Regra:** componentes não usam hex, px de cor ou duração soltos. Use um token. Se faltar um, crie-o em `tokens.css` e documente-o aqui.

## Cor

### Paleta base

| Família | Tons | Uso principal |
| --- | --- | --- |
| Roxo (`--plum-*`) | 950 → 100; **700 `#462B70`** é a marca | Marca, ações primárias, Biblioteca |
| Coral (`--coral-*`) | **500 `#FC7667`** para preenchimentos; 600 `#B83C30` para texto | Acento, ambiente pessoal, curtidas |
| Creme (`--cream-*`) | 50 → 400; **200 `#F7EBD8`** | Fundos e superfícies |
| Menta (`--mint-*`) | **300 `#B9E6C9`**; 700 e 800 para texto | Clubes, sucesso |
| Amarelo (`--honey-*`) | 500 `#F4B942`; 700 para texto | Destaques, sorteio, avaliações, futura Comunidade |
| Azul (`--blue-*`) | 500 `#3D6BE0`; 700 para texto | Informação, anel de foco |
| Rosa (`--rose-*`) | 300 `#F5B6C6` | Capas e lombadas |
| Tinta (`--ink-*`) | 900, 700, 600, 400 | Texto |

### Tokens semânticos

`--bg`, `--bg-sunken`, `--surface`, `--surface-raised`, `--surface-tint`, `--text`, `--text-muted`, `--text-subtle`, `--text-on-brand`, `--border`, `--border-strong`, `--divider`, `--brand`, `--brand-hover`, `--brand-soft`, `--brand-ink`, `--accent`, `--accent-soft`, `--accent-ink`, `--success*`, `--warning*`, `--danger*`, `--info*`, `--focus-ring`, `--overlay`.

O tema escuro é ativado com `:root[data-theme='dark']`, que o `ThemeProvider` define. Ele redefine os mesmos nomes; os componentes não mudam.

**Compatibilidade:** os nomes antigos (`--color-primary`, `--color-muted`, `--color-soft`…) continuam existindo como apelidos. As telas novas do Codex (`LibraryRoom`, `ReadingRoom`) herdam a paleta sem nenhuma alteração.

### Ambientes

O shell define `data-space` conforme a rota e o escopo. Isso muda só `--space-accent*` (sobrelinha, indicador ativo da navegação):

| `data-space` | Quando | Acento |
| --- | --- | --- |
| `personal` | Espaço pessoal (Início, Agenda, Caderno…) | Coral |
| `library` | Biblioteca, Leitor e Histórico | Roxo |
| `club` | Qualquer tela dentro de um clube; área de clubes | Menta |
| `community` | Reservado para a rede social | Amarelo |

### Contraste (WCAG 2.2 AA)

| Par | Razão |
| --- | --- |
| Texto `#22192E` sobre creme `#FBF4E8` | 15,4 |
| Texto secundário `#5F5569` sobre creme | 6,4 |
| Texto sutil/placeholder `#776C80` sobre branco | 4,95 |
| Branco sobre roxo (botão) | 11,4 |
| Coral-600 `#B83C30` sobre creme | 5,15 |
| Tinta sobre coral (botão de acento) | 6,8 |
| Menta-800 sobre menta-300 (faixa de clubes) | 5,7 |
| Escuro: texto `#F6EFE4` sobre `#17111F` | 16,2 |
| Escuro: roxo-300 sobre fundo | 8,4 |
| As 8 combinações de capa (`coverPalette`) | todas ≥ 5,7 |

Coral 500, menta 300, amarelo 500 e rosa 300 **nunca** são cor de texto sobre fundo claro. Para texto, use o tom 600, 700 ou 800 da mesma família.

## Tipografia

- **Fraunces Variable** (eixos `opsz` e `wght`, mais o itálico): títulos, numerais, capas, citações e saudação. O tamanho óptico ajusta o desenho automaticamente ao tamanho do texto.
- **Plus Jakarta Sans Variable** (`wght`): interface e textos corridos.
- As duas são auto-hospedadas via `@fontsource-variable` (licença SIL OFL), sem requisição a terceiros. O `unicode-range` baixa só os subconjuntos usados.

| Token | Valor | Uso |
| --- | --- | --- |
| `--text-display` | clamp(2.5rem → 4.5rem) | Título do Início |
| `--text-h1` | clamp(2rem → 3.1rem) | Título de página |
| `--text-h2` | clamp(1.45rem → 2rem) | Seções |
| `--text-h3` | 1.25rem | Títulos de cartão |
| `--text-h4` | 1.0625rem (Jakarta 700) | Subtítulos de interface |
| `--text-subtitle` | 1.0625rem | Linha de apoio |
| `--text-body` | 1rem | Texto |
| `--text-small` | 0.875rem | Metadados, botões pequenos |
| `--text-caption` | 0.75rem | Legendas |
| `--text-button` | 0.9375rem, 700 | Botões |
| `--text-overline` | 0.6875rem, 800, espaçamento 0.14em | Sobrelinhas (`.eyebrow`) |

Os campos usam 1rem para evitar o zoom automático do iOS. O leitor tem tipografia própria (`--font-reading`, `--reading-max: 66ch`) e controles independentes.

## Espaço, forma e profundidade

- **Espaço:** base de 4px (`--space-1` a `--space-16`). Margem lateral fluida `--gutter` (16px → 40px). Largura de conteúdo `--content-max: 1040px`.
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

**Regras:** animar só `transform` e `opacity` (a exceção é `clip-path` no título); nada de reprodução automática; com `prefers-reduced-motion: reduce`, toda animação e transição vira instantânea. Optamos por CSS puro, sem Motion ou GSAP, para não somar dependência nem JS ao carregamento inicial.

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
