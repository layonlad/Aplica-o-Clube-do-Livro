# Referências de design

## Pasta de inspirações

A pasta `Fotos e Inspiracoes/` (ao lado do repositório) estava **vazia** em 13/11/2026. Não havia nenhum arquivo para analisar. Quando ela receber imagens, vídeos ou capturas, este documento deve ganhar uma seção por referência, seguindo o roteiro abaixo.

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
