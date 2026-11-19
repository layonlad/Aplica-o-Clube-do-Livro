# Integração da Biblioteca Gratuita e de Notícias

O PR 43 do Claude Code entregou as telas Coral. O adaptador em `src/literary/api.ts` conecta essas telas ao [contrato da API](literario/CONTRATO_FRONTEND.md). O documento anterior descrevia o contrato proposto antes da implementação do servidor.

O leitor recebe o EPUB autorizado em uma sessão autenticada. Ao adicionar a edição, a conta salva apenas o vínculo, com seu próprio progresso. A capa do catálogo é pública e o arquivo é servido pela API. Os links de edição externa abrem na fonte oficial.

As quatro abas da Comunidade continuam Feed, Clubes, Notícias e Debates. Notícias usa o agregador editorial e o botão Discussão abre a publicação correspondente com as interações existentes.
