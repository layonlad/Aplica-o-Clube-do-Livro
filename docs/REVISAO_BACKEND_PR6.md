# Revisão do backend após os PRs #5 e #6

Data: 14/11/2026. Base revisada: `eb31b327529e091aa2c7466a1e0591916805320d`. Branch `codex/plataforma-social`, PR #2. Nenhuma publicação, migration, concessão de privilégios ou instalação de segredo em produção nesta etapa.

## Preservação e escopo

`git pull --ff-only` confirmou a branch atualizada. A árvore estava limpa antes da revisão; `ee21773` continua ancestral do HEAD, incluindo todo o trabalho anterior do Codex. Os quatro commits dos PRs #5/#6 estão presentes. Nenhum arquivo de frontend ou design system foi alterado nesta revisão.

Revistos os serviços de mídia, perfis, posts, fórum, membros, eventos, álbuns, aparência, rotas e modelo do espaço pessoal. Não há migrations novas nem mudança em `server/ops/runtime-grants.sql`.

## Problemas encontrados e ajustes mínimos

1. **Revogação da foto dependia de uma segunda transação.** `setAvatar` gravava a nova referência e a rota tentava `media.remove` depois do commit, ignorando falhas. Uma falha na revogação deixava a foto antiga ativa; se também houvesse referência em publicação pública, os bytes podiam continuar disponíveis. Agora `setAvatar` marca a anterior como `deleted` na mesma transação e retira a eventual referência da capa ao mesmo arquivo. A limpeza física continua posterior e recuperável pela manutenção. A foto revogada não pode ser reanexada. Um teste reproduziu o estado ativo antes da correção e agora confirma 404 mesmo antes da limpeza física.
2. **A aba de clubes verificava somente a associação do visitante.** O SQL agora exige também associação ativa do autor, para que a aba represente apenas clubes atualmente compartilhados, conforme o contrato da página. O mural interno original continua com seu comportamento anterior; nenhuma publicação histórica foi apagada. Teste cobre a saída do autor, além da remoção do visitante já testada pelo Claude.

## Privacidade e integração

- Upload de avatar dispensa perfil público, mas permanece atrás de autenticação com e-mail confirmado, processamento real de imagens, limite de tamanho, limitação de tentativas e cota de mídia de 50 MB. Não torna públicos outros uploads privados.
- Foto privada é entregue somente ao dono ou a colega ativo em clube comum, respeitando bloqueios simétricos. Foto de perfil explicitamente público segue pública. O cartão mínimo não expõe biografia, estante, e-mail ou clubes não compartilhados.
- Posts do perfil usam interseção SQL, paginação, estado de remoção e bloqueios. Referências `avatarId` nos DTOs são obtidas do perfil atual; a leitura dos bytes continua autorizada separadamente.
- Suspensão mantém `is_public=false`; trocar foto não reativa o perfil. Os testes confirmam a recusa de reativação pelo editor e de leitura por estranho.
- Aparência usa JSON validado e o mesmo lock de linha do espaço pessoal. Ações do espaço preservam `preferences.appearance`; persistência é isolada por usuário, sem alterar as configurações do leitor.
- O bucket privado existente atende aos avatares sem mudança de ACL, credencial, infraestrutura ou concessões SQL. Não houve PUT/GET no bucket real nesta etapa.

## Verificações locais

- Frontend: **41 aprovados**, 14 arquivos.
- API unitários: **28 aprovados**, 7 arquivos, incluindo FFmpeg/FFprobe reais.
- PostgreSQL: **58 aprovados**, 11 arquivos. Inclui quatro regressões adicionais: revogação atômica, saída do autor, bloqueios nas duas direções e cota/suspensão.
- Auth Emulator + PostgreSQL: **1 aprovado**, cobrindo cadastro/verificação/login/convite/remoção, revogação de sessão e conta desativada, somente em ambiente local.
- Total: **128 testes aprovados**, sem testes pulados.
- Builds do frontend demo e conectado e compilação da API: aprovados. O build conectado usa configuração fictícia de validação, sem deploy ou acesso ao backend de produção.
- Papel restrito: o teste cria um papel temporário local com exatamente os grants existentes; executa envio/troca/remoção de avatar, conteúdo/404 da foto antiga, GET/POST de aparência, cartão e posts de clubes, além dos fluxos anteriores. DDL, migrations, DELETE de usuários e UPDATE da auditoria continuam negados.
- Ensaio de schema: restauração dos 56 objetos da estrutura de produção capturada anteriormente (sem linhas reais), validação dos checksums 001/002, aplicação de 003–015 duas vezes, preservação de livro legado sintético e ação de progresso: aprovado, idempotente. PostgreSQL local 18; CI usa PostgreSQL 17.

Os logs locais e o resultado JSON do ensaio ficam em `.local-data/` ignorado pelo Git. O CI do commit final deve ser verificado no PR #2 antes de qualquer liberação. Este documento integra o próprio commit de revisão; seu hash final é o HEAD informado no PR e no resumo de entrega.

## Próxima decisão

Operações de produção continuam suspensas até aprovação explícita. O plano consolidado, incluindo as quatro famílias de rotas e seis operações HTTP novas, está em [LIBERACAO_PLATAFORMA_SOCIAL.md](LIBERACAO_PLATAFORMA_SOCIAL.md). A integração real com Storage e a recuperação em outro aparelho serão revalidadas no teste final autorizado; não se afirma que a versão nova já esteja em produção.
