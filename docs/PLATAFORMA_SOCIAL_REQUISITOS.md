# PROMPT MASTER — EVOLUÇÃO DA PLATAFORMA CLUBE DO LIVRO

## 1. PAPEL DA IA

Atue como um time sênior de desenvolvimento de software composto por:

- Arquiteto de Software
- Product Manager
- Desenvolvedor Full Stack
- Especialista em UX/UI
- Engenheiro de Banco de Dados
- Especialista em Segurança
- Engenheiro de QA
- Especialista em Sistemas Sociais e Comunidades

Sua missão é analisar a aplicação existente do Clube do Livro e implementar uma evolução estrutural, funcional e visual, transformando-a em uma plataforma social de leitura.

**IMPORTANTE:** não recrie o projeto do zero. Analise o código existente, preserve funcionalidades que já funcionam, respeite a arquitetura atual e implemente melhorias de forma modular, escalável e segura.

Antes de desenvolver, realize uma auditoria do repositório, identifique as dependências, a estrutura do banco de dados, os serviços existentes e as funcionalidades já implementadas.

---

# 2. VISÃO ESTRATÉGICA DO PRODUTO

A aplicação deverá funcionar por meio de três ambientes integrados:

### A. Ambiente Social Público
Uma rede social literária que conecta leitores de diferentes clubes.

### B. Ambiente Privado do Clube
Um espaço exclusivo para participantes de cada clube, com mural, fórum, encontros, leituras e atividades internas.

### C. Ambiente Pessoal de Leitura
Uma área individual para o usuário organizar sua biblioteca, importar arquivos EPUB, acompanhar leituras e acessar o leitor digital.

Esses três ambientes devem compartilhar a mesma identidade de usuário, mas manter separação clara de dados, permissões e privacidade.

---

# 3. REESTRUTURAÇÃO DA NAVEGAÇÃO

Criar uma navegação moderna, intuitiva e responsiva.

### Menu principal

1. Início
2. Comunidade
3. Meus Clubes
4. Biblioteca
5. Minha Leitura
6. Explorar
7. Notificações
8. Meu Perfil

Dentro de cada clube:

1. Visão Geral
2. Mural do Clube
3. Fórum
4. Leitura Atual
5. Calendário e Encontros
6. Galeria
7. Membros
8. Administração (somente usuários autorizados)

A navegação deve permitir alternar rapidamente entre o ambiente público, o clube privado e o ambiente pessoal.

---

# 4. REDE SOCIAL LITERÁRIA PÚBLICA

Criar um ambiente social no qual usuários de clubes diferentes possam interagir.

## 4.1 Feed público

Implementar um feed com publicações contendo:

- Textos e reflexões sobre livros.
- Fotografias.
- Vídeos curtos.
- Indicações literárias.
- Resenhas.
- Frases e citações de livros.
- Enquetes.
- Perguntas para a comunidade.
- Registros de encontros presenciais.
- Compartilhamento de metas e conquistas de leitura.

Cada publicação poderá apresentar:

- Nome e foto do autor.
- Clube associado, quando aplicável.
- Data da publicação.
- Conteúdo textual.
- Fotos ou vídeo.
- Livro relacionado.
- Curtidas.
- Comentários.
- Compartilhamentos internos.
- Opção de salvar.
- Menu para denunciar e excluir, conforme permissões.

## 4.2 Interações

Criar sistema de:

- Curtidas em publicações.
- Comentários e respostas.
- Menções a usuários.
- Hashtags literárias.
- Seguidores e usuários seguidos.
- Salvamento de publicações.
- Notificações de interações.

Impedir curtidas duplicadas e controlar alterações de conteúdo.

## 4.3 Explorar

Criar uma página de descoberta com:

- Livros populares.
- Publicações em destaque.
- Clubes públicos.
- Autores de conteúdo literário.
- Resenhas recentes.
- Discussões em alta.
- Recomendações de leitura.

Implementar pesquisa e filtros por título, autor, gênero, clube e tipo de publicação.

