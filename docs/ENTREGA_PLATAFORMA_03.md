# Entrega 03 — fórum estruturado e integração visual

Estado de desenvolvimento, sem publicação em produção. Integra o visual de `main` até `3ac56a7`, preservando biblioteca, leitor, permissões, mural e galeria. O shell, as fontes auto-hospedadas, os componentes e as páginas redesenhadas foram mantidos; as rotas privadas foram incorporadas à navegação existente.

## Fórum privado

- Tópicos e respostas em tabelas próprias, paginação por data/UUID, busca, associação a livro/capítulo e imagens privadas do autor, com validação de clube e titularidade.
- Spoilers são revelados explicitamente na interface. Respostas podem sinalizar spoilers individualmente.
- Proprietário, administrador e moderador podem fixar até cinco discussões, encerrar/reabrir e remover conteúdo. Autores editam seus próprios tópicos com versão esperada; ninguém pode editar o texto de outra pessoa.
- Discussões encerradas não aceitam respostas, inclusive pela API anterior. Respostas já publicadas continuam legíveis. Curtidas são idempotentes na nova rota.
- Remover a foto de um álbum não a exclui se ainda estiver vinculada a discussão ou outra publicação autorizada. Excluir o recurso revoga novas consultas pela respectiva referência.
- O caderno pessoal permanece no formato anterior, separado dos clubes e sem migração para o fórum compartilhado.

## Migração e compatibilidade

`007_structured_forum.sql` verifica autores/associações antes de copiar tópicos, respostas e curtidas dos snapshots dos clubes. Se precisar de reconciliação, a transação é revertida por inteiro e a fonte permanece intacta. IDs, textos, datas e vínculos válidos são preservados. Snapshots e checkpoints privados são mantidos para reconciliação; sua remoção posterior exige política e autorização próprias.

A API anterior de ações `topic.*` continua funcionando por um adaptador transacional que usa o fórum normalizado. Não há dual-write do histórico novo no JSONB. A projeção anterior permanece limitada aos limites antigos de 200 tópicos/100 respostas. O cliente novo solicita `?view=app`: recebe apenas o total, sem carregar o histórico do fórum junto de cada atualização da biblioteca.

Checkpoints detectam escritas de uma instância antiga durante rollout e aplicam diferenças de forma repetível: incorporam IDs novos, respostas e mudanças em curtidas sem sobrescrever edições novas; removem apenas tópicos retirados da fonte antiga, preservando tópicos criados exclusivamente no módulo novo. Uma colisão ou autoria inválida interrompe a reconciliação. A troca de instâncias pode exigir repetir uma tentativa na interface antiga; não fazer downgrade após aceitar conteúdo na estrutura nova.

`008_media_draft_index.sql` acrescenta o índice da recuperação de arquivos próprios ainda não publicados. A consulta é paginada, exige associação atual ao clube e nunca retorna arquivos de outro titular. A seleção reutiliza o objeto existente; uploads não publicados podem ser limpos depois de um dia.

## Sessão e rascunhos

Consultas são vinculadas ao UID e à confirmação de e-mail, sem desmontar o formulário a cada renovação do objeto da sessão. Um teste reproduziu e confirmou a correção da perda de texto/imagem durante renovação com o mesmo UID. A troca real de conta continua desmontando o espaço anterior e descartando respostas atrasadas. Uma sessão rejeitada antes de carregar a biblioteca oferece “Entrar novamente”, com saída explícita da sessão inválida.

## Validação

- 26 testes de interface/importação/leitura/sessão, 27 unitários da API (incluindo MP4 sintético), 29 integrações PostgreSQL e uma integração Auth Emulator/PostgreSQL passaram: 83 testes.
- Compilação da API e build conectado concluídos. As dependências de produção foram auditadas sem vulnerabilidades reportadas; existem avisos moderados nas ferramentas de desenvolvimento, sem bloqueio no critério `high` do CI.
- Integração de migração com dados legados preserva livro, progresso, tópico, resposta e curtida; notas pessoais não são incorporadas ao clube. A execução repetida é segura. O teste de autoria inválida confirma rollback até os marcadores 001/002 e preservação da fonte.
- Testes simulam gravações de API antiga após a migração, mantendo uma edição nova e um tópico criado apenas na estrutura nova. Cobrem também fixação/encerramento, resposta pela rota antiga, acesso às imagens e recuperação sem reenviar bytes.
- Navegador local confirmou tópico/resposta/curtida anteriores, total na página inicial, fixação, encerramento e reabertura. O envio de imagem pelo formulário criou um objeto local ativo; foi identificado o problema de rascunho na renovação e corrigido com regressão automatizada. A confirmação final de publicação com imagem após a correção ficou pendente porque o controle de cliques falhou e a revisão automática de permissão expirou. Não anunciar essa validação visual como concluída.

## Produção e pendências

Nada desta entrega foi migrado ou publicado em produção. O bucket previamente autorizado permanece privado, sem uploads de teste. O rollout futuro precisa de revisão/autorização, migrações até 008, privilégios mínimos nas novas tabelas e no checkpoint, segredos de storage no servidor, API e frontend, nesta ordem. O papel de runtime precisa de DELETE nas tabelas de likes/vínculos usadas pelas operações, sem conceder DELETE na auditoria.

Comunidade pública, perfis/bloqueios/denúncias, notificações, integrações de eventos/leituras, distribuição autorizada de obras, renderização completa EPUB e revisão final de operação/retenção seguem pendentes.
