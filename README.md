# Clube do Livro

Aplicação mobile-first para leitura individual e clubes. [Abrir aplicativo](https://project-acb850f4-4bb8-45de-a84.web.app). A entrada é livre, sem cadastro e sem exigir participação em clube.

Há dois modos explícitos:

- **Aplicativo:** biblioteca, leitor EPUB/TXT em texto, progresso, avaliações, histórico, agenda, fotos, anotações/fórum, indicações, sorteio, perfil e aparência. Visitantes salvam os registros neste navegador; contas confirmadas sincronizam o espaço pessoal com o servidor. Clubes têm espaço compartilhado com autorização por papel.
- **Demonstração:** protótipo completo de interface com dados fictícios. A [prévia pública no GitHub Pages](https://layonlad.github.io/Aplica-o-Clube-do-Livro/) permanece nesse modo.

Login é opcional para sincronizar; convite é necessário apenas para ingressar em um clube existente. O Perfil permite exportar/importar backups do espaço pessoal. Os espaços reais começam vazios. [Detalhes, permissões e limites](docs/BACKEND.md).

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
- Firebase Hosting/Auth, Render Free e Neon Free estão configurados. [Publicação e operação](docs/PUBLICACAO.md).