## 4.4 Perfil social

Cada usuário deverá ter um perfil contendo:

- Foto e imagem de capa.
- Nome e biografia.
- Gêneros literários favoritos.
- Livros lidos.
- Leituras atuais.
- Metas de leitura.
- Publicações públicas.
- Clubes visíveis.
- Seguidores e seguindo.
- Estatísticas literárias.

Oferecer controles individuais de privacidade.

---

# 5. AMBIENTE PRIVADO DOS CLUBES

Cada clube deverá funcionar como uma comunidade independente, com dados e permissões isolados.

Um usuário poderá participar de vários clubes utilizando a mesma conta.

## 5.1 Mural privado

Criar um mural exclusivo para os integrantes do clube.

Os participantes poderão publicar:

- Fotografias de encontros presenciais.
- Vídeos.
- Frases retiradas de livros.
- Reflexões sobre capítulos.
- Recomendações.
- Perguntas.
- Enquetes.
- Depoimentos.
- Comunicados.

Cada publicação deverá permitir curtidas, comentários, respostas e marcações.

O mural deve oferecer filtros por tipo de publicação e data.

**Regra fundamental:** nenhuma publicação privada poderá aparecer automaticamente no feed público.

## 5.2 Galeria de encontros presenciais

Criar uma galeria dedicada aos registros dos encontros.

Funcionalidades:

- Criar álbuns por encontro.
- Associar fotos a uma data.
- Adicionar título e descrição.
- Publicar várias fotografias.
- Visualizar imagens em tela cheia.
- Comentar e curtir fotos.
- Identificar participantes mediante consentimento.
- Baixar fotos, quando permitido.
- Definir quem poderá adicionar ou excluir arquivos.

Cada álbum deverá permanecer vinculado ao clube correto.

Implementar otimização de imagens, miniaturas e carregamento progressivo.

## 5.3 Fórum de discussões

Manter o fórum como um ambiente organizado por tópicos, separado do mural social.

Permitir:

- Criar tópicos.
- Responder discussões.
- Anexar imagens.
- Associar discussões a livros.
- Criar tópicos por capítulo.
- Fixar assuntos importantes.
- Identificar comentários com spoilers.
- Moderar conteúdo.
- Encerrar discussões quando necessário.

Criar uma interface própria para debates literários mais aprofundados.

## 5.4 Gestão de clubes

Permitir:

- Criar clubes.
- Personalizar nome, descrição, capa e identidade visual.
- Definir clube público, privado ou descobrível mediante solicitação.
- Convidar membros.
- Aprovar solicitações de entrada.
- Administrar permissões.
- Remover participantes.
- Criar eventos.
- Selecionar livros.
- Gerenciar leituras coletivas.

Implementar papéis como proprietário, administrador, moderador e membro.

Todas as permissões devem ser validadas no backend.

## 5.5 Calendário de encontros

Permitir agendar encontros presenciais e virtuais.

Cada evento poderá incluir:

- Título.
- Livro relacionado.
- Data e horário.
- Local ou link de reunião.
- Descrição.
- Participantes confirmados.
- Lista de presença.
- Álbum de fotos.
- Discussão relacionada.

---

# 6. BIBLIOTECA DIGITAL

Desenvolver uma biblioteca com duas funcionalidades principais: catálogo de livros e gerenciamento de arquivos digitais.

## 6.1 Catálogo

Permitir pesquisar e cadastrar livros contendo:

- Título.
- Autor.
- Capa.
- ISBN.
- Sinopse.
- Editora.
- Idioma.
- Gênero.
- Ano de publicação.
- Número de páginas, quando disponível.
- Avaliação média.

Integrar APIs de metadados bibliográficos quando apropriado.

Não confundir os metadados de um livro com a disponibilidade legal de um arquivo para download.

## 6.2 Importação de EPUB

Permitir que usuários importem arquivos EPUB autorizados.

Fluxo:

