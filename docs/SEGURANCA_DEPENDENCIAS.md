# Auditoria de dependências

Verificado em **17/11/2026**. O CI bloqueia a entrega quando `npm audit --omit=dev --audit-level=high` encontra vulnerabilidades altas/críticas nas dependências de produção, ou quando a consulta falha. O relatório completo continua visível numa etapa informativa, com `continue-on-error: true`; isso não corrige nem oculta os avisos das ferramentas.

## Acompanhamento de picomatch

- [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf): ReDoS em padrões extglob, versões afetadas até 4.0.7. O advisory informa que não há versão corrigida.
- `npm view picomatch version` confirmou 4.0.7 como versão publicada mais recente. Não há override para uma versão corrigida disponível nesta verificação.
- `npm ls picomatch --all` identificou somente Vite, Vitest, tinyglobby e fdir. O lockfile marca esses pacotes como desenvolvimento; eles não integram o runtime de produção. O app não oferece um serviço de glob para entradas de usuários.
- `npm audit --omit=dev --audit-level=high` retornou zero vulnerabilidades. O relatório completo permanece com o aviso alto e os avisos transitivos de ferramentas já existentes.

O risco permanece para builds/testes/servidores de desenvolvimento que avaliem padrões maliciosos. Não expor servidores de desenvolvimento à internet nem encaminhar glob fornecido por usuário a essas ferramentas. O job de CI mantém somente `contents: read` e não recebe credenciais de publicação. A auditoria de produção permanece obrigatória para qualquer PR, inclusive se a ferramenta transitar futuramente para uma dependência de runtime.

Não foi usado `npm audit fix`, downgrade nem alteração do lockfile. A sugestão automática de instalar outra versão principal do Vite não constitui prova de correção e pode quebrar o projeto. Quando houver uma versão corrigida, atualizar de modo compatível, conferir as duas árvores e repetir testes/builds; então reavaliar o tratamento da auditoria de desenvolvimento. Novos avisos continuam aparecendo no relatório completo.

## Comandos de verificação

```sh
npm view picomatch version
npm ls picomatch --all
npm audit --omit=dev --audit-level=high
npm audit --audit-level=high
```

Os dois últimos comandos têm papéis distintos: o primeiro é bloqueante no CI; o segundo informa a situação completa. Falha conhecida no relatório completo não autoriza ignorar testes, build, imagem Docker, integração com PostgreSQL ou Auth Emulator.
