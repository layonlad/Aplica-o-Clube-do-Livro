# Publicação da correção de sessão e EPUB

Em 18/11/2026, o dono autorizou mesclar e publicar o PR 39 se as verificações passassem. O CI do commit revisado [passou](https://github.com/layonlad/Aplica-o-Clube-do-Livro/actions/runs/44350095343). O merge `26627b2ee6930bdb56afa51e9a234c9d9c252680` tem a mesma árvore revisada e o build foi criado em uma cópia limpa.

O frontend foi publicado no [Hosting principal](https://gen-lang-client-0194308411.web.app/#/app) e no [Hosting de compatibilidade](https://project-acb850f4-4bb8-45de-a84.web.app/#/app). A comparação com a API publicada `9ce87a1` confirmou equivalência de código em produção e de migrations. As revisões de Cloud Run, o banco e as regras permaneceram. A saúde respondeu 200 e a rota privada de workspace respondeu 401 sem sessão.

| Verificação | Resultado |
| --- | --- |
| Suíte local | 236 aprovados. Os ensaios em Chrome e WebKit cobriram login, logout após reabrir, troca de contas, falha temporária, conta desativada e EPUB autenticado. |
| Produção sem sessão | Sete rotas diretas em cada Hosting abriram o login. Cadastro e recuperação acessíveis. Zero chamadas privadas e zero erros no console. |
| Arquivos de produção | 104/104 por site iguais ao build conectado por SHA-256. |
| Validação com conta | Executada em ambiente local com duas contas sintéticas. O teste publicado usou contexto sem sessão. |

As versões anteriores dos dois Hosting foram guardadas para recuperação. O registro documental no mapa reflete as versões verificadas. [Diagnóstico, testes e validação manual](../auditorias/2026-11-18-sessao-epub.md).
