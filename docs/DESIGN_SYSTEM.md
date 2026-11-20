# Design System — identidade "Coral"

Desde 17/11/2026 o app segue as seis referências enviadas pelo dono (Início, Biblioteca, Comunidade, Explorar, Clubes e a descrição do Perfil). O visual é de rede social mobile profissional:

- fundo branco;
- cabeçalho em gradiente coral → rosa;
- folha branca com cantos de 24px que sobe sobre o gradiente;
- cartões brancos arredondados com sombra suave;
- DM Sans na interface e Merriweather na leitura (desde 20/11/2026);
- um único acento coral para ação, seleção e progresso;
- ícones finos (lucide).

O nome comercial ainda não foi definido: nenhuma tela usa nome provisório como marca.

A identidade anterior ("Estante Rosa & Palha", com estante, papel e adesivos) foi aposentada. Os nomes antigos de cor (`--rosa-*`, `--palha-*`, `--plum-*`, `--coral-*`, `--cream-*`…) continuam existindo como apelidos da paleta nova, para telas antigas não quebrarem.

## Layout mobile forçado (desde 20/11/2026)

O app é sempre a coluna de celular, em qualquer tela:
- largura máxima de 430 px, centralizada sobre o fundo `#0f1115`;
- barra inferior fixa com 5 destinos, sem trilho lateral;
- nenhuma regra por largura de tela muda o layout. Só restam ajustes para celulares estreitos (abaixo de 430 px).

Tudo que fica preso à tela (barra inferior, botão +, folhas, avisos, leitor e animações) usa as bordas da coluna (`--frame-inset`, em `src/design/mobile-frame.css`).

Nas telas do clube, o cabeçalho é uma faixa escura (`--club-bar-bg`). As abas rolam com encaixe, e a cor de destaque aparece só no sublinhado da aba ativa. As telas principais mantêm o gradiente coral.

## Arquivos

| Arquivo | Conteúdo |
| --- | --- |
| `src/design/tokens.css` | Única fonte de verdade: paleta, tokens semânticos (original e escuro), gradiente do cabeçalho, tipografia, espaço, controles, forma, sombras, movimento e camadas |
| `src/design/base.css` | Elementos nativos, títulos, foco, utilitários. A estante só aparece com "Capa do livro como fundo" |
| `src/design/components.css` | Botões, campos de formulários antigos, busca, arquivo, pílulas, progresso, avatar, capa gerada, avisos, chips, curtir |
| `src/design/coral.css` | Kit da identidade: campos e seleções em qualquer tela, caixa de seleção e interruptor, cabeçalho em gradiente, barra das telas internas, seções, carrosséis, capas, cartões de leitura/clube/livro/coleção, destaques circulares, abas, linhas de configuração, amostras de cor, botão flutuante, menus de ação e as telas principais |
| `src/design/shell.css` | Barra inferior (5 destinos), trilho lateral do computador, subnavegação do clube |
| `src/components/sheet.css` | Folha inferior (celular) e janela (computador) usada por todos os menus, formulários e confirmações |
| `src/coral/kit.tsx` | `Hero`, `SheetBody`, `HeroIcon`, `HeroBell`, `HeroSearch`, `AppBar`, `SectionHead`, `BookCover`, `ago`, `compact` |
| `src/coral/pieces.tsx` | `ReadingCard`, `BookActions` (menu •••), `ClubArt`, `ClubTile`, `chapterLabel`, `useOpenBook` |
| `src/coral/data.ts` | Dados reais para as telas: `useMyClubs`, `useDiscoverClubs`, `useFollowingReaders`, `useCommunityPosts` |

## Cores

| Token | Valor | Uso |
| --- | --- | --- |
| `--accent` (`--coral-500`) | `#f25c3b` | Ícone ativo, barra de progresso, contornos, ponto de notificação (3,3:1, só para não texto) |
| `--brand` / `--brand-ink` (`--coral-600`) | `#d44425` | Botão cheio com texto branco, links e textos de ação (AA 4,5:1) |
| `--brand-soft` | `#ffe9e1` | Pílula selecionada, fundo de ícone |
| `--text` | `#18181c` | Títulos e texto |
| `--text-muted` | `#74747b` | Texto secundário (AA 4,6:1) |
| `--bg` / `--surface` | `#ffffff` | Fundo e cartões |
| `--bg-sunken` | `#f6f6f8` | Campos rebaixados, trilhas, estados vazios |
| `--hero-gradient` | `#ff7a4d → #f6604f → #ec5677 → #e05aa6` | Cabeçalhos, barras internas, capa do perfil, acesso |

