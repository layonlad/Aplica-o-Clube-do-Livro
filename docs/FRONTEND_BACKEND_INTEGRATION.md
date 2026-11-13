# Integração frontend ↔ backend (Claude Code ↔ Codex)

## Branches

| Agente | Branch | Local |
| --- | --- | --- |
| Claude Code (frontend, design) | `claude/redesign-visual` | worktree `../clube-do-livro-design` |
| Codex (backend, plataforma social) | `codex/plataforma-social` | worktree `/private/tmp/clube-livro-social` |

As duas partem de `main` em `bd94489`. **Nenhum arquivo de backend (`server/`) foi alterado nesta etapa.**

## O que esta etapa mudou

- **Novos:** `src/design/*.css`, `src/workspace/WorkspaceShell.tsx` e `docs/AUDITORIA_VISUAL.md`, `DESIGN_REFERENCES.md`, `DESIGN_SYSTEM.md` e este arquivo.
- **Alterados:** `src/main.tsx`, `src/app/ThemeProvider.tsx`, `src/components/ui.tsx`, `src/components/MobileShell.tsx`, `src/auth/AuthScreen.tsx`, `src/styles.css`, `src/workspace/workspace.css`, `src/connected/connected.css`, `src/workspace/WorkspaceApp.tsx`, `package.json` e `package-lock.json` (as duas fontes `@fontsource-variable/*`).

## Pontos de conflito previstos ao integrar com `codex/plataforma-social`

1. **`src/workspace/WorkspaceApp.tsx`**: as edições foram feitas de propósito **fora** dos trechos que o Codex altera:
   - Não mexemos em `LibraryView`, `ReaderView`, `Remove` nem nas linhas de `ProfileView` que tratam backup e preferências (o Codex substitui ou altera esses trechos).
   - O shell saiu do arquivo e foi para `WorkspaceShell.tsx`. O import novo fica junto do de `ConnectedApp`, longe do import `importBook`/`LibraryRoom` que o Codex muda.
   - Mudamos `HomeView`, `CalendarView`, `ForumView`, `Reply`, `NominationsView` e `HistoryView`, e os imports das linhas 2, 3 e 8.
   - Se o merge acusar conflito nos imports, mantenha a **união**: os imports do Codex (`LibraryRoom`, `ReadingRoom`, `importPhoto`) e os nossos (`WorkspaceShell`, `BookStack`, `CoverArt`, `Spines`, ícones).
2. **`package-lock.json`**: os dois lados alteraram. Resolva aceitando um dos lados e rodando `npm install`, o que regenera o lock com as dependências dos dois.
3. **CSS novo do Codex** (`library-room.css`, `reading-room.css`): ele usa `--color-primary`, `--color-muted`, `--color-border`, `--color-text`, `--color-surface` e `--color-soft`. Esses nomes continuam valendo como apelidos dos tokens novos, então as telas do Codex adotam a nova paleta e as fontes sem alteração.

## Recomendações ao Codex

- Nas telas novas, prefira os tokens semânticos (`--text-muted`, `--brand`, `--surface`, `--radius-card`, `--dur-*`) aos apelidos `--color-*`.
- Na biblioteca, considere `<CoverArt title author size="md" tilt />` como capa quando o livro não tiver imagem. Ele substitui `library-cover--typographic` e já é AA.
- Para o seletor de arquivo use `label.file-button > input[type=file]`; o estilo já cobre o input nativo.
- Para carregamento use `<SkeletonPage label="…"/>`. Evite deixar `role="status"` permanente na página, porque os testes usam `findByRole('status')` para confirmações.
- Os elementos sociais futuros (feed, curtidas, comentários) podem usar `.like-button[aria-pressed]`, `.avatar`, `.chip` e `data-space="community"`.

## Dependências de backend para as próximas etapas de UI

| Tela | Dado necessário | Situação |
| --- | --- | --- |
| Início | Nome de exibição para a saudação | Já existe: `user.displayName` ou o nome salvo no aparelho |
| Clubes | Capa ou cor do clube, descrição, leitura atual, próximo encontro, número de membros em `GET /clubs` | Não existe. Hoje vêm só `name` e `role`; os cartões de clube usam uma arte genérica |
| Comunidade | Feed, publicações com mídia, curtidas e seguidores | Em especificação pelo Codex (`docs/PLATAFORMA_SOCIAL_REQUISITOS.md`) |
| Perfil | Foto, biografia, estatísticas e conquistas | Não existe no contrato atual |
| Conversas | Avatar ou foto do autor | Não existe; usamos iniciais |

## Como rodar esta branch localmente

O Codex costuma manter o stack local (Postgres, emulador de Auth, API em `:3001`, Vite em `127.0.0.1:5173`) rodando a partir do worktree dele. Para não colidir, a branch de design roda em outra porta:

```bash
npx vite --host 127.0.0.1 --port 5180 --strictPort
```

Use um `.env.development.local` copiado de `.env.example`. **Não** use `.env.local`: o Vitest carrega esse arquivo, força o modo `connected` e quebra os testes do protótipo.
