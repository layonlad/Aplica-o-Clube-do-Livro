# Mapa do Projeto — o cérebro do Clube do Livro

**Link para o dono acompanhar:** https://layonlad.github.io/Aplica-o-Clube-do-Livro/mapa/

O mapa é uma página visual e responsiva. Mostra como o app funciona no ar, como uma mudança chega à produção, onde fica cada informação dos usuários, quem faz o quê e o histórico de atualizações. Claude Code e Codex leem este mapa antes de trabalhar e o atualizam ao terminar cada tarefa.

## Como ele é montado

| Parte | Quem mantém | Onde |
| --- | --- | --- |
| Estado atual, ambientes, serviços, onde ficam os dados, fluxo de publicação, caminhos de uso, papéis e **últimas atualizações** | Claude e Codex, à mão | `docs/mapa/mapa.json` |
| Telas, rotas da API, tabelas do banco, migrations, testes, automações do GitHub, nomes de configurações, tecnologias, documentos e commits recentes | **Automático**, lido do código a cada geração | `scripts/mapa/build.mjs` |
| Visual (layout, cores, responsividade, modo claro/escuro) | Claude | `docs/mapa/template.html` |

## Como ele se atualiza sozinho

- A cada push em `main`, o workflow **Publicar prévia no GitHub Pages** roda `node scripts/mapa/build.mjs --out dist/mapa`. Ele publica o mapa em `/mapa/`, junto com a prévia do app.
- O CI (**Validar aplicação e API**) roda `npm run mapa:check` dentro de `npm run check`. Um `mapa.json` inválido (camada inexistente, data fora de ordem, e-mail ou credencial) faz o PR falhar.
- A página avisa quando há commits mais novos que a última entrada em `atualizacoes`. Esse aviso indica que alguém esqueceu de registrar uma entrega.

## Regras para Claude e Codex

1. **Antes de começar** uma tarefa, leia `docs/mapa/mapa.json` (estado, pendências, últimas atualizações) para saber o que mudou desde a última vez.
2. **Ao terminar** uma tarefa pedida pelo dono:
   - adicione uma entrada **no topo** de `atualizacoes` (`data` AAAA-MM-DD, `autor`, `titulo`, `resumo` curto, `pr`);
   - revise `estado` (fase, resumo, próximo passo, pendências) e `ambientes`, principalmente as versões em produção depois de qualquer deploy;
   - se um serviço, um tipo de dado ou o fluxo de publicação mudou, atualize `camadas`, `dados`, `ligacoes`, `fluxoPublicacao` ou `jornadas`;
   - rode `npm run mapa` (gera `dist-mapa/index.html` para conferir) e `npm run mapa:check`;
   - inclua a mudança do mapa no mesmo PR da entrega.
3. **Entregue o link do mapa** ao dono no fim de cada tarefa: https://layonlad.github.io/Aplica-o-Clube-do-Livro/mapa/. O link reflete `main` depois do merge; antes disso, gere localmente e diga que a versão publicada atualiza após o merge.
4. **Nunca** coloque e-mails, senhas, chaves, tokens, URLs de banco ou dados de usuários no mapa. O repositório e o GitHub Pages são públicos. Nomes de configurações podem aparecer; valores, nunca.
5. Não copie à mão o que o gerador já lê do código (rotas, tabelas, telas, testes). Se faltar algum fato automático, melhore `scripts/mapa/build.mjs`.

## Comandos

```bash
npm run mapa        # gera dist-mapa/index.html e dist-mapa/mapa-dados.json
npm run mapa:check  # só valida docs/mapa/mapa.json
```

Para ver localmente, abra `dist-mapa/index.html` no navegador. Os dados ficam embutidos na página, então ela não precisa de servidor.
