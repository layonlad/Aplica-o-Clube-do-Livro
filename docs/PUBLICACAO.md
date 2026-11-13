# Publicação no projeto indicado

Projeto Google Cloud: `project-acb850f4-4bb8-45de-a84`.
Conta com acesso: `negocio.layon@gmail.com`.
Orçamento autorizado: até **R$ 30 por mês**.

## Estado verificado

- Acesso à conta conectado na CLI Firebase.
- Projeto ativo e pertencente a uma organização Google Cloud.
- O projeto ainda não possui Firebase; a tentativa `projects:addfirebase` retornou 403.
- As permissões `firebase.projects.update`, `resourcemanager.projects.get` e `serviceusage.services.enable` estão presentes. A ativação inicial/aceitação de termos deve ser verificada no console da conta.
- O faturamento está desativado. Nenhum serviço pago foi criado, e a aplicação ainda não foi publicada neste projeto.

O nome atual do projeto é `My First Project`. O ID é o identificador usado na implantação. O alias `production` em `.firebaserc` aponta exclusivamente para esse ID.

## Arquivos preparados

- `Dockerfile`: API em Node 24, execução sem root, porta 8080 e dependências de produção. Credenciais e arquivos locais são excluídos pelo `.dockerignore`.
- `firebase.production.json`: frontend estático com headers de privacidade e cache de assets versionados.
- `npm run build:production`: exige configuração pública Firebase do projeto correto e URL HTTPS real da API. Recusa emulador e força o modo conectado.

Esses arquivos preparam a implantação; não criam serviços nem representam uma aplicação já publicada.

## Ordem de ativação

1. Concluir a ativação inicial do Firebase nessa conta: https://console.firebase.google.com/?forceCheckTos=true . Aceitação de termos contratuais depende do proprietário.
2. Adicionar Firebase ao projeto existente, criar um app web e habilitar autenticação por e-mail e Google. Usar apenas a configuração pública do app no frontend.
3. Definir o PostgreSQL e a API dentro do orçamento. Cloud SQL tem cobrança contínua e não deve ser criado sem verificar o custo completo. Uma alternativa a avaliar é PostgreSQL externo com plano gratuito e Cloud Run com escala mínima zero. O banco externo precisa de conta/projeto próprio e TLS validado.
4. Habilitar faturamento quando necessário. Alertas de orçamento do Google não são um teto rígido de cobrança; limites de instâncias e quotas ajudam a controlar consumo, mas não garantem o valor mensal máximo. A arquitetura precisa respeitar os R$ 30 autorizados.
5. Guardar `DATABASE_URL` em Secret Manager, usar identidade própria da API com permissões mínimas para verificar usuários Firebase e acessar somente esse segredo. Não gerar chaves privadas no frontend.
6. Construir a imagem e executar migrations como tarefa separada: `node server/dist/migrate.js`, com credencial de migrations. A API usa uma credencial de banco de execução com privilégios restritos.
7. Implantar a API com `NODE_ENV=production`, `HOST=0.0.0.0`, `FIREBASE_PROJECT_ID`, `FRONTEND_ORIGIN` e o segredo `DATABASE_URL`. O endpoint de rede recebe requisições do navegador; as rotas privadas continuam exigindo ID token e associação ativa.
8. Configurar `.env.production.local` (ignorado pelo Git) com as variáveis públicas `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID` e `VITE_API_URL` real.
9. Executar `npm run build:production` e publicar com:

```bash
npx -y firebase-tools@latest deploy --only hosting --config firebase.production.json --project production --account negocio.layon@gmail.com
```

10. Autorizar o domínio do Hosting no Firebase Auth e testar cadastro/verificação, clube, convite e remoção com duas contas antes da liberação ao grupo.

Não migrar para um banco diferente ou publicar o protótipo demonstrativo como substituto do modo conectado.
