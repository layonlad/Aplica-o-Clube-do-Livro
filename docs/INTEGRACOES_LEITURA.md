# Integrações de Leitura

## Auditoria inicial e dependências

| Camada | Implementação existente | Uso no módulo |
| --- | --- | --- |
| Interface | React, Vite, rotas por hash e design Coral | Menu da Biblioteca, folhas modais, navegação pessoal e formulários existentes |
| Identidade | Firebase Auth, token verificado pela API e e-mail confirmado | Todas as rotas privadas sob /v1/me |
| Backend e dados | Fastify no Cloud Run e PostgreSQL no Cloud SQL | Migrations e papel restrito existentes. Livros em personal_workspaces, arquivos em private_book_files |
| EPUB | Bucket GCS privado e parser EPUB validado no backend | Entrega do mesmo original pessoal após verificar propriedade, autorização e EPUB |
| Segurança de arquivos | storage.rules nega acesso pelo SDK. API usa IAM. | Transferência autenticada pela API. A integração não precisa de URL pública ou cópia no bucket |
| Leitor | ReadingRoom, EpubReader, posição, preferências e revisões próprias | Progresso externo independente da posição interna |
| Privacidade | Perfis, bloqueios, posts e associação ativa aos clubes validados na API | Compartilhamento voluntário pelo compositor existente |
| Notificações | Cloud Scheduler e executor privado | Publicação explícita segue as regras de notificação existentes |
| Integrações externas | Catálogo de livros e provedores de armazenamento | Registro de capacidades de leitores separado |
| Verificação | Vitest, PostgreSQL local, Firebase Auth Emulator, CI | Exercitar rotas e papel restrito, além dos fluxos no navegador |

## Capacidades oficiais consultadas em 18/11/2026

