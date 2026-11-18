# Entrega — reformulação visual "Coral" (17–18/11/2026)

Pedido do dono: reproduzir as referências enviadas (Início, Biblioteca, Comunidade, Explorar, Clubes e a descrição do Perfil). Cada botão deveria ter função real, e a mesma identidade deveria valer para 100% do app: formulários, menus, configurações, notificações e telas internas. O leitor EPUB é exceção intencional.

Design system documentado em [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md).

## Telas principais

| Tela | Rota | O que tem (tudo com dados reais) |
| --- | --- | --- |
| Início | `/app` | Avatar e sino no cabeçalho, pesquisa, Continuar lendo (capa, progresso, capítulo, Continuar ▶, •••), Clubes em destaque, Leituras dos amigos, Novidades da comunidade |
| Explorar | `/app/explore` | Busca unificada (livros, pessoas, clubes, publicações), categorias, Livros em alta, Clubes populares, Lançamentos, Leitores recomendados com Seguir, Destaques da comunidade |
| Biblioteca | `/app/library` | Busca, Filtros e organização, abas Lendo / Quero ler / Concluídos com contagem, Continuar lendo, Minhas coleções (+ Nova coleção), Meus livros com ordenação e menu ••• |
| Comunidade | `/app/community` | Criar publicação, clubes em círculos (+ Criar clube), seletor Mais recentes / De quem eu sigo / Salvos, feed com curtir, comentar, salvar e ••• |
| Clubes | `/app/clubs` | Busca, criar clube, Meus clubes (capa, membros, livro do momento, próximo encontro), Convites (Aceitar / Recusar), Descobrir clubes (Participar → Solicitado) |
| Perfil | `/app/profile`, `/app/people/:id` | Capa em gradiente, foto sobreposta, nome, @usuário, bio, Editar perfil ou Seguir, contadores (Publicações, Seguidores, Seguindo), abas, grade de 2 colunas, botão flutuante + (Criar) |

## Botões e o que cada um faz

| Botão | Onde | Ação |
| --- | --- | --- |
| Avatar | Início | Abre o próprio perfil |
| Sino | Início, Explorar, Comunidade, Perfil | Central de notificações (ponto coral quando há não lidas) |
| Lupa | Início, Explorar, Biblioteca, Clubes | Pesquisa (Explorar) ou busca local da tela |
| Ver biblioteca / Ver todos / Ver mais | Seções | Abrem a tela completa correspondente |
| Continuar ▶ | Cartão de leitura | Abre o leitor na posição salva, com a animação da capa |
| ••• (livro) | Cartão e lista | Abrir leitor, concluir ou ler de novo, favoritar, compartilhar capa, mudar coleção, ver na biblioteca, remover (com confirmação) |
| Cartão de clube | Início, Comunidade, Clubes | Entra no espaço do clube |
| Avatar de amigo | Início | Abre o perfil da pessoa |
| Curtir / Comentar / Salvar | Publicações | Registram no servidor; Salvar alterna "Salvar/Salvo" |
| ••• (publicação) | Publicações | Editar, adicionar o livro à biblioteca, enviar link, denunciar, excluir |
| Categorias | Explorar | Filtram livros (catálogo), leitores (gênero) e clubes |
| + Seguir | Leitores recomendados | Segue ou pede para seguir (perfil privado) |
| Filtros | Biblioteca | Coleção, só favoritos, capa como fundo, editar coleções, importar EPUB, adicionar livro, gerenciar biblioteca, histórico |
| Nova coleção / editar | Biblioteca | Cria, renomeia (move os livros) e exclui coleções |
| Ordenar por | Biblioteca | Recente, Título, Autor, Progresso, Data de conclusão (fica lembrado) |
| Criar publicação | Comunidade | Folha com texto, fotos ou enquete |
| Criar clube / + | Comunidade, Clubes | Cria o clube e abre a administração |
| Aceitar / Recusar | Convites | Aceita e entra no clube / recusa (o convite deixa de valer) |
| Participar | Descobrir clubes | Envia pedido com mensagem opcional; vira "Solicitado" |
| Editar perfil | Perfil | Foto, capa, nome, @usuário, bio, privacidade |
| Seguidores / Seguindo | Perfil | Lista com seguir/deixar de seguir em cada pessoa |
| Engrenagem | Perfil | Configurações em categorias |
| + flutuante | Perfil | Nova publicação, nova discussão (por clube), novo clube, adicionar livro |
| Restaurar aparência original | Aparência | Volta ao tema coral padrão e salva |

