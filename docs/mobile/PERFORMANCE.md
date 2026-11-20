# Auditoria de desempenho mobile

## Arquitetura e causas

- O frontend conectado usa React 18, Vite, HashRouter, contextos de sessão, espaço e aparência, CSS Coral e Framer Motion. Em produção, o Firebase Hosting entrega o site. Firebase Auth valida a identidade e o backend valida a sessão antes de renderizar qualquer rota privada.
- A API Fastify e o executor rodam no Cloud Run com mínimo zero, máximo uma instância, concorrência 2 e pool da API limitado a 5. Banco PostgreSQL no Cloud SQL e arquivos no Cloud Storage privado. Firestore e Cloud Functions não participam do fluxo. Nenhuma região, limite ou instância foi alterada nesta auditoria.
- Fotos estáticas seguem por upload direto assinado com expiração e processamento Sharp. GIF e vídeo têm limites próprios e FFmpeg para vídeo. O EPUB é pessoal, com IndexedDB, arquivo privado e apresentação imersiva. O modo conectado não instala cache de aplicação com Service Worker. O Web Push usa seu worker próprio para entrega.
- O feed requisitava miniatura e foto de feed juntas e revogava o Blob URL ao remontar cada card. A abertura repetida de abas relia a página e acionava outro poll de notificações. A UI autenticada, suas rotas e o leitor entravam no grafo de importação de login. Os cartões de clube faziam até três requisições para cada clube e traziam dados desnecessários de membros e workspace. A API autenticada atualizava a linha de identidade mesmo quando os atributos continuavam iguais.

## Implementação

- A sessão validada reaproveita o resultado inicial de `/me`. As rotas autenticadas e as abas são carregadas sob demanda. A barra global, a contagem de notificações e o registro de posição de rolagem vivem no shell. Há prefetch de módulos por intenção e, em conexões adequadas, de Biblioteca e Comunidade após uma espera curta. A aba mantém conteúdo conhecido enquanto revalida e preserva até 100 posts paginados em memória.
- Feeds, descoberta e perfis usam cache limitado em memória. Consultas idênticas em andamento são deduplicadas, chaves de conta e filtro são independentes, mutações invalidam resultados pertinentes e o logout retira resultados da conta. Paginação descarta respostas de filtros obsoletos. Curtir e salvar dão resposta visual imediata, com trava de envio e reversão na falha.
- Cada card mede o tamanho da foto e pede miniatura ou feed. A leitura começa perto da área visível, mantém o espaço da imagem e usa decodificação assíncrona. Ampliações e vídeos completos carregam ao abrir. O cache de previews mantém até 72 entradas ou 24 MiB por instância do app, com validade de 30 s e descarte no logout. Blob URLs são revogados ao desmontar. As respostas continuam passando por autorização no backend e o bucket continua privado.
- Novas fotos de upload direto recebem WebP orientado e sem EXIF em 480, 1120 e 2560 px na maior dimensão. O derivado de feed anterior era 1440 px. A ampliação continua à disposição e os arquivos existentes continuam utilizáveis. O limite de upload continua sujeito à cota, ao formato e às dimensões aceitas.
- `GET /v1/me/clubs/summary` agrega somente clubes com associação ativa do usuário e retorna só dados de cartão. O ensaio com o papel restrito não precisou de novos grants. A sincronização da identidade usa leitura quando os atributos coincidem e preserva o upsert em cadastro ou mudança.
- A recuperação de falha de renderização mantém a navegação disponível nas rotas e apresenta um botão para carregar de novo. O gutter aproveita as áreas seguras laterais em orientação horizontal. Medidas locais via Performance API usam rótulos genéricos para API, imagem e aba, sem conteúdo, ids de usuários, tokens ou telemetria enviada.

## Comparativo

Uma rodada de laboratório por versão no Chrome emulado, viewport 390 × 844 e movimento reduzido. Vite local, Firebase Auth Emulator, PostgreSQL e armazenamento temporários. Foi aplicado atraso fixo de 125 ms a cada solicitação à API e usado o mesmo tipo de foto sintética. As quatro amostras de troca abaixo começam após abrir o Início e aquecer os módulos. Comparativo do bundle usa builds minificados conectados e todos os módulos JavaScript referenciados no HTML de entrada, com gzip aplicado a cada arquivo.