O texto branco do cabeçalho segue a referência. Com "Contraste alto" ativo no sistema, o gradiente escurece para passar em AA.

## Tipografia

DM Sans (variável) na interface; Merriweather na leitura, nas citações e nas capas desenhadas. Escala resumida: `--type-title`, `--type-subtitle`, `--type-body` e `--type-caption`. Base de 15px (`--text-scale`), ajustável em Aparência.

| Token | Tamanho | Onde |
| --- | --- | --- |
| `--text-display` | 30px, peso 800 | Título do cabeçalho (Biblioteca, Explorar) |
| `.hero__title--sm` | 21px, 700 | Saudação, Comunidade, Clubes |
| `--text-h2` | 18px, 700 | Títulos de seção ("Continuar lendo") |
| `--text-h3` | 16px, 700 | Título de cartão |
| `--text-small` | 13,5px | Autor, meta, botões pequenos |
| `--text-caption` | 12px | Datas, contadores |
| `--text-nav` | 11px | Legenda da barra inferior |

O leitor de livros mantém fonte própria (Fraunces e opções do leitor).

## Botões

| Tipo | Classe | Aparência | Exemplos |
| --- | --- | --- | --- |
| Primário | `.button--primary`, `.pill-button--solid` | Coral cheio, texto branco | Aceitar, Publicar, Salvar, Entrar |
| Contorno | `.button--secondary`, `.pill-button` | Branco com borda coral 1,5px, texto coral | Continuar ▶, Recusar, Participar, Editar perfil |
| Discreto | `.button--ghost` | Sem fundo | Cancelar, itens de menu |
| Perigo | `.button--danger`, `.is-danger` | Vermelho suave | Excluir, Sair da conta |
| Redondo do cabeçalho | `.hero-icon` | Branco translúcido sobre o gradiente, 44px | Notificações, Pesquisar, Filtros, Criar |
| Mais opções | `.more-button` | ••• sem fundo, área de toque ampliada | Menus de livro e publicação |
| Flutuante | `.fab` | Círculo coral 58px com "+" | Perfil → Criar |

Estados de todos os botões:
- **Pressionado:** escala 0,95 e onda a partir do toque.
- **Selecionado:** `aria-pressed`/`aria-selected` com coral suave.
- **Carregando:** `aria-busy` mostra um anel girando e bloqueia novo toque.
- **Desabilitado:** opacidade 0,45.
- **Erro:** `.access-error`. **Sucesso:** `.toast-status`.

## Formulários

Todo `input`, `select` e `textarea` recebe o estilo base com especificidade zero:
- altura de 44px, raio de 12px e borda `--border-strong`;
- foco com anel coral;
- seta própria nos seletores;
- 16px no toque, para o iPhone não ampliar a tela.

Caixa de seleção e opção redonda são desenhadas em coral. O interruptor é `.toggle`. Rótulos ficam acima do campo (`.field`). Erro de validação usa `aria-invalid` com borda vermelha.

## Estrutura das telas

- **Telas principais** (Início, Explorar, Biblioteca, Comunidade, Clubes, Perfil): `Hero` + `SheetBody`. A barra inferior fica fixa.
- **Telas internas:** o shell coloca a `AppBar` (voltar, título, ação) e a folha branca. Dentro de um clube, aparece também a subnavegação em pílulas.
- **Leitor de livro:** sem gradiente e sem barra inferior. Só os painéis (sumário, aparência, marcadores) usam a folha e os campos do sistema.
- **Folhas e menus:** sempre `Sheet` com `.action-menu`.

## Aparência

Configurações → Aparência e personalização:
- **Tema:** Original, Claro, Escuro ou Sistema.
- **Fundo:** Branco, Creme, Sépia, Cinza, Preto ou cor personalizada.
- **Cor do texto:** Automática, Preto, Branco, Cinza, Sépia ou personalizada.
- **Cor de destaque,** fontes, tamanho, espaçamento e formatos.

A prévia é imediata. "Aplicar" salva na conta (`/me/appearance`, campo novo `textColor`). "Restaurar aparência original" volta ao padrão na hora.

Toda cor escolhida passa por `ensureContrast`, para manter o texto em AA sobre o fundo e as superfícies. Preferências salvas com o par de fontes da identidade anterior (Fraunces + Plus Jakarta) passam a usar Inter.
