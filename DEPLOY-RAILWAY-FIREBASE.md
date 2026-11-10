# Implantação do CMTO-VI — Railway + PostgreSQL + Firebase (etapa inicial)

## O que esta versão prepara

- Um único serviço Railway executa a API Express e serve o frontend React/Vite compilado.
- PostgreSQL do Railway será o banco de produção.
- Prisma foi configurado para PostgreSQL.
- O SQLite original `backend/prisma/dev.db` foi mantido apenas como fonte local para a migração; ele não é copiado para a imagem Docker.
- Um cliente Prisma auxiliar lê o SQLite sem alterá-lo e copia os registros para o PostgreSQL, preservando IDs e relações.
- Firebase Storage/FCM ficam para a próxima etapa. Não há integração Firebase ativa nesta versão.

## Antes de começar — segurança dos dados

1. Faça uma cópia offline de `backend/prisma/dev.db` e mantenha-a guardada. Não trabalhe sobre a única cópia.
2. O arquivo SQLite contém dados pessoais de estudantes. Não o envie ao GitHub, não o coloque no Firebase público e não o compartilhe em links públicos.
3. O arquivo `.env` original não foi incluído. Gere um `JWT_SECRET` novo para produção e cadastre segredos somente nas variáveis do Railway.
4. Não execute `db:seed` nem `db:reset` em produção.
5. Não faça a troca para produção até conferir as contagens e testar o sistema.

## 1. Criar os serviços no Railway

1. Crie um projeto no Railway.
2. Adicione um serviço **PostgreSQL**.
3. Adicione o repositório do projeto como serviço, com o `Dockerfile` na raiz.
4. No serviço da aplicação, configure `DATABASE_URL` usando a referência da URL privada do PostgreSQL do mesmo projeto. Não use URL pública se a conexão privada estiver disponível.
5. Configure também `NODE_ENV=production`, `JWT_SECRET` (segredo aleatório forte, novo), `JWT_EXPIRES_IN=7d` e `FRONTEND_URL` com o domínio público da aplicação. O Railway injeta `PORT`.
6. O `railway.toml` configura o health check em `/api/health`.

## 2. Gerar a migration inicial (uma única vez)

No computador de desenvolvimento, com Node.js instalado, abra um terminal na pasta `backend` e execute:

```bash
npm ci
npm run db:prepare-migration
```

O comando cria `backend/prisma/migrations/0001_init/migration.sql` a partir do schema PostgreSQL atual. Revise o arquivo e versione a pasta `backend/prisma/migrations` no Git. **Não gere novamente a migration inicial depois que ela tiver sido aplicada em produção.** Para mudanças futuras no banco, crie migrations novas com `prisma migrate dev` em ambiente de desenvolvimento e versione-as.

Depois de versionar a migration, faça o deploy no Railway. O comando de inicialização do container executa `prisma migrate deploy` antes de iniciar a API.

## 3. Gerar o leitor SQLite auxiliar

Na pasta `backend`, execute:

```bash
npm run db:generate:sqlite-source
```

Isso gera o cliente auxiliar em `backend/src/generated/sqlite-client`. A pasta gerada é ignorada pelo Git e pode ser recriada pelo comando.

## 4. Copiar os dados para o PostgreSQL

Execute a migração a partir do computador que contém o `dev.db`, apontando `DATABASE_URL` para o PostgreSQL do Railway e `SQLITE_SOURCE_URL` para o arquivo local. Exemplo em PowerShell, dentro de `backend`:

```powershell
$env:DATABASE_URL = "COLE_A_URL_PRIVADA_DO_POSTGRESQL"
$env:SQLITE_SOURCE_URL = "file:./dev.db"
npm run db:migrate:copy
```

Atenção: neste pacote o banco principal está em `backend/prisma/dev.db`. Portanto, para executar a partir da pasta `backend`, use:

```powershell
$env:SQLITE_SOURCE_URL = "file:./dev.db"
```

Se o Prisma não localizar o arquivo no seu ambiente, use o caminho absoluto do arquivo `backend/prisma/dev.db` no formato `file:C:/caminho/do/projeto/backend/prisma/dev.db`.

O script:
- confere se as 19 tabelas do PostgreSQL estão vazias;
- cancela se encontrar registros no destino, sem sobrescrevê-los;
- copia em ordem compatível com as chaves estrangeiras, em uma transação;
- preserva os IDs originais e confere a quantidade final de registros por tabela;
- não apaga nem modifica o SQLite.

Se houver erro, não tente repetir às cegas. Verifique se a transação foi revertida e se o banco de destino continua vazio antes de executar novamente.

## 5. Testes obrigatórios antes de liberar o endereço

- Acesse `/api/health` e confirme `status: ok`.
- Teste login com usuários existentes (senhas são mantidas por meio dos hashes já armazenados).
- Confira permissões por perfil e acesso às turmas.
- Confira alunos, turmas, ocorrências/TMD, elogios, TAC, controle diário, notificações, histórico disciplinar, relatórios e exportações.
- Compare os totais exibidos no sistema com os totais da migração.
- Faça backup do PostgreSQL e teste o procedimento de restauração.

## 6. Firebase — próxima etapa

Firebase não foi conectado nesta entrega para evitar alterações não testadas no fluxo de arquivos e autenticação. A integração recomendada é Firebase Admin SDK no backend para Storage privado e, depois, Firebase Cloud Messaging para notificações push. A autorização deve continuar sendo validada pela API/usuário do CMTO-VI; não tornar arquivos de estudantes públicos.

## Variáveis principais

| Variável | Uso |
|---|---|
| `DATABASE_URL` | Conexão PostgreSQL do Railway |
| `JWT_SECRET` | Assinatura dos tokens JWT (novo segredo em produção) |
| `JWT_EXPIRES_IN` | Validade dos tokens |
| `NODE_ENV` | `production` no Railway |
| `PORT` | Porta fornecida pelo Railway |
| `FRONTEND_URL` | URL pública usada na geração de convites |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Envio de e-mails, se utilizado |
| `SQLITE_SOURCE_URL` | Somente para executar a migração local do SQLite |

`SQLITE_SOURCE_URL` não deve ser configurada no serviço de produção depois da migração.