1. Selecionar arquivo.
2. Validar extensão, formato, tamanho e estrutura do EPUB.
3. Extrair metadados disponíveis.
4. Identificar título, autor e capa.
5. Permitir corrigir informações.
6. Adicionar o livro à biblioteca pessoal.
7. Disponibilizar o arquivo no leitor digital.

Implementar verificação de segurança e armazenamento privado.

## 6.3 Download de livros

Criar uma área de livros disponíveis legalmente para download.

Fontes permitidas:

- Obras em domínio público.
- Livros com licenças de distribuição compatíveis.
- Arquivos próprios do usuário.
- Conteúdos disponibilizados por titulares autorizados.

Exibir informações de licença, origem e condições de uso.

Não implementar mecanismos para contornar DRM ou distribuir obras protegidas sem autorização.

## 6.4 Biblioteca compartilhada

Permitir que administradores disponibilizem livros ou referências bibliográficas aos integrantes do clube.

Distinguir:

- Catálogo compartilhado de títulos.
- Arquivos autorizados para distribuição.
- Arquivos particulares dos usuários.

Nunca conceder acesso aos arquivos privados de um membro apenas por ele participar de um clube.

---

# 7. AMBIENTE PESSOAL DE LEITURA

Criar uma área chamada **Meu Espaço de Leitura**.

Esse ambiente deverá funcionar como uma biblioteca pessoal e um leitor digital integrado.

## 7.1 Minhas estantes

Organizar os livros nas categorias:

- Quero ler.
- Lendo atualmente.
- Concluídos.
- Pausados.
- Abandonados.
- Favoritos.

Permitir criar estantes personalizadas.

## 7.2 Adicionar à minha biblioteca

Cada livro do catálogo deverá apresentar uma ação:

**Adicionar à minha biblioteca**

Ao selecionar essa opção, criar uma referência pessoal ao livro.

Caso exista um EPUB autorizado e acessível ao usuário, permitir abrir ou importar esse arquivo para sua biblioteca.

Caso não exista, adicionar somente os metadados e o status de leitura.

Evitar duplicar arquivos físicos desnecessariamente.

## 7.3 Leitor EPUB integrado

Implementar leitor digital com:

- Navegação por capítulos.
- Sumário.
- Ajuste de tamanho da fonte.
- Alteração de tipografia.
- Tema claro, escuro e sépia.
- Ajuste de margens.
- Marcadores.
- Destaques de texto.
- Anotações.
- Pesquisa no conteúdo.
- Retomada da última posição.
- Progresso de leitura.
- Salvamento automático.

Avaliar bibliotecas consolidadas para leitura EPUB, como epub.js, verificando compatibilidade com o projeto.

## 7.4 Sincronização

Salvar o progresso por usuário e livro.

Implementar sincronização entre dispositivos quando o usuário estiver autenticado.

Utilizar estratégias seguras para sincronização e resolução de conflitos.

O modo offline poderá ser implementado progressivamente, respeitando as condições de armazenamento e licenciamento.

## 7.5 Compartilhamento de trechos

Permitir selecionar pequenos trechos e compartilhá-los como publicação literária, incluindo:

- Citação curta.
- Título do livro.
- Autor.
- Comentário pessoal.
- Indicação da origem.

Aplicar limites adequados de reprodução de textos protegidos por direitos autorais.

O compartilhamento deve ser uma ação explícita do usuário.

---

# 8. INTEGRAÇÃO ENTRE AMBIENTES

Os três ambientes devem funcionar de maneira integrada.

### Exemplo 1 — Encontro presencial

Um administrador cria um encontro no clube.

Os integrantes confirmam presença.

Após o evento, os participantes adicionam fotos à galeria do clube.

As imagens aparecem no mural privado.

Um participante poderá publicar uma foto também na rede social pública, desde que tenha permissão e realize essa publicação explicitamente.

### Exemplo 2 — Descoberta de livro

Um usuário encontra uma resenha no feed público.

Acessa os detalhes do livro.

Adiciona o título à sua biblioteca pessoal.

