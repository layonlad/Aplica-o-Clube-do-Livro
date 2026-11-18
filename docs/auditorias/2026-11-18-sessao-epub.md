# Sessão, isolamento de contas e leitor EPUB

## Diagnóstico

| Comportamento | Causa identificada no código |
| --- | --- |
| Início e Biblioteca abriam sem login | O aplicativo conectado montava o WorkspaceProvider durante a restauração do Firebase. Sem usuário confirmado, carregava a Biblioteca local de visitante. Só algumas rotas, como convites, tinham proteção própria. |
| Possível aparência ou nome associado a outra conta | Nome legado, aparência, meta, último livro e pedidos para entrar em clubes usavam chaves compartilhadas no navegador. O resumo em memória dos clubes era indexado apenas pelo clube. O índice do IndexedDB de EPUB já usava o UID. |
| Endereço relatado | No código versionado, o endereço citado aparece apenas como contato de suporte do login Google em firebase.production.json. Esse campo não alimenta o Perfil. Nas telas autenticadas que exibem e-mail, a origem é o usuário Firebase. Uma sessão anterior pode ser restaurada sem um login manual novo. A tela relatada sozinha não confirma vazamento nem identifica se o navegador tinha uma sessão persistida. Nenhuma conta real foi aberta para este diagnóstico. |
| Login nem sempre sobrevivia ao fechamento | IndexedDB e localStorage já estavam configurados. Havia fallback para persistência limitada à aba, e o app não distinguia restauração de sessão da experiência de visitante. O SDK mantém sessões por origem. A origem de compatibilidade precisa da própria sessão. A causa de uma perda de sessão em um aparelho específico depende dos dados e da política de armazenamento daquele aparelho. |
| Leitor se comportava de modo diferente entre contas e visitantes | O mesmo renderizador lia preferências e posição de duas fontes, o workspace local de visitante e a conta no servidor. Uma conta com rolagem salva abre em rolagem por escolha. A troca de formato podia reaplicar um ponto antigo retornado pela API, a paginação podia iniciar um reposicionamento redundante depois da virada, e o temporizador de rolagem era recriado a cada renderização. O ensaio usou EPUB sintético. A combinação exata de arquivo, preferências e aparelho do relato não foi observada. |

## Correções

