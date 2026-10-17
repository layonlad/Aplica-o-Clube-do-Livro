# Arquitetura proposta — Clube do Livro

## 1. Escopo desta entrega

Esta versão é um protótipo navegável da fase 2. Toda informação visível vem de `src/data/mockData.ts` ou de estado local efêmero. A personalização visual usa `localStorage` somente para demonstrar persistência no dispositivo. Não há autenticação, API, upload, EPUB real, Firebase, PostgreSQL ou deploy.

As interfaces antecipam regras futuras, mas não tentam simular segurança no cliente. Nenhuma ação da interface deve ser considerada autorização.

## 2. Organização do frontend

```text
.
├── public/
│   ├── icon.svg                 # ícone próprio e local
│   ├── manifest.webmanifest     # instalação PWA
│   └── sw.js                    # cache básico do app shell
├── src/
│   ├── app/
│   │   ├── App.tsx              # rotas públicas e privadas demonstrativas
│   │   └── ThemeProvider.tsx    # tokens editáveis e persistência local
│   ├── components/
│   │   ├── MobileShell.tsx      # cabeçalho, menu e navegação inferior
│   │   └── ui.tsx               # componentes de apresentação reutilizáveis
│   ├── data/mockData.ts         # única fonte dos dados de demonstração
│   ├── pages/                   # uma unidade por tela/fluxo
│   ├── test/                    # configuração e testes básicos
│   ├── types/domain.ts          # contratos do domínio usados pela interface
│   ├── main.tsx                 # composição e registro do service worker
│   └── styles.css               # design tokens e estilos mobile-first
├── docs/
│   ├── ARQUITETURA.md
│   └── ESPECIFICACAO_PRODUTO.md
└── package.json
```

Quando o produto crescer, `components/ui.tsx` deve ser dividido por componente e cada domínio (`books`, `events`, `forum`) deve agrupar página, hooks, contratos de API e testes próprios. Isso não é necessário para o tamanho atual.

## 3. Navegação

O protótipo usa `HashRouter`, evitando a dependência de rewrites no primeiro empacotamento estático.

```text
Entrada (/)
└── Área do clube (/app)
    ├── Início                 [barra inferior]
    ├── Biblioteca            [barra inferior]
    │   └── Leitor
    ├── Agenda                [barra inferior]
    ├── Fórum                 [barra inferior]
    ├── Perfil                [barra inferior]
    └── Menu adicional
        ├── Indicações e sorteio
        ├── Histórico
        ├── Administração     [owner/admin autorizado]
        └── Identidade visual [owner/admin autorizado]
```

No backend, o clube selecionado fará parte do contexto da sessão. Trocar a URL nunca poderá trocar a autorização.

## 4. Design system

Tokens principais: `primary`, `accent`, `surface`, `mode`, `font`, `radius`, `clubName` e `monogram`. O `ThemeProvider` converte esses valores em variáveis CSS, evitando cores e tipografia de marca espalhadas nos componentes.

Princípios:

- área de toque mínima de 44 px;
- contraste entre texto, superfície e ação principal;
- foco visível e semântica HTML;
- suporte a redução de movimento;
- navegação inferior com cinco destinos no celular;
- menu lateral persistente em telas amplas;
- ativos locais para funcionamento offline e privacidade.

No produto final, temas validados serão persistidos em `club_themes.tokens_json`. Logo e banner serão caminhos privados do Storage, entregues por URL temporária.

## 5. Arquitetura futura da API

Proposta: monólito modular Node.js/TypeScript inicialmente, exposto como API HTTP. Ele é mais simples de operar que microsserviços e preserva fronteiras claras para separação futura.

```text
PWA / futuro Capacitor
        │ Firebase ID token
        ▼
API Node.js + TypeScript
├── auth           valida token e resolve usuário local
├── clubs          contexto, associação e papéis
├── invitations    tokens com hash, prazo e limite de uso
├── library        metadados e autorização de arquivo
├── reading        ciclos, locators, progresso e avaliações
├── draws          indicações, transação e trilha auditável
├── events         agenda, RSVP e vínculo de fotos
├── forum          tópicos, respostas, reações e moderação
├── themes         tokens e ativos da identidade visual
└── audit          eventos de segurança e administração
        │                         │
        ▼                         ▼
PostgreSQL independente      Firebase Storage privado
(todos os dados estruturados) (EPUB/capa/foto/avatar)
```

Firebase Authentication emite identidade; a API valida assinatura, emissor, audiência e expiração do ID token. O `firebase_uid` é mapeado para `users`, mas nunca substitui a checagem de associação ativa ao clube.

Downloads seguem o fluxo: cliente solicita arquivo à API → API valida associação e licença → API emite URL temporária curta do Storage. Caminhos públicos duráveis são proibidos.

## 6. Permissões

| Ação | Membro | Admin delegado | Owner |
| --- | --- | --- | --- |
| Ver clube, ler arquivo autorizado e atualizar progresso | sim | sim | sim |
| Indicar, avaliar, comentar, reagir e confirmar presença | sim | sim | sim |
| Criar encontros ou moderar conteúdo | não | conforme permissão | sim |
| Gerenciar livros, convites e histórico | não | conforme permissão | sim |
| Editar tema | não | conforme permissão | sim |
| Alterar permissões delegadas | não | não | sim |
| Remover owner ou transferir propriedade | não | nunca | fluxo protegido |

