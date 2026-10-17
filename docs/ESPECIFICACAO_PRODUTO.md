# ESPECIFICAÇÃO — Clube do Livro

## REGRA INEGOCIÁVEL: ISOLAMENTO
Projeto autônomo no repositório `layonlad/Aplica-o-Clube-do-Livro`. Não reutilizar códigos, credenciais, domínios, infraestrutura, projetos Firebase, bases, pipelines ou recursos de outros aplicativos. Não tocar em nenhum outro repositório. Não fazer deploy ou provisionar recursos externos sem aprovação.

## VISÃO
Aplicativo privado, mobile-first, PWA instalável no primeiro estágio e preparado para embalagem Android/iOS posteriormente. Interface e identidade visual inteiramente personalizáveis pelo administrador (cores, tipografias, logo, capa, modos claro/escuro, elementos de home).

## INFRAESTRUTURA
Firebase **apenas** Authentication e Cloud Storage (EPUBs autorizados, capas, fotos dos encontros e avatares). Não usar Firestore, Realtime Database, Functions ou Hosting. Todos os dados estruturados (livros, membros, sorteios, eventos, comentários, progresso, avaliações, convites, temas) devem ficar em **PostgreSQL independente** e ser acessados exclusivamente por uma API backend dedicada. A escolha do provedor do PostgreSQL e da hospedagem ocorrerá depois. Validar tokens do Firebase Auth no servidor. Não usar chaves privadas no frontend. Fazer Storage privado com downloads autorizados via backend e URLs temporárias; bloquear URLs públicas duráveis.

## PERFIS
- Owner: administrador principal; gerencia membros, convites, expulsões, livros, configurações, moderação, eventos e sorteios; transferência de propriedade protegida.
- Admin delegado (opcional): permissões configuráveis, nunca remove o owner.
- Membro: indica títulos, lê, acompanha progresso, avalia ao concluir, publica em fórum e fotos de encontros.
- Usuário só acessa dados dos clubes em que é membro ativo. Convites com token aleatório, hash, vencimento, revogação e uso limitado. Remoção de membro revoga acesso imediatamente no backend e aos arquivos; remoção do clube não implica exclusão automática de conta Auth.

## TELAS
1. Entrada, login, convite e onboarding.
2. Início: livro do mês, progresso individual, próximos encontros e avisos.
3. Biblioteca e leitor EPUB: lista, capa, metadados, arquivo, ajuste fonte/tamanho/tema, sumário, marcadores, retomada da posição e leitura responsiva.
4. Indicações e sorteio: um livro por membro por rodada (padrão ajustável), prazo, lista de indicados, encerramento, resultado e trilha auditável.
5. Calendário: mês/lista, encontros, local/horário, RSVP e galeria de fotos por evento e data.
6. Fórum: tópicos, comentários encadeados, reações, marcação de spoilers, denúncia e moderação.
7. Histórico do clube: livros lidos desde a fundação, mês/ano, membro responsável pela escolha, modo de escolha, avaliações.
8. Perfil: avatar, livros e notas, evolução, preferências de leitura.
9. Admin: membros, convites, livros, sorteios, agenda, moderação, histórico, identidade visual.

Navegação inferior mobile: Início, Livros, Agenda, Fórum, Perfil; acesso administrativo protegido em área separada.

## REGRAS DE NEGÓCIO
- Um ciclo de leitura por clube e mês (alterável para intervalos personalizados futuramente), com livro, começo/fim e origem da escolha.
- Progresso por membro e ciclo, percentual 0–100, calculado a partir da posição do EPUB; opção de porcentagem manual para leitor de livro físico. Sincronizar posição entre dispositivos.
- Avaliação de 1 a 5 estrelas após 100% concluído; membro pode editar nota. Média do clube sem expor notas individuais se configurado como privado.
- Sorteio com geração aleatória segura executada no backend, candidatos elegíveis e resultado imutável/auditável; bloquear sorteio duplicado com transação. Repetir apenas com justificativa e registro.
- Histórico retroativo cadastrado pelo owner inclui membro que escolheu, sem falsamente atribuir sorteio.
- Fotos ligadas ao ID do evento; mostrar no dia correto segundo timezone do clube. Permitir excluir/moderar uploads.
- Editor de tema persistente: tokens de cores, fontes com licença, logos, banners, estilo de cartões; respeitar contraste e acessibilidade.
- Upload apenas de EPUBs cuja distribuição seja permitida por licença, domínio público ou autorização. Validar MIME/conteúdo/tamanho, sanitizar EPUB/HTML e textos do fórum, proteger contra XSS e abuso. Privacidade e LGPD.

