# Referências de design

## Pasta de inspirações

A pasta `Fotos e Inspiracoes/` fica ao lado do repositório. Ela estava vazia em 13/11/2026. Em 15/11/2026 recebeu as quatro capturas da nova direção, descritas logo abaixo. Cada referência nova ganha uma seção, seguindo o roteiro.

## Nova direção — "Estante Rosa & Palha" (15/11/2026)

O dono enviou quatro capturas de clubes do livro no Instagram, TikTok e Pinterest e pediu quatro coisas para o app inteiro:
- um fundo fixo de estante cheia de livros;
- cores pastel puxadas para o rosa e o palha;
- uma textura de folha de livro um pouco amassada;
- movimento.

Os arquivos estão salvos em `Fotos e Inspiracoes/`, com nomes `01-…` a `04-…`. Nenhuma marca, logo ou arte de terceiros foi copiada.

| Referência | O que mostra | O que aproveitamos |
| --- | --- | --- |
| 01 · "Apps para ler ou começar" (Laço de Cetim) | Fundo branco-perolado, letra arredondada e gorda em rosa-chiclete, laço de cetim em aquarela, florzinhas e brilhos | Letra de "adesivo" (Fredoka) só em selos e rótulos curtos; adesivos de laço, estrela e flor em SVG, usados com parcimônia |
| 02 · "Encha seu Kindle!" | Xadrez ondulado vermelho e rosa, pasta de papel kraft com clipe e fita, estrelas de veludo, objetos rosa em recorte | Vinho como cor de detalhe (fitas, estrelas); cartões como papel com clipe ou fita; leve rotação nos "papéis soltos" |
| 03 · "Se junte ao nosso Clube do Livro" | Papel rosa amassado, borda de papel rasgado sobre papel quadriculado, serifa editorial alta, livro aberto em P&B | Textura de papel amassado nas superfícies; borda rasgada em cabeçalhos; manter Fraunces nos títulos |
| 04 · Pinterest "clube do livro" | Pôsteres de clube do livro: cartões-postais, bingo literário em vinho e rosa, cerejas e laços, estantes de livraria | Fundo de estante; cartões-postais como modelo de cartão; rosa e vinho sobre palha |

**Paleta resultante** (detalhes em `DESIGN_SYSTEM.md`):

| Papel | Cor |
| --- | --- |
| Fundo | palha `#FBF5E6` |
| Papel | `#FFFCF4` |
| Rosa pastel | `#F2B7CC` |
| Rosa-chiclete | `#E897B4` (acento) |
| Rosa-framboesa | `#9A4167` (marca, botões, links) |
| Vinho | `#A32A40` (detalhes) |
| Cacau | `#3A2228` (texto) |
| Apoio | sálvia e lilás pastel |

**Estante:** a foto definitiva vai ser enviada pelo dono. Até lá, o app usa uma ilustração própria em SVG (`src/assets/estante/estante-ilustrada.svg`), que se repete sem emenda nas mesmas cores. A foto não cobre a ilustração: ela continua como reserva.

Roteiro por referência: estilo, cores predominantes, hierarquia tipográfica, distribuição, animações, transições, navegação, uso de imagem e vídeo, qualidade das microinterações e o que aproveitar. Use as referências como inspiração, sem copiar layout, marca ou identidade de terceiros.

## Direção inicial enviada

- **Tipografia:** Fraunces nos títulos e Plus Jakarta Sans na interface e nos textos.
- **Base de cor:** Roxo `#462B70`, Coral `#FC7667`, Creme `#F7EBD8` e Menta `#B9E6C9`.
- **Recomendação técnica:** branches ou worktrees separados para Claude (frontend) e Codex (backend).

Tudo isso foi adotado. A paleta foi ampliada com amarelo quente, azul intenso e rosa, que o briefing pedia, e ganhou tons de texto escurecidos para cumprir AA (ver `DESIGN_SYSTEM.md`).

## Pinterest — "livros de romance aesthetic"

Link enviado: busca no Pinterest Brasil. A página exige login para rolar. Só a primeira grade ficou visível atrás do modal, e a análise se limita a ela. Nenhuma imagem foi baixada ou reutilizada.

| Aspecto | Observação | Como entrou no produto |
| --- | --- | --- |
| Estilo | Fotografia de estilo de vida: estantes de livraria, pilhas de livros, livros em forma de coração sobre linho, capas ilustradas | Clima acolhedor e tátil, sem fotos de banco |
| Cores | Lombadas saturadas em tons pastel (rosa, coral, amarelo-manteiga, menta, azul-céu) sobre fundos creme e linho; luz natural quente | Paleta expressiva sobre base creme; rosa `#F5B6C6` incluído |
| Composição | Ritmo de lombadas lado a lado e pilhas em degrau; grade em mosaico | **Motivo "Lombadas"**: faixa de cores em ritmo (`--spines`), usada na marca, no cabeçalho, no trilho, no sorteio e no painel de entrada |
| Tipografia | Capas com letras manuscritas e serifas expressivas | Fraunces (serifa com eixo óptico) nos títulos; itálico para citações e saudação |
| Navegação | Filtros em pílulas ("Frases", "Wallpaper"…) | Pílulas de filtro arredondadas com estado ativo preenchido |
| Interação | Mosaico com descoberta visual | Pensado para o futuro feed da comunidade (ainda não implementado) |

**Conclusão:** a referência reforça o ritmo de cor das lombadas e o fundo quente, e isso virou a assinatura visual do app. A capa tipográfica gerada (`CoverArt`) traduz a ideia de "capa colorida" sem depender de imagens com direitos de terceiros.

## Conceitos de inspiração do briefing

- **Revista editorial:** títulos grandes em Fraunces, sobrelinhas em caixa alta com espaçamento, números em "ledger" com filete.
- **Livraria independente:** estante de lombadas no painel de entrada, capas com lombada e dobra.
- **App social moderno:** navegação inferior flutuante, curtida com animação, avatares com iniciais.
- **SaaS premium:** trilho lateral claro com seções, seletor de espaço sempre à mão, foco e estados consistentes.