Cada operação deve executar, no servidor e na mesma transação quando aplicável:

1. validar token e resolver usuário;
2. carregar associação pelo par `(club_id, user_id)`;
3. exigir `status = active`;
4. aplicar função e permissões delegadas;
5. filtrar a entidade pelo mesmo `club_id`;
6. registrar ações sensíveis em `audit_logs`.

A remoção muda a associação imediatamente e invalida sessões/cache de autorização. Ela não apaga automaticamente a conta Firebase.

## 7. Modelo relacional e migrations

Além das tabelas da especificação, recomenda-se:

- IDs UUID gerados no servidor;
- `created_at`, `updated_at` e, quando necessário, `deleted_at`;
- `club_memberships` único por `(club_id, user_id)`;
- owner único por clube com índice parcial em associação ativa;
- `reading_cycles` único por `(club_id, year, month)` enquanto o ciclo mensal for a regra;
- `reading_progress` e `book_ratings` únicos por `(cycle_id, user_id)`;
- `nominations` única por `(round_id, nominated_by)`;
- `draw_rounds` único por `(club_id, year, month)` e fechamento transacional;
- `event_attendees` único por `(event_id, user_id)`;
- `forum_reactions` única por `(post_id, user_id, kind)`;
- `CHECK` para progresso 0–100, estrelas 1–5, papéis, estados e métodos de escolha;
- FKs compostas ou validação transacional que impeça referências entre clubes;
- índices por `club_id`, datas, status e chaves de listagem;
- `audit_logs` append-only, com retenção definida e dados mínimos necessários.

Ordem sugerida:

1. extensões permitidas, enums/domínios e `users`;
2. `clubs`, associações e permissões delegadas;
3. convites e auditoria;
4. livros, ciclos, progresso e avaliações;
5. rodadas, indicações e resultado;
6. eventos, RSVP e fotos;
7. fórum, reações, denúncias e moderação;
8. temas e preferências;
9. índices, políticas de retenção e testes de isolamento.

Mesmo com isolamento na aplicação, Row Level Security por `club_id` deve ser avaliada como defesa adicional. A API continuará sendo o único acesso público ao banco.

## 8. EPUB e segurança de conteúdo

O leitor real deve usar uma biblioteca auditada que suporte EPUB 3, CFI e licenciamento compatível. O backend valida tipo, assinatura ZIP, tamanho, estrutura, licença declarada e propriedade do clube. HTML, SVG e CSS internos exigem sanitização; scripts, navegação externa e recursos remotos devem ser bloqueados por padrão. O locator CFI e percentual são salvos, não o conteúdo do livro.

Textos do fórum devem ser tratados como texto ou sanitizados por allowlist rigorosa. Aplicar limites de tamanho e frequência, proteção contra XSS/CSRF, logs sem conteúdo sensível e fluxo de denúncia.

## 9. Wireframes de referência

```text
┌──────────────────────────┐
│ Clube / saudação      ☰  │
├──────────────────────────┤
│ [livro]  título e autor  │
│ ━━━━━━━  62%             │
│ [ continuar leitura ]    │
├──────────────────────────┤
│ próximo encontro         │
│ avisos / atalhos         │
├──────────────────────────┤
│ Início Livros Agenda ... │
└──────────────────────────┘

┌──────────────────────────┐
│ ← livro         capítulo │
│ ━━━━━━━━━━━              │
│                          │
│   texto EPUB responsivo  │
│   controles acessíveis   │
│                          │
├──────────────────────────┤
│ sumário  A− A+  tema     │
└──────────────────────────┘

┌──────────────────────────┐
│ Administração            │
├──────────────────────────┤
│ membros / convites       │
│ acervo / sorteios        │
│ agenda / moderação       │
│ identidade / regras      │
└──────────────────────────┘
```

## 10. Backlog por fase

### Próxima fase: fundações do backend

- fechar ADRs de provedor, ORM, framework HTTP e estratégia de migrations;
- criar API e PostgreSQL isolados com testes de autorização cruzada;
- integrar somente Firebase Auth e Storage de um projeto novo e exclusivo;
- implementar convites com token aleatório, hash, expiração e revogação;
- definir retenção, exportação e exclusão compatíveis com LGPD.

### Biblioteca e leitura

- pipeline seguro de upload e validação de direitos;
- URLs temporárias e cache protegido;
- leitor EPUB real, CFI, marcadores e sincronização;
- progresso manual para livro físico e avaliação após conclusão.

### Comunidade

- sorteio transacional e auditável;
- eventos por timezone, RSVP e galeria vinculada ao evento;
- fórum encadeado, spoilers, reações, denúncia e moderação.

### Qualidade e distribuição

- testes de contrato, integração, E2E e acessibilidade;
- estratégia offline sem armazenar conteúdo privado indevidamente;
- política CSP, observabilidade e revisão de segurança;
- avaliação de Capacitor, assinatura e requisitos das lojas.

## 11. Decisões adiadas conscientemente

Provedor PostgreSQL, hospedagem da API, projeto Firebase, domínio, CI/CD, biblioteca EPUB e empacotamento nativo dependem de avaliação e aprovação futuras. Nenhum deles foi criado ou conectado nesta entrega.
