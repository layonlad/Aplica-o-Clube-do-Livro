# Staging móvel e distribuição

A web usa React, Vite, React Router e Firebase Auth. Capacitor reutiliza o build e embute os arquivos no binário. Os projetos incluem o ícone atual, tela de abertura, áreas seguras, botão Voltar no Android, compartilhamento nativo de links e recepção de links HTTPS permitidos. O identificador `br.com.clubedolivro.preview` destina-se a ensaios internos. A escolha do nome comercial e dos identificadores finais cabe ao proprietário.

## Rodar o build de ensaio

1. Separe Firebase Auth, API, PostgreSQL e bucket de staging. Habilite e-mail e senha, confirmação e recuperação nesse Firebase. Use contas sintéticas. Configure a API de staging com `NODE_ENV=development` e `ALLOW_NATIVE_STAGING_ORIGINS=true` para as origens exatas `capacitor://localhost` e `https://localhost`. O servidor continua exigindo sessão válida. Para testar upload direto, ajuste também o CORS do bucket privado de staging para os aplicativos nativos e a origem web utilizada.
2. Use Node 24 e rode `npm ci`. Crie `.env.mobile.local` ignorado pelo Git. O build exige HTTPS, domínio Firebase do próprio projeto e recusa os projetos e endereços conhecidos de produção. Os valores abaixo são exemplos reservados.

   ```dotenv
   VITE_FIREBASE_PROJECT_ID=seu-projeto-staging
   VITE_FIREBASE_AUTH_DOMAIN=seu-projeto-staging.firebaseapp.com
   VITE_FIREBASE_API_KEY=
   VITE_API_URL=https://api.staging.example.invalid
   VITE_NATIVE_LINK_ORIGIN=https://staging.example.invalid
   ```

3. Rode `npm run mobile:sync`. O Capacitor copia `dist-mobile` para os dois alvos. Para iOS, abra `npx cap open ios` com Xcode completo e resolva os pacotes Swift. Para Android, abra `npx cap open android` com Android Studio 2025.2.1 ou posterior, JDK 21 e SDK 36. Valide primeiro simuladores e emuladores. Depois teste em aparelhos físicos com rede móvel e Wi-Fi.
4. Para links verificados, configure Associated Domains e publique `apple-app-site-association` de staging com o Team ID e bundle ID. No Android associe o host no intent filter do app e publique `assetlinks.json` com o Application ID e a impressão SHA-256 da assinatura correspondente. A ponte aceita rotas internas enviadas pelo domínio HTTPS configurado. Convites e conteúdo privado ainda passam pela autenticação e autorização no servidor.
5. Para TestFlight, defina equipe, Bundle ID definitivo, versão e assinatura. Compile com Xcode e SDK aceitos e gere o archive no Xcode. Para Play Console, configure o Application ID definitivo, incremente `versionCode`, configure assinatura e Play App Signing, gere `./gradlew bundleRelease` e envie o AAB a uma faixa de testes. Os valores de teste ficam no repositório. Chaves e credenciais ficam fora dele.

Em 18/11/2026, o Google Play exige target API 36 para novos apps e atualizações de celular. O projeto Android define target 36 e mínimo 24. A Apple exige Xcode 26 ou posterior com SDK iOS/iPadOS 26 ou posterior para uploads, e o projeto iOS usa mínimo iOS 15. [Requisitos do Google Play](https://support.google.com/googleplay/android-developer/answer/11926878) · [Requisitos da Apple](https://developer.apple.com/news/upcoming-requirements/?id=04282026a) · [Ambiente Capacitor](https://capacitorjs.com/docs/getting-started/environment-setup)

## Checklist de revisão

| Item | Situação | Caminho de validação |
| --- | --- | --- |
| Projetos Android e iOS, ícone, splash, versões iniciais, áreas seguras | Implementado | Build web conectado e `cap sync` rodaram. Testar binários e safe areas com teclado na WebView de ambos. |
| React, EPUB, contas e caches privados | Testado na web | Chrome e WebKit emulados. Repetir login, upload, seleção de arquivo, download, 15 gestos, retorno de capítulo, rotação, retomada e logout em iPhone, iPad e Android físicos. |
| Identidade comercial, assinatura, TestFlight e AAB | Bloqueado | Xcode completo e Android SDK ausentes neste ambiente. Certificados, Apple Developer e Play Console dependem das contas do proprietário. |
| Compartilhamento e navegação nativa | Implementado | Testar compartilhamento do link com receptor sem permissão e botão Voltar no Android. Instalar associações de domínio e testar abertura fria e quente. Exportação de arquivos para Files/Downloads, compartilhamento nativo de arquivos e retomada após matar o app ainda requerem ensaio. |
| Login nativo | Pendente | O build de staging oferece e-mail/senha. Google nativo e meio equivalente que permita ocultar o e-mail exigem integração e configuração de provedores. O Google web é um fluxo separado. |
| Push nativo | Pendente | O push do navegador usa Service Worker e VAPID. Preparar APNs e FCM nativo com permissões no momento oportuno, credenciais de staging e testes de recebimento. |
| Uso offline | Pendente | EPUB local já usa IndexedDB. Rotas privadas dependem da sessão e da API. Sem persistência offline de feeds privados ou cache público de conteúdo. |
| Exclusão de conta e dados | Pendente | Implementar solicitação autenticada no app, remoção ou anonimização de dados vinculados, revogação Firebase, retenção documentada e URL externa de solicitação para o Play Console. Definir retenções com o dono antes de automatizar exclusões. |
| Moderação e termos | Parcial | Denúncia, bloqueio de usuários e moderação existem na web. Faltam termos aceitos antes do primeiro upload, política de conteúdo, contato publicado, atendimento a denúncias, método de filtragem e validação em aparelhos. |
| Privacidade, Data safety, App Privacy e idade | Pendente | Inventariar conta, perfis, posts, fotos, clubes, anotações e EPUB privado, progresso e preferências, endpoints de push e diagnósticos. Confirmar coleta, finalidade, compartilhamento, retenção e exclusão. Publicar política de privacidade em URL estável, revisar manifests de privacidade dos SDKs e preencher formulários e classificação indicativa. |
| Prova de utilidade nativa e acesso para revisão | Pendente | Demonstrar leitor, importação, compartilhamento pelo sistema e experiência com teclado. Preparar conta de revisão, clube sintético com convite, instruções de acesso e screenshots de aparelhos. |
| Compras digitais | Não aplicável a este build | Planos e cobrança não estão implementados. Avaliar StoreKit e Google Play Billing quando houver oferta comercial. |

Fontes para revisão. [App Review Guidelines, itens 1.2, 2.1, 4.2, 4.8 e 5.1.1](https://developer.apple.com/app-store/review/guidelines/) · [Conteúdo de usuários no Google Play](https://support.google.com/googleplay/android-developer/answer/9876937) · [Exclusão de conta no Google Play](https://support.google.com/googleplay/android-developer/answer/13327111)