- **Firebase Auth.** IndexedDB e localStorage são as formas persistentes selecionadas. O observador do Firebase fornece a identidade. O provedor usa estados de inicialização, saída, confirmação de e-mail, sessão validada e erro. Antes de montar o app, confirma a sessão pela API. Verifica ao receber novo token e ao voltar à aba. Rejeição definitiva da API encerra a sessão. Indisponibilidade oculta dados e permite recuperar a sessão sem pedir a senha outra vez. A permanência depende de o navegador permitir e conservar o armazenamento da origem. [Persistência do Firebase Auth](https://firebase.google.com/docs/auth/web/auth-state-persistence)
- **Rotas.** Toda a aplicação conectada está atrás da mesma entrada. Login, cadastro, recuperação e confirmação de endereço são os fluxos de entrada. A navegação guarda destinos internos permitidos, incluindo o leitor e o convite, e substitui as entradas de redirecionamento. A demonstração isolada continua disponível na prévia do projeto.
- **Logout e isolamento.** A árvore privada desmonta ao encerrar a sessão ou trocar de UID. O logout espera o Firebase encerrar a sessão. Miniaturas e resumos privados em memória são descartados. Dados de aparência, meta, último livro e pedidos locais ficam separados por UID. O valor legado da meta não é atribuído a uma conta sem vínculo verificável. A aparência sincronizada volta a ser carregada da conta. As cópias de EPUB baixadas do servidor e marcadas como cache são removidas ao encerrar a sessão. Importações locais, registros legados sem essa marca e dados sincronizados são preservados. O app só consulta os registros privados depois de validar o respectivo UID.
- **EPUB.** A virada muda a posição imediatamente, e o progresso vai em segundo plano ao mesmo espaço que enfileirou o salvamento. A troca de tamanho, fonte ou modo reaproveita a âncora visível. A restauração ocorre antes da pintura da página, e uma mudança de capítulo grava o ponto real após medir o conteúdo. Rolagem e paginação usam salvamentos apropriados a cada modo. A virada de página usa uma cópia inerte dentro da própria tela e desaparece quando o leitor desmonta. Toques laterais, gesto central, seleção e a preferência por movimento reduzido são respeitados.

## Permissões e armazenamento

A análise de regras encontrou `storage.rules` com bloqueio de leitura e gravação pelo SDK. Cloud Storage recebe gravações ou leituras autorizadas pela API e pela identidade de serviço. Uploads diretos de fotos continuam sujeitos ao POST assinado com limites de objeto, tipo e validade. Firestore e Cloud Functions não são usados neste fluxo. PostgreSQL e Fastify mantêm os controles de usuário, propriedade de EPUB, associação ativa de clube e permissões de publicação. A verificação de revogação do token já existe no servidor. A mudança usa esse mecanismo também na inicialização e nos downloads autorizados.

A API ainda possui rotas de descoberta, catálogo e perfis/publicações que o usuário optou por tornar públicos. Essas regras continuam no backend. O frontend conectado passou a exigir login também para entrar nessas telas. A API exige identidade nas rotas privadas e valida a autorização de recursos de terceiros. O service worker de demonstração lida com o shell público. O modo conectado remove a inscrição desse worker e os caches da demonstração. Dados privados da API usam no-store.

Nenhuma regra de Firebase Storage, configuração de provedor de login, migration ou grant mudou. As provas de integração usam apenas Auth Emulator, PostgreSQL e armazenamento locais.

## Arquivos e validação manual

- Sessão, persistência e entrada em `src/auth/`, `src/main.tsx` e `src/workspace/WorkspaceApp.tsx`.
- Preferências e caches em `ThemeProvider.tsx`, `AppearanceSettings.tsx`, `UserAvatar.tsx`, `coral/data.ts`, `ClubsScreen.tsx`, `HomeScreen.tsx`, `SettingsHub.tsx`, `CoverBackdrop.tsx` e `epub-storage.ts`.
- Progresso, acesso ao original e gestos em `WorkspaceProvider.tsx`, `ReadingRoom.tsx`, `EpubReader.tsx`, `useLatestSave.ts`, `page-turn.ts` e `book-files.ts`.
- Regressões em `WorkspaceApp.test.tsx`, `WorkspaceSession.test.tsx`, `AuthProvider.test.tsx`, `return-path.test.ts` e `server/test/auth.test.ts`. A lista completa consta no diff do PR.

Em ambiente local, inicialize com `npm ci` e `npm run dev:local`. Use duas contas de teste confirmadas. Abra uma URL direta deslogado, entre e retome o destino. Importe um EPUB próprio de teste, avance e retorne por toque e gesto, ajuste o modo e reabra o navegador. Confirme a posição depois de o servidor gravá-la. Saia, use Voltar, feche o navegador e reabra. Entre com a segunda conta e confira que Perfil, Biblioteca e posição pertencem a ela. Repita em aparelhos físicos antes de publicar.

### Resultado dos testes

| Ensaio | Resultado |
| --- | --- |
| Frontend | 99 aprovados. Inclui bloqueio de rotas sem consulta à API, retorno interno, estado de sessão, troca de conta e fila de leitura. |
| API unitária e PostgreSQL | 44 unitários, incluindo vídeo, e 91 integrações aprovadas. |
| Firebase Auth Emulator | 2 aprovados. Sessão revogada/desativada recebe 401. Conta, workspace, notificações, aparência, originais pessoais e arquivos de clube recebem 401 sem sessão. |
| Navegadores locais | Chrome e WebKit completaram login, atualização, fechamento e reabertura, logout, Voltar, alternância de contas, erro 503 recuperável e bloqueio de conta desativada. Nenhuma consulta privada sem sessão e nenhum erro de JavaScript. |
| EPUB em navegador | Swipe e toque nas duas direções, 15 viradas, ferramentas, rolagem gravada, mudança e retorno de capítulo, posição retomada após reabrir. A animação desmonta com a tela, e o logout remove os downloads marcados como cache. |
| Larguras verificadas no leitor | Chrome 320, 360, 375, 390, 393, 414, 430, 768 e 1440 px. WebKit 320, 390 e 768 px. Sem transbordamento horizontal. |

Total **236 testes automatizados**, além dos ensaios no navegador. Chrome usou eventos de toque pela interface de teste do navegador. WebKit usou toque para os cliques e eventos de ponteiro sintéticos para os swipes. iOS/Android físicos, Google OAuth na nuvem e políticas de retenção de armazenamento de um aparelho real continuam pendentes. A posição é garantida depois que a API confirma a gravação; fechar o processo enquanto a gravação ainda está em trânsito pode conservar a posição anterior.

### Avaliação da regra de Storage

```json
{
  "score": 5,
  "summary": "A regra versionada nega todas as operações diretas de leitura e escrita pelo SDK. Esta nota avalia apenas storage.rules nesta revisão.",
  "findings": []
}
```