- A Amazon aceita EPUB para transferência. O portal web aceita arquivos de até 200 MB. O compartilhamento depende do sistema operacional e da instalação do app Kindle. [Enviar documentos ao Kindle](https://digprjsurvey.amazon.co.uk/csad/help/node/G5WYD9SAF7PGXRNA)
- Para envio manual por e-mail, encontre seu endereço Send to Kindle nas preferências de documentos pessoais da Amazon, aprove o remetente e anexe o EPUB. Mantenha o anexo abaixo de 50 MB. [Configurar remetentes](https://digprjsurvey.amazon.co.uk/csad/help/node/G7NECT4B4ZWHQ8WV), [limites de anexos](https://digprjsurvey.amazon.co.uk/csad/help/node/T48rsVm3gY7KeGkKUk)
- O Sync documentado funciona entre os dispositivos e apps Kindle da conta. A pesquisa nas fontes oficiais não encontrou API pública geral de biblioteca, progresso e notas para apps independentes. [Sincronização Kindle](https://digprjsurvey.amazon.com/csad/help/node/GGFEXXS8Z7DPJSTN)
- Alguns aparelhos disponibilizam o TXT **My Clippings**. O guia documenta esse arquivo e sua cópia manual. A disponibilidade depende de aparelho, software, obra e das permissões de exportação. [Guia Kindle](https://s3.amazonaws.com/kindle/Kindle_User_Guide.pdf)
- O compartilhamento nativo requer um gesto e suporte a arquivos. Por isso, a preparação e a abertura do menu nativo ocorrem em toques separados. [Web Share API](https://www.w3.org/TR/web-share/)

## Implementação

O módulo da API fica em `server/src/reading-integrations`. O registro `providers.ts` declara capacidades. O progresso usa um contrato por provedor. A exportação e a importação usam rotas e adaptadores específicos do Kindle. Para integrar outro provedor, adicione suas capacidades e adapte os esquemas SQL e o adaptador de formato após validar a documentação do serviço.

| Arquivo | Responsabilidade |
| --- | --- |
| `providers.ts` e `routes.ts` | Capacidades, limites e rotas autenticadas |
| `kindle-export.ts` | Permissão por arquivo, validação de formato e tamanho, entrega autenticada e histórico |
| `progress.ts` | Progresso manual versionado por usuário, livro e provedor |
| `clippings.ts` e `annotations.ts` | Validação de TXT, correspondência, prévia, deduplicação e gestão privada |
| `privacy.ts` | Propriedade do livro e limpeza no mesmo commit da remoção ou substituição da Biblioteca |
| `src/reading-integrations/` | Tela, folhas de exportação, progresso e anotações, e cliente da API |
| `src/coral/pieces.tsx` e `LibraryScreen.tsx` | Ações no menu e comparação do progresso na Biblioteca |
| `src/workspace/WorkspaceApp.tsx` e `WorkspaceShell.tsx` | Rota, Histórico e meta anual |
| `src/community/ClubWall.tsx` | Reflexão editável e vinculada a título e autor, usando o compositor existente |

A migration `020_reading_integrations.sql` acrescenta a permissão de exportação aos originais pessoais e cria três tabelas separadas. Arquivos existentes começam bloqueados. Cada declaração vale para o ID do original ativo e não acompanha sua substituição. O runtime recebe CRUD apenas nas novas tabelas, sem migration, DDL ou permissões para o executor. Os serviços verificam o titular e o livro na transação PostgreSQL para serializar mudanças com a remoção da Biblioteca. As atualizações de progresso usam revisão; duas gravações concorrentes com a mesma revisão retornam uma confirmação e um conflito. A importação reaplica o parser na confirmação e a restrição única protege contra duplicação.

## Enviar o EPUB

1. Entre com conta confirmada e guarde um EPUB pessoal na Biblioteca. No menu do livro, escolha **Enviar ao Kindle**.
2. Selecione a permissão aplicável e salve. A declaração do titular cobre arquivo pessoal com direito de transferência, domínio público ou licença que autoriza transferência. O app não verifica titularidade jurídica junto a editoras. Em caso de dúvida, mantenha a exportação bloqueada.
3. Prepare o original. A API verifica propriedade, permissão, arquivo ativo, tamanho e EPUB legível. Revalida a permissão e o ID antes de responder. Acervo de clube, arquivos sem original e DRM real ficam fora deste fluxo.
4. Use **Compartilhar pelo aparelho** quando o navegador aceitar esse arquivo. Selecione Kindle se aparecer. Caso contrário, use **Baixar EPUB** e selecione o arquivo no [Send to Kindle](https://www.amazon.com/sendtokindle). Também é possível usar o e-mail manual autorizado da Amazon.
5. Confira o processamento no Kindle. O histórico guarda as 20 tentativas mais recentes por livro. Registra preparação, arquivo disponibilizado, falha ou ação informada pelo navegador. O titular pode limpar esse histórico. O EPUB transferido ao navegador fica em memória nessa tela, com URL temporária local somente para o download.

## Registrar progresso e publicar uma reflexão

**Atualizar progresso** pede percentual inteiro entre 0 e 100, capítulo, data e observação. A Biblioteca mostra o valor interno e o Kindle lado a lado. O painel indica estado e última atualização. Se optar por incluir uma conclusão Kindle na meta anual e no histórico pessoal, cada livro conta uma vez. EPUB, posição interna, preferências e métricas públicas do Perfil conservam suas fontes atuais.

Em **Escrever reflexão**, escolha Comunidade ou um clube do qual participa e, se quiser, inclua o percentual no rascunho. O formulário exige publicação explícita, segue a privacidade do destino e usa as regras existentes do mural. Nenhum trecho ou observação é inserido automaticamente. A reflexão aparece com os metadados do livro e segue o fluxo normal de participação e notificações. Não existe um modelo próprio de desafios literários no código auditado. Metas pessoais e publicações são os pontos de integração disponíveis.

## Importar anotações

1. Copie o arquivo TXT **My Clippings** por USB se seu Kindle disponibilizá-lo. O importador aceita cabeçalhos de notas e destaques em inglês e português, UTF-8 com ou sem BOM e UTF-16 com BOM. Formatos PDF, HTML e exportações de outros leitores ficam fora deste adaptador.
2. Em **Importar anotações**, escolha o TXT. Os limites são 256 KB, 1.000 registros no arquivo, 100 selecionados por importação e 250 anotações por livro. Cada anotação tem até 2.000 caracteres. Marcadores, trechos vazios e avisos de limite de recorte são ignorados e contabilizados. Posição e data são exibidas conforme o arquivo, sem presumir fuso horário ou CFI.
3. Revise a obra de origem, selecione as notas e confirme o livro da Biblioteca. O TXT não fornece ISBN estruturado. A sugestão exige título e autor equivalentes e um único candidato. Se houver dúvida, a seleção fica vazia até a confirmação do usuário.
4. Confira a contagem de importadas e duplicadas. O TXT original só é processado na requisição. As entradas são gravadas em área privada, sem HTML interpretado, e podem receber comentário pessoal, ser excluídas ou servir de referência para escrever uma reflexão própria.

## Validação local e liberação futura

- Execute `npm ci` e `npm run dev:local` para subir PostgreSQL, Auth Emulator, API, frontend e storage local. Use conta e arquivos sintéticos. Os serviços devem apontar para o emulador e o banco local.
- Valide o download comparando os bytes do original. No aparelho Kindle, teste a disponibilidade do menu nativo com um EPUB que possa transferir ou faça o upload manual. A aceitação pela Amazon é um teste separado.
- Valide as duas formas de progresso registrando 42% no app e 65% no Kindle, e reabra o EPUB. Para Histórico e meta anual, registre 100% e marque a opção correspondente. Publique uma reflexão em um clube de teste e confirme que o comentário privado e o trecho não aparecem.
- Importe um TXT, repita para conferir duplicatas, tente uma obra incerta e confirme a edição manualmente. Experimente excluir anotações, progresso e histórico e verifique a limpeza ao remover o livro.
- A validação em produção requer autorização separada. A ordem prevista é aplicar migration 020 e grants com o papel proprietário, testar com o runtime restrito, publicar a API e, depois, o frontend. O módulo não adiciona serviços, coleções Firestore, regras Firebase Storage, credenciais Amazon ou agendamento.
- A auditoria visual complementar pode focar a folha com teclado real em iOS/Android, o menu nativo de arquivos, nomes longos e o fluxo de seleção de muitas anotações. O backup JSON legado cobre a leitura no app. Os dados externos ficam na conta e podem ser gerenciados no módulo.