## MODELO DE DADOS PROPOSTO (POSTGRESQL)
`users(firebase_uid, name, avatar_storage_path)`;
`clubs(id, name, description, owner_user_id, timezone)`;
`club_memberships(club_id, user_id, role, status)`;
`invites(id, club_id, email, token_hash, expires_at, max_uses, revoked_at)`;
`books(id, club_id, title, author, cover_storage_path, epub_storage_path, rights_status, uploaded_by)`;
`reading_cycles(id, club_id, book_id, year, month, start_at, end_at, chosen_by, selection_method)`;
`reading_progress(cycle_id, user_id, percent, epub_locator, finished_at)`;
`book_ratings(cycle_id, user_id, stars)`;
`draw_rounds(id, club_id, year, month, status, deadline, winner_nomination_id, audit)`;
`nominations(round_id, book_id, nominated_by)`;
`events(id, club_id, starts_at, title, location, description)`;
`event_attendees(event_id, user_id, rsvp)`;
`event_photos(id, event_id, uploaded_by, storage_path)`;
`forum_topics(id, club_id, created_by, title, body, spoiler)`;
`forum_posts(id, topic_id, parent_id, created_by, body)`;
`forum_reactions(post_id, user_id, kind)`;
`club_themes(club_id, tokens_json)`;
`audit_logs(club_id, actor_user_id, action, entity_type, entity_id, created_at)`.
Projetar indexes, constraints, FK, auditoria, proteção contra acesso cruzado por clube e retenção LGPD.

## STACK RECOMENDADA PARA AVALIAR
Frontend React + TypeScript + Vite + PWA, interface mobile e design tokens; leitor EPUB com biblioteca open-source licenciada, CFI e sanitização; backend Node/TypeScript, API autenticada com Firebase ID token e PostgreSQL via ORM/migrations. Preparar evolução futura com Capacitor sem adotar dependências nativas desnecessárias agora.

## FASES
1. Planejamento, decisões e wireframes.
2. Design system e protótipo mobile navegável com mocks locais, sem backend e sem deploy.
3. Backend e PostgreSQL separados, Firebase Auth e Storage, segurança e convites.
4. Biblioteca, leitor, progresso, notas e histórico.
5. Sorteios, agenda, fotos e fórum.
6. Testes E2E, acessibilidade, PWA, revisão de segurança, preparação lojas.

## CRITÉRIOS DE ACEITAÇÃO
Responsivo e instalável; acesso privado por convite; exclusão revoga acesso; EPUB retoma posição; progresso individual persistente; histórico vinculado ao responsável pela escolha; sorteio auditável e não duplicado; fotos na data correta; tema personalizável persistente; dados estruturados fora do Firebase; nenhuma mistura com outros projetos.

## INSTRUÇÃO INICIAL AO CODEX
Ler este documento antes de qualquer código. Verificar a estrutura do repositório e propor árvore de arquivos, arquitetura da API, fluxos de permissão, migrations, backlog e wireframes. Construir **somente a fase 2** como protótipo mobile-first com mocks locais explicitamente identificados, sem conectar Firebase, sem criar contas de serviço, sem banco real, sem deploy e sem acessar qualquer outro repositório. Commitar apenas neste repositório em branch de trabalho, mostrar relatório de arquivos alterados e testes. Se houver dúvida sobre infraestrutura, documentar a decisão e continuar sem provisionar recursos.
