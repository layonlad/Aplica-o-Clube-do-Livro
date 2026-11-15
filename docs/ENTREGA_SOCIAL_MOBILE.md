# Ajustes sociais para celular — revisão

Base: main após o PR #10 (`9579b11`). Foram preservados a identidade visual e o trabalho do Claude. Nenhuma alteração em produção, merge ou deploy nesta tarefa.

## Entrega

- Seletor de espaço com lista suspensa dentro da tela, nomes longos legíveis, teclado, Escape e clique externo. O cabeçalho mantém a altura da navegação móvel; botões e abas ajustam o texto sem sobreposição.
- Ações de curtir, comentar, compartilhar link e baixar com ícones compactos, alvos de toque de 44px e espaçamento. Opções secundárias em menus; download respeita a política do álbum e os direitos do titular.
- Comentários em painel modal: lista paginada, respostas, curtidas, moderação e campo fixo inferior. Foco contido, Escape/fechar/backdrop e ajuste à área disponível do teclado. Sem abrir automaticamente um formulário grande na publicação.
- Capas dos álbuns usam até três miniaturas privadas, empilhadas e inclinadas. Proprietário/administrador escolhe a imagem da frente pelo botão **Capa** sobre a foto. Escolha persistida por referência ao arquivo existente; remover a foto selecionada faz a pilha voltar às disponíveis.
- Compartilhar link não publica arquivos, legendas ou participantes privados. Publicar uma cópia na comunidade mantém confirmação explícita e validação no servidor.

## Capa do perfil: trabalho reaproveitado

O PR #10 do Claude já implementou upload dedicado, salvamento imediato, remoção e GIF convertido para WebP animado. Não foi refeito. Esta entrega complementa apenas o enquadramento responsivo das imagens completas. O navegador local enviou um GIF sintético, salvou e mostrou a capa depois de recarregar o perfil no celular.

A versão publicada continua `b64835d`, anterior ao PR #10. Os novos endpoints de capa dependem de publicar a API atualizada antes do frontend.

## Backend e liberação futura

Migration aditiva `016_album_covers.sql`: referência nullable entre álbum e uma foto daquele mesmo álbum, protegida por chave composta. Não apaga nem reescreve fotos existentes. A lista retorna miniaturas somente após autorização de associação ativa; escolha verifica papel, estado da mídia e versão do álbum. Não torna o bucket público.

Nova ação de capa e cópia pública testadas com o papel restrito. Uma trava de associação que exigia UPDATE em `album_media` foi substituída pelas travas já existentes de clube/álbum/mídia e pela integridade referencial. Não foram ampliados grants. A revogação de privilégios legados do PR #9 continua pendente de autorização em produção.

Antes de publicar: aprovação do PR e da operação em produção, cópia de recuperação atualizada, migrations/grants como proprietário, API primeiro e Firebase depois; teste sintético com limpeza autorizada. Nada disso foi executado nesta tarefa.

## Verificações

Frontend, API, integração PostgreSQL com papel restrito e Auth Emulator validados localmente. Ensaio da estrutura antiga sem linhas reais aplicou todas as migrations, inclusive a nova, duas vezes e preservou o fixture de leitura. CI deve ser conferido no hash final do PR.

Navegador local isolado com Auth Emulator, banco e arquivos sintéticos: seletor, escolha da foto de capa, postagem de comentário, fechamento por Escape e upload/reload da capa GIF. Viewport de 390px e documento de 390px, capa visível de 120px, sem exceções JavaScript. Desktop de 1440px também conferido. Não representa teste em aparelho físico nem com leitor de tela real.

As evidências usam somente conteúdo de teste. O mapa registra o estado real de produção e a pendência desta entrega.

## Evidências locais

[Seletor suspenso](evidence/social-mobile-selector.png), [álbuns com fotos](evidence/social-mobile-albums.png), [comentários](evidence/social-mobile-comments.png) e [capa GIF no perfil móvel](evidence/social-mobile-profile-cover.png). Todas as contas e imagens são sintéticas.

A conferência geométrica nas três barras de ações não encontrou sobreposição nem controles fora da largura de 390px. O ensaio de migration foi idempotente. Totais locais: 44 testes de frontend, 29 unitários de API com vídeo real, 61 de PostgreSQL e 1 Auth Emulator; builds aprovados.
