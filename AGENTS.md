# Instruções para agentes (Codex, Claude Code e outros)

## Comece pelo mapa do projeto

Antes de qualquer tarefa, leia **`docs/mapa/mapa.json`**. É o cérebro compartilhado do projeto: estado atual, ambientes e versões no ar, serviços, onde ficam os dados dos usuários, fluxo de publicação, papéis e as últimas atualizações feitas por cada agente. As regras completas estão em [`docs/mapa/README.md`](docs/mapa/README.md).

Ao terminar uma tarefa pedida pelo dono:

1. Adicione uma entrada no **topo** de `atualizacoes` em `docs/mapa/mapa.json` e revise `estado`, `ambientes` e, se algo mudou, `camadas`, `dados`, `fluxoPublicacao` e `jornadas`.
2. Rode `npm run mapa:check` e `npm run mapa`; inclua a mudança do mapa no mesmo PR.
3. No resumo final para o dono, entregue o link do mapa: https://layonlad.github.io/Aplica-o-Clube-do-Livro/mapa/. Ele reflete `main` depois do merge.
4. Nunca coloque e-mails, senhas, chaves, tokens ou dados de usuários no mapa: o repositório e o GitHub Pages são públicos.

## Quem faz o quê

- **Codex:** backend, banco, API, autenticação, regras de negócio, segurança, infraestrutura e liberação em produção.
- **Claude Code:** frontend, design system (`docs/DESIGN_SYSTEM.md`), telas, animações, responsividade e acessibilidade. Faz ajustes pontuais no backend quando uma tela precisa.
- **Dono:** aprova merges e autoriza qualquer operação em produção ou que gere custo.

Cada agente trabalha na própria branch e pasta (worktree). Antes de editar arquivos do outro, confira a branch remota e a pasta dele para evitar sobrescrever trabalho em andamento.

## Staging e Produção

Inicie cada candidata com `npm run staging` e envie ao dono o link em `http://localhost:5174`, o ambiente e a versão. Staging é exclusivamente local. O dono pede a promoção depois de testar. Qualquer operação de produção segue essa aprovação.

O número em `release.json` começa em `1.0`. Prepare a próxima versão em Staging avançando um número à direita do ponto da versão publicada. Ajustes na mesma candidata usam o mesmo número. O build de produção confere a candidata e a sequência. O endereço usado até aqui permanece sendo Produção. Veja [Publicação](docs/PUBLICACAO.md).