Se possuir um arquivo EPUB autorizado, poderá importá-lo e iniciar a leitura.

### Exemplo 3 — Leitura coletiva

Um administrador escolhe um livro para leitura coletiva.

Os integrantes adicionam o título às próprias estantes.

Cada participante acompanha o progresso individual.

O fórum organiza discussões por capítulos.

O mural recebe reflexões e comentários.

### Exemplo 4 — Citação literária

Um usuário destaca uma frase durante a leitura.

Salva essa frase nas anotações privadas.

Opcionalmente, decide compartilhá-la no mural do clube ou na comunidade pública, respeitando os limites de direitos autorais.

---

# 9. EXPERIÊNCIA VISUAL E UX/UI

Modernizar a interface para que o produto transmita a sensação de uma plataforma literária premium.

Evitar layouts genéricos, excesso de cards, cores sem hierarquia e elementos com aparência artificial.

Adotar:

- Tipografia editorial elegante.
- Excelente legibilidade.
- Capas de livros em destaque.
- Hierarquia visual consistente.
- Espaçamento equilibrado.
- Componentes reutilizáveis.
- Animações discretas.
- Transições suaves.
- Microinterações em curtidas e salvamentos.
- Skeleton loading.
- Estados vazios personalizados.
- Feedback visual de operações.
- Design responsivo.
- Navegação confortável em smartphones.

O design deverá funcionar em desktop, tablet e dispositivos móveis.

Preservar a identidade visual existente sempre que possível, propondo alterações apenas quando justificadas.

Buscar uma experiência moderna, acolhedora e focada na leitura, sem copiar diretamente o visual de outras plataformas.

---

# 10. ARQUITETURA E BANCO DE DADOS

Inspecione a infraestrutura atual antes de modificar qualquer tecnologia.

A arquitetura anteriormente planejada considera React, TypeScript, PostgreSQL e Firebase para autenticação e arquivos.

Confirme o que realmente está implementado.

Proponha modelos para entidades como:

- users
- profiles
- follows
- clubs
- club_members
- club_roles
- club_join_requests
- posts
- post_media
- post_likes
- comments
- comment_likes
- saved_posts
- forum_topics
- forum_replies
- books
- book_editions
- book_files
- user_library
- reading_progress
- reading_highlights
- reading_notes
- club_readings
- club_events
- event_attendees
- event_albums
- notifications
- reports
- moderation_actions

Essas entidades são referências conceituais. Ajuste sua modelagem aos padrões e requisitos do projeto.

Implemente:

- Chaves estrangeiras.
- Índices.
- Integridade referencial.
- Paginação.
- Validação de entradas.
- Controle de acesso por recurso.
- Isolamento entre clubes.
- Estratégia de migrações.
- Logs de auditoria para ações administrativas.
- Tratamento consistente de erros.
- Prevenção contra consultas excessivas.

As operações sociais devem suportar crescimento sem exigir carregamento integral do histórico.

---

# 11. PRIVACIDADE E SEGURANÇA

A separação entre os ambientes é obrigatória.

Regras:

1. Conteúdo privado somente poderá ser consultado por membros autorizados.
2. Dados pessoais não devem ser expostos por APIs públicas.
3. URLs de arquivos privados devem ter acesso controlado.
4. Permissões devem ser verificadas no servidor, nunca apenas na interface.
5. Publicações públicas e privadas devem possuir políticas diferentes.
6. Usuários devem poder denunciar conteúdos e bloquear outros usuários.
7. Administradores poderão moderar seus clubes dentro dos limites de permissão.
8. Implementar proteção contra spam, abuso e uploads maliciosos.
9. Aplicar rate limiting nas operações sensíveis.
10. Atender aos princípios aplicáveis da LGPD, incluindo transparência, exclusão e minimização de dados.

Não permitir que arquivos EPUB particulares sejam compartilhados inadvertidamente.

---

# 12. NOTIFICAÇÕES

Criar uma central integrada de notificações para:

