# Notificações em tempo real

Aprovado pelo dono em 21/11/2026. Entrega o item 1 de [PENDENCIAS_BACKEND.md](PENDENCIAS_BACKEND.md) sem mudar os limites da API.

## Por que não usar espera longa ou conexões abertas

- A API roda no Cloud Run com no máximo **uma instância e concorrência 2** (`infra/google/config.json`).
- O chat e a rota `/me/notifications/sync` já dividem a **única** vaga de espera do servidor (`server/src/long-poll.ts`). As demais pessoas recebem a resposta na hora e tentam de novo em 10 s.
- Manter conexões abertas para cada pessoa exige subir a concorrência e deixa a instância cobrando o tempo todo. A estimativa é de R$ 250 a 300 por mês, acima do orçamento de R$ 70.
- Mais de uma instância também exigiria um canal entre elas.

## Como funciona

```
INSERT/UPDATE/DELETE em notifications
  └─ trigger por comando (migration 024) ─► notification_signals(user_id, version++)
API: resposta de qualquer escrita, fim do despachante de push ou chamada do executor (15 min)
  └─ createSignalPublisher.flush() ─► Firestore clube-chat/notificationSignals/{firebase_uid} = { v }
App: onSnapshot no próprio documento
  └─ versão mudou ─► GET /me/notifications/unread (e a primeira página, se a central estiver aberta)
```

1. **Banco.** Três triggers por comando (inserção, atualização relevante e exclusão de aviso não lido) somam 1 à versão de cada destinatário afetado.
   - Um lote de 200 avisos gera uma atualização por pessoa.
   - Atualizações relevantes são leitura, aviso reagrupado e novo autor.
   - As funções são `SECURITY DEFINER`, então o executor restrito e a API continuam criando avisos sem permissão nova.
2. **Publicação.** A API lê a fila indexada (`version > published`), grava em lotes de até 400 documentos no Firestore e registra o que publicou.
   - Uma publicação por vez. Uma chamada durante a publicação gera só mais uma rodada.
   - Se o Firestore falhar, nada se perde: a próxima escrita ou o executor tenta de novo, já com a versão mais nova.
3. **Firestore.** O documento guarda só `{ v: número }`, sem nome, texto, clube ou alvo.
   - A regra em `firestore.chat.rules` permite apenas `get` do próprio `uid`, com e-mail verificado.
   - Ninguém lista a coleção nem escreve nela pelo app. O restante do banco do chat continua fechado.
4. **App** (`src/notifications/signal.ts` e `store.ts`):
   - O SDK do Firestore (cerca de 170 KB) só carrega com o recurso ligado e depois que a tela abriu.
   - Com o sinal ativo, a consulta periódica passa de 30 s para uma conferência a cada 5 min.
   - Se o sinal cair, volta a consultar a cada 30 s e religa quando o app volta ao primeiro plano.
   - Quando a versão muda sem o contador subir, por exemplo uma leitura em outro aparelho, a primeira página aberta é relida.
   - Troca de conta desliga a escuta anterior e ignora avisos atrasados dela.

## Como ligar

O recurso fica **desligado por padrão** nos dois lados:

| Onde | Variável |
| --- | --- |
| API (Cloud Run) | `NOTIFICATION_SIGNALS_ENABLED=true` |
| Build do site | `VITE_NOTIFICATION_SIGNALS=true` |

Ordem para produção. Cada passo depende da autorização do dono.

1. Aplicar a migration 024 e, como dono do banco, `server/ops/runtime-grants.sql`, que dá à API `SELECT` e `UPDATE(published)` em `notification_signals`.
2. Publicar as regras do Firestore do banco `clube-chat` (`firestore.chat.rules`).
3. Ligar `NOTIFICATION_SIGNALS_ENABLED` na API. A conta de serviço da API já grava nesse banco por causa do chat.
4. Gerar o site com `VITE_NOTIFICATION_SIGNALS=true`.

Com o passo 3 sem o 4, a API publica sinais que ninguém escuta, e o custo é só de gravação. Com o 4 sem o 3, o app escuta um documento que não muda e mantém a conferência de 5 min. Por isso o passo 3 vem antes.

No Staging local (`npm run staging`) e no ensaio do chat (`npm run staging:chat`), tudo já vem ligado no emulador do Firestore.

## Custo estimado

Preços do Firestore Standard, sem contar a cota gratuita:

- **Gravações:** uma por pessoa a cada rodada de publicação com mudança. Várias mudanças seguidas viram uma só.
- **Leituras:** uma por mudança recebida, mais uma a cada abertura da escuta.
- **Exemplo:** 1.000 pessoas ativas com 20 avisos por dia dão cerca de 20 mil gravações e 25 mil leituras por dia. Isso fica em torno de US$ 0,05 por dia, ou R$ 8 por mês.
- **Economia:** uma aba visível hoje faz cerca de 120 chamadas por hora à API. Com o sinal, faz 12 conferências por hora mais uma chamada por mudança. Isso deixa a instância e o Cloud SQL dormirem mais.

Acompanhe leituras e gravações do banco `clube-chat` no console junto com o custo do chat.

## Testes

- `server/test/notification-signals.integration.test.ts`:
  - um lote vira uma versão por pessoa, e só `uid` e `version` saem do servidor;
  - leitura pela API publica na resposta;
  - reagrupamento e exclusão avisam, e exclusão de aviso já lido não avisa;
  - falha no Firestore não perde o sinal;
  - não há publicação em paralelo;
  - um papel sem acesso à tabela cria avisos, mas não lê nem forja sinais.
- `src/notifications/store.test.ts`:
  - consulta só quando a versão muda e espaça a conferência para 5 min;
  - relê a página quando a leitura acontece em outro aparelho;
  - volta a consultar a cada 30 s quando o sinal cai e religa no primeiro plano;
  - na troca de conta, desliga o sinal anterior.
- Regras conferidas no emulador do Firestore:
  - a dona lê o próprio sinal;
  - ficam bloqueados e-mail não verificado, outra pessoa, visitante, listagem, gravação pelo app e o restante do chat.
- Ponta a ponta no emulador: Postgres, trigger, publicação real pelo `firebase-admin` e leitura com o token da dona.