| Métrica | Antes | Depois | Resultado |
| --- | ---: | ---: | --- |
| LCP inicial da página de login, uma amostra local | 1.052 ms | 1.136 ms | Variação de 84 ms. Uma amostra não permite atribuir ganho ou regressão. LCP p75 em produção não medido. |
| INP p75 | Não medido | Não medido | Exige amostra representativa de sessões em aparelhos. |
| CLS observado no ensaio | 0,034 | 0,034 | Sem diferença nessa sequência. CLS p75 em produção não medido. |
| Troca Biblioteca → Comunidade, até o conteúdo do post, mediana | 214 ms | 61 ms | Cerca de 71% menos neste ensaio. |
| Troca até a foto aparecer, mediana | 415 ms | 115 ms | Cerca de 72% menos neste ensaio. |
| Downloads da foto nos quatro retornos | 8 / 2.007.000 bytes | 0 / 0 bytes | Foto reutilizada em memória. |
| Requisições à API nos quatro ciclos Biblioteca → Comunidade | 24 | 0 | Cache do feed, foto em memória e poll único. |
| JavaScript inicial, gzip | 237 kB | 169 kB | Redução de 29%. Rotas privadas carregam após validação. |
| Heap JavaScript após os quatro ciclos, leitura local do Chrome | 43,4 MB | 44,3 MB | Aproximação de uma amostra. Memória nativa, bitmaps decodificados e teste prolongado não medidos. |

A latência inicial de Cloud Run, o LCP/INP/CLS em produção e o custo por transferência dependem de tráfego real. Este ensaio não incluiu cold start do serviço, limitação de banda de operadora real, aparelho físico ou a primeira abertura da foto isolada do carregamento inicial da tela. Os dados de catálogo são interceptados no ensaio para não depender de um serviço externo.

## Reprodução

Rode `npm ci` e instale os navegadores com `npx playwright install chromium webkit`. Inicie `npm run dev:local` com um banco descartável. O script exige origens locais e cria uma conta e uma foto sintéticas no emulador. Use uma cópia limpa do commit base para comparar o antes com a mesma ferramenta.

```bash
RUN_MATRIX=1 npm run qa:mobile -- candidate chrome
RUN_MATRIX=1 npm run qa:mobile -- candidate webkit
```

O ensaio grava resultados em `.local-data/`. As variáveis `BENCH_APP_ORIGIN`, `BENCH_API_ORIGIN` e `BENCH_AUTH_ORIGIN` ajustam as portas. O comparativo foi executado com a base `40a6a3d` e a versão desta branch em ambientes separados.

## Validação executada

- `npm run check` com codecs de vídeo habilitados, 104 testes de frontend e 46 da API. Integração com PostgreSQL descartável, 91 testes. Firebase Auth Emulator, 2 testes. `npm audit --omit=dev --audit-level=high` passou.
- Playwright em Chromium e WebKit. Cinco abas em 320, 360, 375, 390, 393, 414, 430, 600, 768, 820, 1024 e 1366 px, mais 820 × 390 para rotação. O ensaio verifica transbordamento, aba ativa e erros JavaScript. Inclui foto sintética e repetição de abas com latência.
- Em Chrome e WebKit, usuário sem sessão, login restaurado após reabrir, reentrada na rota protegida, 15 viradas rápidas, marca de posição, capítulo nos dois sentidos, alternância páginas/rolagem, animação e retomada. Logout, outra conta, sessão desativada e reconexão sem exibir a conta anterior.
- `npm run mobile:sync` sincronizou os projetos Android e iOS com um build conectado de validação sem dados ou credenciais reais. Android e iOS nativos ainda exigem compilação e ensaio no ambiente apropriado. Os limites atuais e o checklist estão em [Staging e lojas](STAGING_E_LOJAS.md).

## Liberação

A nova rota exige publicar e verificar a API antes do site. As alterações usam tabelas e grants existentes. Antes do deploy, valide em staging o fluxo completo de upload direto e as cotas, as mídias já existentes, a exclusão do cache no logout e o retorno de um clube após perder associação. Liberação de produção e uso de recursos externos dependem da autorização do proprietário.
