# Privacidade, acessibilidade e direitos de imagem

Auditoria de 24/11/2026. Escopo web do Clube do Livro, cadastro, API, armazenamento da aplicação e controles de produção consultados em modo leitura. O trabalho está na candidata local 1.5. Os dois manifestos públicos consultados continuam mostrando a versão 1.4, commit 82d607a.

## Documentos e cadastro

O app oferece Política de Privacidade, Termos de Serviço e Formulário LGPD em rotas públicas, também acessíveis pelo cadastro e pelas Configurações. A pessoa marca o aceite dos termos e a ciência da política. Após verificar o e-mail, o servidor exige confirmação para as contas novas quando o controle está ativo, incluindo uma primeira entrada pelo Google. Registra somente o ID interno, a versão de cada documento e o horário do servidor. Repetir a operação devolve o mesmo comprovante. Contas anteriores à migration mantêm o acesso e nenhum aceite é atribuído retroativamente. A caixa é distinta de consentimentos opcionais, como preferências de notificações e autorizações de imagem.

O formulário pode ser aberto sem login. Ele prepara o pedido para envio pela caixa de e-mail da pessoa, sem enviar automaticamente ou guardar o rascunho no app. Em Staging, o endereço de demonstração tem domínio reservado e serve apenas para conferir o preenchimento. Em produção, o canal precisa existir e ser acompanhado pelo controlador.

### Preparação da publicação

- Preencher a identificação pública do controlador, incluindo identificação empresarial quando aplicável, e o contato monitorado. Configurar `VITE_LEGAL_CONTROLLER`, `VITE_PRIVACY_CONTACT` e o texto aprovado de transferência internacional em `VITE_LEGAL_TRANSFER`.
- Aprovar o conteúdo dos dois documentos, as bases por finalidade, os avisos para público infantojuvenil e os prazos por categoria. Arquivar a versão exata apresentada à pessoa e incrementar a versão quando o texto mudar. Definir o procedimento de alteração material também para contas anteriores.
- Após a aprovação de publicação, aplicar migration 025 e os grants do runtime. Publicar API compatível com o controle desligado e depois os dois sites. Ativar `REQUIRE_LEGAL_ACCEPTANCE=true` na API e verificar cadastro por e-mail e primeiro login com Google, conta antiga e retorno por convite. O fluxo pode voltar temporariamente ao modo compatível pelo mesmo controle.
- Testar um pedido sintético no canal real antes de disponibilizá-lo. O procedimento de atendimento deve verificar identidade com dados mínimos, registrar protocolo, classificar o direito, controlar prazo, restringir acesso e responder com segurança. Para confirmação e acesso, distinguir resposta simplificada imediata e declaração completa em até 15 dias conforme art. 19. [LGPD](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm)

## Inventário e riscos

| Tratamento | Onde ocorre | Situação e risco |
| --- | --- | --- |
| Conta, credenciais e identificadores | Firebase Auth e PostgreSQL | Senha fica no provedor. A API valida token e e-mail. Registrar a base de execução do serviço e documentar operadores e contratos. |
| Bibliotecas, EPUB, notas, estatísticas e preferências | Dispositivo, PostgreSQL e bucket privado | Exportação JSON cobre parte dos dados. Definir exportação completa mediante solicitação e exclusão em Auth, banco, Firestore, objetos, inscrições de push e cópias de migração. Validar titular e restrições de retenção antes de apagar. |
| Perfis, convites, fotos, comunidade e clubes | API, banco, bucket e Firestore do chat | Permissões por conta e clube. Registrar bases separadas para conteúdo público, convites de terceiros, moderação e fotos. Manter procedimento de denúncia, remoção, resposta e preservação de evidências. |
| Notificações e registros operacionais | API, PostgreSQL, Cloud Logging, navegador e provedor push | Logout tenta cancelar o Web Push no navegador e revogar a assinatura no servidor. Definir retenção para logs, auditoria, aceitamentos e backups. Não usar o formulário para documentos sensíveis. |
| Busca, notícias, capas e links | Fornecedores bibliográficos, editoriais ou serviço selecionado pela pessoa | Consultas e solicitações chegam ao fornecedor. Documentar os destinatários, o uso de armazenamento no navegador e o mecanismo de transferência internacional aplicável. |
| Dados de crianças e adolescentes | Cadastro, comunidade e chat | Avaliar público de acesso provável e adequação. Confirmar aferição de idade, padrão de privacidade, proteção contra contatos prejudiciais, moderação e exercício de direitos de responsáveis conforme o enquadramento. Um aceite comum não resolve essa obrigação. |
| Dados empresariais e recuperação | Projeto Google Cloud e origens da migração | Bloqueio público e backups SQL observados. Confirmar MFA, titularidade de contas, revisão de acessos, restauração e descarte das cópias legadas. A cobertura desta auditoria é a infraestrutura do app. |

