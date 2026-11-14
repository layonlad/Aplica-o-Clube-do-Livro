# Entrega 05 — encontros e integrações

Em desenvolvimento na branch de revisão, sem publicação.

A migração 011 normaliza os encontros e participantes. Preserva IDs, texto, data, autor, RSVP e fotos do calendário anterior; o JSON original permanece para reversão e compatibilidade. Álbuns passam a ter uma chave composta de encontro/clube. Um álbum de encontro anteriormente removido conserva uma referência arquivada, sem perder registros.

A API oferece calendário paginado por data, filtros de período, edição com versão, RSVP idempotente e presença registrada pela administração. Livros e discussões relacionados são validados no mesmo clube. Participantes removidos não entram nas contagens/listas atuais. Fotos antigas são carregadas somente ao abrir a seção correspondente. A tela nova envia registros à galeria, sem inserir novas imagens no JSON do calendário.

Clientes antigos seguem com os comandos de encontro e projeção limitada a 100 eventos próximos. Uma ponte reconcilia apenas mudanças no JSON legado e preserva os encontros criados no modelo novo. A tela atual usa a API paginada.

Notificações de encontros, lembretes nas próximas 24 horas (gerados ao consultar a central), livros adicionados e seleção de leitura coletiva revalidam os vínculos atuais. Não há e-mail nem push externo. Mudar/excluir encontro revoga lembretes antigos em novas consultas. Criação de álbum pelo calendário preenche e filtra o encontro correto.

Antes do último teste de migração e filtro de lembrete: 28 testes de frontend e 39 de integração passaram. Novos testes cobrem papéis, escopo, RSVP, presença, versão, paginação, álbum, exclusão, avisos de livro/leitura e cliente anterior. Continuação: EPUB original, fontes autorizadas, compartilhamento explícito de trecho, retenção, validação operacional e revisão final.
