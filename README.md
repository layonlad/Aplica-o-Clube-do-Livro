# Clube do Livro

Aplicação mobile-first para clubes de leitura. A versão 0.2 adiciona uma base funcional de autenticação, clubes, participantes e convites, com API Node.js/TypeScript, PostgreSQL independente e Firebase Authentication.

Há dois modos explícitos:

- **Conectado:** contas, confirmação de e-mail, clubes, convites e participantes com dados persistentes e autorização no servidor.
- **Demonstração:** protótipo completo de interface com dados fictícios. A [prévia pública no GitHub Pages](https://layonlad.github.io/Aplica-o-Clube-do-Livro/) permanece nesse modo.

Biblioteca, EPUB, progresso, sorteios, agenda, fotos e fórum ainda não possuem backend. Não são apresentados como funcionalidades prontas no modo conectado.

## Executar localmente

Requisitos: Node.js >= 24.12 e npm. O lançador local inclui PostgreSQL e emulador Firebase, sem exigir Docker ou conta de nuvem.

### Modo conectado

Siga o [guia do backend](docs/BACKEND.md), que inclui configuração local, uso do emulador Firebase, contrato HTTP, permissões e preparação para produção.

```bash
npm ci
npm run dev:local
```

Abra `http://localhost:5173`. O emulador imprime os links de confirmação de e-mail. Banco e contas locais são preservados em `.local-data/` ao encerrar com Ctrl+C. Para usar Compose ou um PostgreSQL já instalado, siga a opção de [serviços separados](docs/BACKEND.md#serviços-separados-com-compose).

### Demonstração

```bash
npm ci
VITE_APP_MODE=demo npm run dev
```

O Vite informará o endereço local. A entrada usa o convite demonstrativo já preenchido; clique em **Entrar na demonstração**.

## Verificações

```bash
npm run check
npm run test:integration
npm run test:e2e
npm audit
```

Os testes de integração usam PostgreSQL real temporário; `test:e2e` adiciona o Auth Emulator. O CI valida ambos os modos e a API. [Detalhes e limites das verificações](docs/BACKEND.md#verificações).

## Escopo da demonstração

- Entrada por convite e login demonstrativos.
- Início, biblioteca, leitor, indicações, sorteio documentado, agenda, fórum, histórico e perfil.
- Área administrativa e editor de identidade visual baseado em tokens.
- Navegação inferior mobile, layout adaptativo para desktop, manifesto e service worker de PWA.
- Dados simulados centralizados em `src/data/mockData.ts` e identificados na interface.

As decisões de arquitetura, permissões, modelo relacional, wireframes e backlog estão em [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md). Os requisitos de produto permanecem em [`docs/ESPECIFICACAO_PRODUTO.md`](docs/ESPECIFICACAO_PRODUTO.md).

Uma galeria de capturas reais da interface está disponível em [`docs/PREVIA.md`](docs/PREVIA.md), sem exigir servidor local ou deploy.

## Segurança e implantação

- Identidade validada por Firebase Admin; associação e papel conferidos no PostgreSQL em cada operação.
- Convites com segredo aleatório, somente hash no banco, vencimento, revogação e consumo transacional.
- Remoção de membro bloqueia imediatamente novas operações; não exclui a conta Firebase.
- Credenciais privadas somente no servidor, fora do repositório. Variáveis de frontend contêm apenas configuração pública.
- Cache privado desabilitado; service worker limitado ao modo demonstrativo.
- Hospedagem da API, PostgreSQL e projeto Firebase de produção ainda precisam ser definidos. [Procedimento de ativação](docs/BACKEND.md#ativação-em-produção).