Bases propostas na política são hipóteses a validar pelo controlador. A região da infraestrutura SQL e de mídias é Estados Unidos. O uso de um fornecedor internacional exige identificação do mecanismo, verificação contratual e transparência aplicáveis. Submeter à revisão jurídica também o regime de responsabilidade e notificações de conteúdo, as regras do Marco Civil para guarda de registros e os requisitos de consumidor antes de vender assinaturas. [Transferência internacional na ANPD](https://www.gov.br/anpd/pt-br/assuntos/assuntos-internacionais/transferencia-internacional-de-dados) · [ECA Digital](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/lei/l15211.htm) · [Regulamentação](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2026/decreto/d12880.htm)

### Segurança confirmada e pendências

- Os buckets de mídia e operações têm bloqueio de acesso público imposto, IAM uniforme e zero vínculos públicos diretos. A política de IAM do projeto também não mostrou vínculos com acesso público.
- O Cloud SQL exige conexões criptografadas, tem backup e proteção contra exclusão. A configuração consultada usa IPv4 público sem redes autorizadas listadas. A recuperação para um ponto no tempo está desligada. Os buckets consultados não usam versionamento nem recuperação de objetos excluídos. Medir RPO/RTO e avaliar recuperação de mídia e de versões antes de alterar orçamento ou infraestrutura.
- As regras versionadas de Firestore e Storage negam leitura e gravação diretas do cliente. A API usa identidade de serviço e confere acesso. A leitura das regras em repositório cobre acesso de cliente. Auditoria do Admin SDK e de IAM tem escopo separado.
- A migration restringe o runtime a inserir o aceite sem informar horário e consultar os registros. Atualização e exclusão de comprovantes não são concedidas ao papel de execução. Alterações de nome e e-mail permanecem com grants por coluna. A integração com papel restrito testa essas permissões.
- Definir quem responde a incidentes, como conter e preservar evidências, avaliar risco relevante e comunicar ANPD e titulares no prazo aplicável. A Resolução 15 prevê até três dias úteis como regra geral, com regras e exceções próprias. [Comunicação de incidentes na ANPD](https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/comunicado-de-incidente-de-seguranca-cis)

## Direitos autorais e de imagem

| Origem | Evidência | Tratamento |
| --- | --- | --- |
| Ícone, ilustração de estante, papel e adesivos locais | SVG e componentes rastreáveis no repositório | Manter autoria e autorização do projeto registradas. Histórico de commit identifica a origem técnica, não prova titularidade. |
| EPUB de demonstração e ilustração de capa | Script do projeto e metadado de licença dentro do EPUB | Manter os créditos e a autorização junto ao arquivo. |
| Fontes Fontsource e ícones Lucide | Dependências distribuídas com arquivos de licença | Distribuir os avisos de licença aplicáveis às fontes e ao Lucide. |
| Capas bibliográficas de terceiros | URLs de referência do catálogo e metadados históricos | A consulta pode exibir a capa como referência. Confirmar base de uso e atribuição para a exibição. O compartilhamento agora exporta um cartão ilustrado pelo app, sem reaproveitar a imagem da editora nem copiar uma capa privada. A capa permanece no leitor. |
| Fotos, GIFs, capas de perfil, álbuns e conteúdo enviado | Arquivos de usuários | A disponibilidade do arquivo não prova autorização. Manter denúncia, remoção e análise de consentimento ou autorização da pessoa retratada. Revisar também acervo histórico. |

A Lei 9.610/1998 protege ilustrações, obras literárias e fotografias. A exibição em catálogo, a posse de um EPUB e a autorização de republicação são situações distintas. [Lei de Direitos Autorais](https://www.planalto.gov.br/ccivil_03/leis/l9610.htm) · [Open Library Covers API](https://openlibrary.org/dev/docs/api/covers)

## Acessibilidade e mobile

A referência é WCAG 2.2 AA. Foram revistos contraste, foco, rótulos, ordem do fluxo de cadastro e dimensões de controles. A navegação inferior permite quebra de texto e reserva espaço para o foco. O chat usa fundo mais escuro para contraste, sugestões de menção com altura limitada e Debates com rolagem. Os controles do cartão de leitura preservam seus papéis nativos de links e botões. A inspeção por navegador cobre o recorte abaixo. Leitor de tela, teclado virtual em dispositivo físico e temas personalizados ainda precisam de testes próprios. [WCAG 2.2](https://www.w3.org/TR/WCAG22/)

- Chrome e Playwright conferiram 320, 375, 430 e 1280 px sem rolagem horizontal. O fluxo de aceite foi exercitado com foco por Tab, acionamento por Espaço e link de salto para o conteúdo.
- O axe-core 4.14.1 não apontou violações automáticas nas 13 verificações, cobrindo cadastro claro e escuro, Política, Termos, Formulário, aceite, Início, Biblioteca, Explorar, Comunidade, Clubes, Notificações e Configurações. Algumas regras exigem avaliação manual e ficam fora dessa contagem.
- Passaram 133 testes de frontend, 59 unitários da API e 98 integrações com PostgreSQL e Firestore emulado. A suíte local pulou um teste de vídeo que requer codecs. O build distribui os textos de licença das fontes e dos ícones.