## Matriz de cobertura visual

Legenda: ✅ atualizado e verificado no navegador · 🟡 atualizado por tokens e componentes compartilhados, conferido de passagem · ⬜ não migrado.

| Rota / componente | Situação | Observação |
| --- | --- | --- |
| Barra inferior e trilho do computador | ✅ | 5 destinos, ícone ativo cheio em coral |
| Início, Explorar, Biblioteca, Comunidade, Clubes, Perfil | ✅ | 360, 390, 768 e 1280 px, sem rolagem lateral |
| Visão geral do clube | ✅ | Capa, leitura, próximo encontro, atalhos |
| Mural, Fórum, Agenda, Indicações, Galeria do clube | ✅ | Barra coral + subnavegação em pílulas |
| Membros e administração, convite por código | ✅ | Barra coral |
| Notificações, Editar perfil, Configurações, Aparência | ✅ | |
| Entrar, criar conta, recuperar senha | ✅ | Sem nome provisório de marca |
| Folhas, menus •••, confirmações, seletores, caixas e interruptores | ✅ | Componentes compartilhados |
| Leitor EPUB (área de leitura) | ✅ | Sem gradiente e sem barra, como pedido |
| Leitor EPUB (painel de ferramentas) | ✅ | Abas, seletores e cor da página no padrão |
| Gerenciar biblioteca (importação, catálogo, arquivos) | 🟡 | Mesma lógica de antes, só reestilizada |
| Histórico, Leituras autorizadas, Conta e dados, Moderação | 🟡 | |
| Telas do modo demonstração (`src/pages`) | ⬜ | Usadas só no protótipo sem servidor |

## Mudanças no servidor (aditivas, com testes)

- `POST /v1/me/invitations/:id/decline`: recusa um convite endereçado à própria pessoa. O convite é revogado, o aviso some e fica registrado na auditoria.
- `GET /v1/people/:id/followers` e `GET /v1/people/:id/following`:
  - só para quem pode ver o perfil;
  - a dona do perfil vê todas as conexões;
  - visitantes veem só as contas que também podem ver;
  - contas bloqueadas nunca aparecem.
- Aparência: campo opcional `textColor`.
- Sem migration. **A API precisa ser publicada antes do site.**

## Testes

- Servidor: 16 arquivos de integração, 91 testes passando (inclui recusa de convite e privacidade de seguidores).
- Site: 22 arquivos, 73 testes passando; checagem de tipos (`tsc -b`) e `vite build` sem erros.

## Diferenças que continuam (e por quê)

- **Perfil:** a imagem de referência não chegou; segue a descrição escrita.
- **Categoria dos clubes** (ex.: "Ficção Científica"): o clube não tem esse dado. O selo mostra "Clube público", "Aceita pedidos" ou "Você organiza".
- **"Autores recomendados"** virou "Leitores recomendados": autores não têm perfil na plataforma.
- **Aba "Menções"** não foi criada: o servidor não lista menções.
- **Participar** sempre envia pedido, porque todo clube exige aprovação de quem organiza.
- **Fotos de clubes e livros:** aparecem quando existem. Sem foto, o app desenha a arte com a cor do clube e a capa ilustrada do livro.
- **Contraste do cabeçalho:** o subtítulo branco sobre o gradiente fica abaixo de 4,5:1 para manter a cor da referência. Com "Contraste alto" no aparelho, o gradiente escurece.
- **Lançamentos:** livros publicados pela primeira vez em 2025–2026 no catálogo aberto (Open Library). Não é ranking de vendas.

## Pendências

- Publicar a API (Cloud Run) e depois o site, nos dois endereços. Aguarda autorização do dono.
- Testar no celular físico (iPhone e Android).