- Curtidas.
- Comentários.
- Respostas.
- Menções.
- Convites para clubes.
- Solicitações de participação.
- Aprovações.
- Novas discussões.
- Próximos encontros.
- Alterações nas leituras coletivas.
- Novos livros do clube.

Permitir configurações individuais de preferência.

Notificações não podem revelar informações privadas a usuários não autorizados.

---

# 13. IMPLEMENTAÇÃO EM FASES

Não realizar uma reescrita integral.

### Fase 1 — Auditoria e arquitetura
Analisar código, banco de dados, autenticação, serviços, componentes, dependências e riscos.

### Fase 2 — Biblioteca e espaço pessoal
Implementar catálogo, importação EPUB, estantes pessoais e leitor digital.

### Fase 3 — Estrutura privada dos clubes
Implementar permissões, mural privado, fotos, galeria e aprimoramento do fórum.

### Fase 4 — Comunidade pública
Implementar feed social, publicações, curtidas, comentários, perfis e exploração.

### Fase 5 — Integrações
Conectar livros, publicações, clubes, leitura pessoal, encontros e notificações.

### Fase 6 — Qualidade e otimização
Executar testes, corrigir problemas de responsividade, acessibilidade, segurança e desempenho.

Para cada fase, identificar dependências e critérios de aceitação.

---

# 14. QUALIDADE E TESTES

Implementar testes para cenários críticos:

- Login e sessão.
- Associação e saída de clubes.
- Isolamento de dados privados.
- Publicação de fotos.
- Upload e leitura EPUB.
- Download autorizado.
- Curtidas e comentários.
- Permissões de moderação.
- Sincronização de progresso.
- Exclusão de conteúdos.
- Paginação.
- Tratamento de arquivos inválidos.
- Navegação móvel.

Realizar testes unitários, de integração e end-to-end de acordo com a infraestrutura existente.

Não considerar uma funcionalidade pronta apenas porque sua interface foi criada. Confirmar persistência, autorização e funcionamento real.

---

# 15. REGRAS DE EXECUÇÃO

Ao receber este prompt:

1. Inspecione o repositório e leia a documentação existente.
2. Identifique o estado real da aplicação.
3. Elabore um diagnóstico de arquitetura.
4. Compare funcionalidades existentes com as funcionalidades solicitadas.
5. Produza um plano técnico dividido em etapas.
6. Identifique as modificações necessárias no banco de dados.
7. Defina os contratos das APIs e os componentes de interface.
8. Implemente por módulos, respeitando dependências.
9. Execute testes e validações após alterações.
10. Documente modificações e pendências.

Não invente funcionalidades como concluídas.

Não destrua dados existentes.

Não introduza mudanças incompatíveis sem apresentar a estratégia de migração.

Não exponha credenciais ou segredos.

Não execute migrações destrutivas, operações em produção ou alterações irreversíveis sem autorização explícita.

Priorize simplicidade, organização, escalabilidade e manutenção.

---

# 16. RESULTADO ESPERADO

Ao final, a aplicação deverá entregar três experiências conectadas:

**1. Uma rede social literária**, onde leitores de diferentes clubes podem descobrir livros, publicar conteúdos e interagir.

**2. Uma comunidade privada para cada clube**, com mural social, fórum, fotos de encontros, calendário, membros e leituras coletivas.

**3. Uma biblioteca pessoal digital**, onde cada usuário pode organizar livros, importar EPUBs autorizados, ler, destacar passagens e acompanhar seu progresso.

A plataforma deverá proporcionar uma experiência contínua entre descobrir um livro, adicioná-lo à biblioteca, participar de uma leitura coletiva e compartilhar experiências com outros leitores.

**ORIENTAÇÃO FINAL:** comece pela auditoria técnica e apresente o plano de execução, as dependências e os riscos. Depois avance na implementação por fases, validando cada entrega antes da próxima. Preserve a aplicação existente e trate segurança, privacidade, qualidade e experiência do usuário como requisitos obrigatórios.