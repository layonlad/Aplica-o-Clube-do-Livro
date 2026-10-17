# Clube do Livro

Protótipo mobile-first de uma aplicação privada para clubes de leitura. Esta entrega implementa apenas a experiência de interface com dados locais simulados: nenhuma conta, API, banco, Firebase ou infraestrutura externa é utilizada.

## Executar localmente

Requisitos: Node.js 20 ou superior e npm.

```bash
npm ci
npm run dev
```

O Vite informará o endereço local. A entrada usa o convite demonstrativo já preenchido; clique em **Entrar na demonstração**.

## Verificações

```bash
npm test
npm run build
npm run preview
```

## Escopo do protótipo

- Entrada por convite e login demonstrativos.
- Início, biblioteca, leitor, indicações, sorteio documentado, agenda, fórum, histórico e perfil.
- Área administrativa e editor de identidade visual baseado em tokens.
- Navegação inferior mobile, layout adaptativo para desktop, manifesto e service worker de PWA.
- Dados simulados centralizados em `src/data/mockData.ts` e identificados na interface.

As decisões de arquitetura, permissões, modelo relacional, wireframes e backlog estão em [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md). Os requisitos de produto permanecem em [`docs/ESPECIFICACAO_PRODUTO.md`](docs/ESPECIFICACAO_PRODUTO.md).

Uma galeria de capturas reais da interface está disponível em [`docs/PREVIA.md`](docs/PREVIA.md), sem exigir servidor local ou deploy.

## Limites de segurança desta fase

- O estado de tema é guardado apenas no `localStorage` do navegador.
- As ações sociais e administrativas são simulações de interface.
- O trecho do leitor é fictício e não carrega nenhum EPUB real.
- Não existem credenciais, chaves privadas ou configuração Firebase.
- Não existe deploy nem conexão com PostgreSQL.
