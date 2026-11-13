# Publicação no projeto indicado

Projeto Google Cloud: `project-acb850f4-4bb8-45de-a84`.
Conta com acesso: `negocio.layon@gmail.com`.
Orçamento autorizado: até **R$ 30 por mês**. Após identificar o pré-pagamento de ativação do Google, o proprietário escolheu **seguir por uma alternativa gratuita**.

## Estado verificado

- Acesso à conta conectado na CLI Firebase.
- Projeto ativo e pertencente a uma organização Google Cloud.
- Firebase ativado com sucesso após o proprietário concluir a ativação inicial.
- App web `Clube do Livro` criado: `1:193866319464:web:6dfdecacaaef1a76ef9ddd`.
- Configuração pública do SDK obtida e preparada em `.env.production.local`, ignorado pelo Git. A URL da API ainda não foi definida.
- Login por e-mail/senha e Google habilitados com sucesso após aprovação explícita do proprietário.
- O faturamento Google exige pré-pagamento mínimo de R$ 200 via Pix. O proprietário optou por não seguir com essa ativação e usar uma alternativa gratuita para API e PostgreSQL.
- Nenhum serviço pago foi criado e a aplicação ainda não foi publicada neste projeto.
- Neon instalado e conectado. Projeto gratuito exclusivo `Clube do Livro` criado: `wandering-block-99253816`, região `aws-us-east-1`, PostgreSQL 17.
- Banco `clube_do_livro`, branch `production` (`br-super-term-bco4myiu`). A migration `001_identity_and_clubs.sql` foi aplicada em transação após aprovação explícita e conferida pelo checksum. As sete tabelas foram confirmadas; a credencial de execução da API ainda precisa ser criada com acesso restrito.
- Render CLI oficial v2.36.0 instalado localmente em `.local-data/tools/bin/render`, com o SHA-256 do pacote oficial verificado. A autorização da CLI foi aprovada pelo proprietário e ainda aguarda conclusão no navegador. Nenhum serviço Render foi criado.

O nome atual do projeto é `My First Project`. O ID é o identificador usado na implantação. O alias `production` em `.firebaserc` aponta exclusivamente para esse ID.

## Arquivos preparados

- `Dockerfile`: API em Node 24, execução sem root, porta 8080 e dependências de produção. Credenciais e arquivos locais são excluídos pelo `.dockerignore`.
- `firebase.production.json`: frontend estático com headers de privacidade e cache de assets versionados.
- `npm run build:production`: exige configuração pública Firebase do projeto correto e URL HTTPS real da API. Recusa emulador e força o modo conectado.
- `render.yaml`: API Docker em plano Free, sem disco ou serviço pago, com publicação automática desligada e variáveis de servidor separadas dos segredos.

Esses arquivos preparam a implantação; não criam serviços nem representam uma aplicação já publicada.

## Ordem de ativação

1. Ativação inicial e registro do app web concluídos.
2. Autenticação habilitada. Usar apenas a configuração pública do app no frontend.
3. Projeto Neon Free e estrutura inicial concluídos. Concluir autorização do Render e definir a credencial de banco restrita à execução. Não usar Render Postgres Free: esse banco expira após 30 dias.
4. Criar a API Render em **Free**, conforme `render.yaml`. Não habilitar plano pago, discos, pre-deploy pago, cobrança suplementar ou autoscaling. Se a conta já tiver cartão, verificar que os limites de gastos suplementares não permitem cobranças. Cloud Run/Cloud SQL não serão provisionados nessa alternativa.
5. Armazenar `DATABASE_URL` como segredo de ambiente e a identidade Firebase como arquivo secreto do Render em `/etc/secrets/firebase-service-account.json`. A identidade deve pertencer somente a este projeto e ter permissão mínima para ler o estado dos usuários ao validar sessões. A criação/transmissão da credencial depende da aprovação e das políticas de IAM da conta. Nunca versionar o arquivo nem colocá-lo no frontend.
6. Construir a imagem e executar migrations fora do Render Free com `node server/dist/migrate.js`, usando a credencial de migrations e conexão TLS com o Neon. O plano gratuito não fornece shell/jobs ou etapa paga de pre-deploy. A API usa uma credencial de banco de execução com privilégios restritos.
7. Implantar a API com `NODE_ENV=production`, `HOST=0.0.0.0`, `FIREBASE_PROJECT_ID`, `FRONTEND_ORIGIN` e o segredo `DATABASE_URL`. O endpoint de rede recebe requisições do navegador; as rotas privadas continuam exigindo ID token e associação ativa.
8. Configurar `.env.production.local` (ignorado pelo Git) com as variáveis públicas `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID` e `VITE_API_URL` real.
9. Executar `npm run build:production` e publicar com:

```bash
npx -y firebase-tools@latest deploy --only hosting --config firebase.production.json --project production --account negocio.layon@gmail.com
```

10. Autorizar o domínio do Hosting no Firebase Auth e testar cadastro/verificação, clube, convite e remoção com duas contas antes da liberação ao grupo.

## Limites da alternativa gratuita

Render Free pode suspender a API após 15 minutos de inatividade e demorar cerca de um minuto para retomar. O cliente aguarda até 75 segundos sem repetir automaticamente ações que alteram dados. O armazenamento persistente fica no Neon, não no disco efêmero da API. O plano tem limites mensais e pode suspender o serviço ao atingi-los; não há garantia de disponibilidade equivalente a um serviço pago.

Referências: [Render Free](https://render.com/docs/free), [Neon Free](https://neon.com/pricing). A publicação do Firebase Hosting depende da disponibilidade real da API/banco, conferida pelo build de produção.

Não migrar para um banco diferente ou publicar o protótipo demonstrativo como substituto do modo conectado.
