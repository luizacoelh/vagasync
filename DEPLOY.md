# Deploy — VagaSync

Guia detalhado de deploy em produção (Vercel + Turso). Para visão geral do
projeto, ver [`README.md`](./README.md).

## Por que SQLite local não funciona em produção

O filesystem de funções serverless da Vercel é efêmero e, em muitos casos,
somente leitura fora de `/tmp`. Um arquivo SQLite local não persiste de forma
confiável entre requisições — cada invocação pode rodar numa instância
diferente. Por isso o banco de produção é o Turso (SQLite hospedado,
compatível com esse ambiente).

## 0. Qual banco cada ambiente usa

### Publicação da proteção de cadastro (PR #37)

Aplicada em produção em 29/10/2026 após backup verificado e ensaio local.
`check:turso`: 0 erros e 1 aviso cosmético preexistente. Evidências em
`docs/AUDITORIA_ENDPOINTS_2026-10-29.md`.

A migration `20261028160000_job_creation_quota` é aditiva: cria uma tabela de
contadores, sem alterar/apagar vagas existentes. Aplicar **antes** de publicar
o código que a usa. Sem a tabela, os novos cadastros falham de forma fechada.

Fluxo obrigatório: baixar backup SQLite no Turso → ensaiar a migration numa
cópia local → `npm run migrate:turso -- --dry-run` → revisar e aplicar com
`npm run migrate:turso` → `npm run check:turso` → publicar app e validar.
Não basta dar merge e deixar a Vercel publicar antes da migration.

Contas já com 2.000 ou mais vagas não podem criar novas, mas conservam o
histórico e podem excluir. O consumo histórico anterior não é reconstruído:
contadores temporais começam no primeiro cadastro após a publicação.
Limpeza dos registros de teste é operação separada, com backup, SQL e contagens
aprovados; esta migration não executa limpeza. Reverter o app deixa a tabela
compatível, porém perde a proteção: não fazer rollback como forma de liberar cota.

A escolha é **explícita**, pela variável `DATABASE_TARGET` (`lib/prisma.ts`).
`NODE_ENV` não participa: `next start` local roda com `NODE_ENV=production`
e, antes, isso bastava para conectar no Turso de produção.

| Onde | `DATABASE_TARGET` | Banco |
|---|---|---|
| Vercel — Production | `turso` | Turso de produção |
| Vercel — Preview | não definir | nenhum (ver passo 6) |
| `npm run dev` / `build` / `start` local | não definir | SQLite de `DATABASE_URL` (`file:./dev.db`) |
| Testes | não definir; `NODE_ENV=test` recusa `turso` | SQLite descartável, ex.: `DATABASE_URL=file:./test.db` |
| Scripts de produção | `turso`, no `.env.turso` | Turso de produção |

Travas (o app não sobe): `turso` sem URL/token; valor desconhecido;
`DATABASE_URL` que não seja `file:`; e **deploy de Production sem
`DATABASE_TARGET=turso`** — como a checagem também roda no build, o deploy
falha e a Vercel mantém a versão anterior no ar. Sem `DATABASE_TARGET`, as
variáveis do Turso são ignoradas (com aviso no log).

### Credenciais do Turso na sua máquina: `.env.turso`

Ficam num arquivo próprio, **fora do `.env`**. O Next.js só carrega `.env`,
`.env.local`, `.env.development*` e `.env.production*`; o `.env.turso` é lido
apenas pelos scripts de `scripts/` (via `scripts/lib/turso-env.mjs`). Está no
`.gitignore` (regra `.env*`).

```bash
# .env.turso — nunca commitar
DATABASE_TARGET=turso                 # exigido pelos scripts que ESCREVEM
TURSO_DATABASE_URL=libsql://...
TURSO_AUTH_TOKEN=...                  # escrita: migrate:turso, set-admin --turso, recover-job-location
TURSO_READONLY_AUTH_TOKEN=...         # somente-leitura: check:turso
```

`check:turso` usa **só** `TURSO_READONLY_AUTH_TOKEN` — se ele faltar, o script
para; não cai no token de escrita. O token de escrita pode ficar fora do
arquivo e ser incluído só quando for migrar.

**Como confirmar que o local usa só o banco de desenvolvimento:**
- `npm run dev`/`start` sem `DATABASE_TARGET` mostram `[prisma] TURSO_DATABASE_URL
  ignorada...` se ainda houver variável do Turso no `.env` — tire-a de lá.
- O dashboard local mostra as vagas do `dev.db`, não as de produção.
- `npm run check:turso -- --file ./dev.db` confere o banco local sem credenciais.

## 1. Criar o banco no Turso

Pode ser feito pela CLI ou pelo painel em https://app.turso.tech (o painel
funciona bem no Windows, sem precisar de WSL). Guarde a URL de conexão e o
token gerados — são `TURSO_DATABASE_URL` e `TURSO_AUTH_TOKEN`. Gere também um
token **somente-leitura** para o `check:turso` (`TURSO_READONLY_AUTH_TOKEN`):
pela CLI, `turso db tokens create <banco> --read-only`; no painel, a opção de
permissão *Read-Only* ao criar o token.

**Região: banco e função juntos.** No Turso a região é do **grupo**, não do
banco (crie o grupo em *Create Group* e depois o banco dentro dele). A função
da Vercel deste projeto roda em São Paulo (`gru1`), então o banco fica no grupo
`sao-paulo` (`aws-sa-east-1`). Banco em outro continente custa ~175 ms em
**cada** consulta — foi o caso até out/2026 (banco `applylens` na Irlanda).

### Trocar o banco de região (feito em 25/10/2026: `applylens` → `vagasync`)
1. Pausar o n8n (`docker stop n8n`) para não entrar escrita no meio.
2. Backup: *Download SQLite File* do banco atual.
3. Criar o grupo na região nova e o banco com *Upload SQLite File* (nome novo:
   o nome do banco é único na conta).
4. Gerar os tokens do banco novo (completo e *Read-Only*) e pôr o read-only no
   `.env.turso` como `TURSO_NEW_DATABASE_URL`/`TURSO_NEW_READONLY_AUTH_TOKEN`.
   Valores sem aspas, parênteses ou espaços.
5. Comparar os dois bancos só lendo: estrutura (`sqlite_master`) e, por
   tabela, contagem + hash de todas as linhas. Só seguir com tudo idêntico.
6. Vercel (Production): trocar `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` e
   fazer **Redeploy** (variável nova só vale em deploy novo).
7. Conferir: páginas que consultam o banco devem responder no mesmo tempo que
   `/login`. Depois trocar as variáveis principais do `.env.turso`, rodar
   `npm run check:turso` e religar o n8n.
8. Manter o banco antigo alguns dias como reserva (rollback = voltar as
   variáveis na Vercel + redeploy); depois apagar.

## 2. Aplicar as migrations no Turso

O `prisma migrate dev` não funciona diretamente contra o Turso (limitação
conhecida do Prisma com libSQL remoto). As migrations continuam sendo
geradas localmente, contra o SQLite local, como no dia a dia de
desenvolvimento — só a aplicação em produção é diferente.

Com `DATABASE_TARGET=turso`, `TURSO_DATABASE_URL` e `TURSO_AUTH_TOKEN`
preenchidas no `.env.turso` (passo 0):

```bash
npm run migrate:turso -- --dry-run   # só mostra o que seria aplicado (não altera nada)
npm run migrate:turso                # aplica as migrations pendentes
```

Isso executa `scripts/apply-turso-migrations.mjs`, que lê cada
`prisma/migrations/*/migration.sql` em ordem cronológica e aplica statement
por statement usando `@libsql/client` — sem depender da CLI do Turso (que
exige WSL no Windows). O script **registra** o que já aplicou na tabela
`_turso_migrations` e só executa as migrations **pendentes**.

**Banco novo e vazio:** rode com `--allow-redefine` (as migrations iniciais
recriam tabelas, o que só é seguro sem dados).

**Banco que já existia** (criado antes do registro existir): o script se
recusa a rodar sem você dizer até onde ele já está atualizado:

```bash
npm run migrate:turso -- --baseline <pasta-da-ultima-migration-ja-aplicada>
```

O baseline marca tudo até essa pasta como aplicado, sem executar nada, e
aplica só as seguintes.

> **Por que isso existe (incidente de out/2026).** A versão anterior do script
> reexecutava *todas* as migrations a cada rodada e dizia ser "segura para
> rodar mais de uma vez". Não era: as migrations que recriam tabelas
> (`CREATE new_X → INSERT…SELECT → DROP → RENAME`) não dão erro numa segunda
> execução — reescrevem a tabela no formato antigo e apagam colunas e dados
> (ex.: `Job.userId`, `url`, `salary`). Por isso o script agora recusa rodar
> migrations com `DROP TABLE` sem `--allow-redefine`. Antes de qualquer
> migration que mexa em tabela com dados, confirme o backup (PITR do Turso:
> `docs/RECUPERACAO_TURSO.md`).

> Se uma migration adicionar um campo obrigatório numa tabela já populada, o
> SQLite rejeita a operação (não há valor padrão para linhas existentes).
> Dê um `DEFAULT` ao campo na própria migration. `scripts/fix-turso-job-table.mjs`
> e `scripts/sync-turso-schema.mjs` ficam como referência de correções
> pontuais, mas não são a rotina normal.

### 2.1 Rotina antes de mexer no banco de produção

O PITR do Turso no plano Free só volta **24 horas**. Quando algo dá errado, o
que salva é o que você fez *antes*. Sempre, nesta ordem:

1. **Backup.** Dashboard do Turso → seu banco → Overview → *Export Database →
   Download SQLite File*. Guarde em `backups/` (a pasta está no `.gitignore`;
   o repositório é público e o banco tem e-mails de usuários — **nunca** commite
   um `.db`).
2. **Ensaio numa cópia.** O script aceita um arquivo local no lugar do Turso
   (variáveis passadas na linha de comando têm prioridade sobre o `.env.turso`):
   ```bash
   DATABASE_TARGET=turso TURSO_DATABASE_URL=file:./backups/export.db TURSO_AUTH_TOKEN=x npm run migrate:turso -- --dry-run
   DATABASE_TARGET=turso TURSO_DATABASE_URL=file:./backups/export.db TURSO_AUTH_TOKEN=x npm run migrate:turso
   npm run check:turso -- --file ./backups/export.db
   ```
   Se algo falhar aqui, o banco de verdade não foi tocado.
3. **Aplicar no real:** `npm run migrate:turso -- --dry-run`, depois
   `npm run migrate:turso`, e por fim `npm run check:turso`.
4. **Regra de ouro: o schema só muda por migration.** Não altere tabelas pelo
   Drizzle Studio nem pelo SQL console. Se uma emergência exigir, registre o
   que foi feito numa migration em seguida e rode `npm run check:turso`.

`npm run check:turso` só **lê** o banco — todo comando é um `SELECT`, inclusive
a introspecção (`pragma_table_info()` etc.), então funciona com o token
somente-leitura (`TURSO_READONLY_AUTH_TOKEN`, o único que ele aceita) — e
compara o schema real com o que as migrations produzem: falta de
tabela/coluna/índice único é ERRO (sai com código 1); sobra de coluna, default
diferente ou FK ausente é AVISO. Ele existe porque o banco de produção divergiu
das migrations sem ninguém perceber (índices únicos ausentes, colunas fora do
schema). Rode antes de cada deploy que mexe em schema.

**Adotando no banco que já existe** (uma vez): o banco foi criado antes do
registro de migrations, então informe até onde ele já está atualizado e deixe
o script aplicar só o que falta:
```bash
npm run migrate:turso -- --baseline 20261013120000_add_user_owner
```

## 3. Criar as credenciais OAuth de produção

**Google** — reaproveita o mesmo app OAuth do dev, só adiciona uma segunda
URI autorizada (Google aceita múltiplas):
1. https://console.cloud.google.com/apis/credentials → o client já existente
2. Em "URIs de redirecionamento autorizados", adiciona:
   `https://SEU-DOMINIO/api/auth/callback/google`
3. Salva — pode levar alguns minutos a algumas horas para propagar

**GitHub** — GitHub só aceita **uma** callback URL por app, então crie um
**segundo** OAuth App só para produção:
1. https://github.com/settings/developers → "New OAuth App"
2. Homepage URL: `https://SEU-DOMINIO`
3. Authorization callback URL: `https://SEU-DOMINIO/api/auth/callback/github`
4. Use o Client ID/Secret **desse app novo** nas variáveis de produção (não
   reaproveita o de dev nesse caso)

Confirma o domínio real em *Vercel → Settings → Domains* antes de cadastrar
— use o domínio estável de produção, não a URL de um deployment específico
(que muda a cada deploy).

## 4. Criar o projeto na Vercel

- Importa o repositório em https://vercel.com/new
- Framework preset: Next.js (detectado automaticamente)

## 5. Variáveis de ambiente na Vercel

Em *Project Settings → Environment Variables*, ambiente **Production**:

| Variável | Valor |
|---|---|
| `DATABASE_TARGET` | `turso` |
| `TURSO_DATABASE_URL` | do passo 1 |
| `TURSO_AUTH_TOKEN` | do passo 1 (o de escrita — o app grava) |
| `AUTH_SECRET` | gere um valor **diferente** do de dev |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | do passo 3 |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | do app novo do passo 3 |
| `AUTH_TRUST_HOST` | `true` |
| `GEMINI_API_KEY` | sua chave do Gemini |
| `N8N_WEBHOOK_SECRET` / `N8N_TARGET_USER_ID` | opcional — só se for usar o webhook |

**Não** defina `DATABASE_URL` na Vercel. Quem escolhe o Turso é
`DATABASE_TARGET=turso`; sem ela o deploy de Production falha de propósito
(passo 0). Marque essas três variáveis **só** em Production: não as replique em
Preview nem em Development.

## 6. Deploy

Com as variáveis configuradas, qualquer push na branch de produção já builda
e publica. O `postinstall: prisma generate` no `package.json` garante que o
client do Prisma é gerado a cada deploy.

**Preview deployments (branches) não conseguem logar** — cada deployment de
Preview tem uma URL com hash aleatório, que não bate com nenhuma callback
URL cadastrada no Google/GitHub. Isso é esperado; teste login sempre no
domínio de Production.

**Preview não usa o banco de produção.** Sem `DATABASE_TARGET`/credenciais do
Turso em Preview, o deploy builda mas as páginas que consultam o banco dão
erro. Isso é intencional: antes, se as variáveis do Turso estivessem marcadas
também para Preview, todo push de branch publicava um deploy lendo e
escrevendo em produção. Se um dia quiser Preview funcional, crie um banco
Turso separado e use as credenciais dele (com `DATABASE_TARGET=turso`) só em
Preview.

## 7. Virar admin (uma vez, depois do primeiro login)

Não existe cadastro de admin pela interface de propósito — evita
autopromoção. Depois de logar pela primeira vez em produção:

```bash
node scripts/set-admin.mjs seu-email@exemplo.com --turso
```

O `--turso` é obrigatório para mexer em produção e exige o `.env.turso` com
`DATABASE_TARGET=turso` (passo 0). Sem a flag, o script escreve no SQLite
local, mesmo que haja variáveis do Turso no ambiente. Depois disso, `/admin`
fica acessível, e outras contas podem ser promovidas direto pelo painel.

## Sobre o tempo de execução da análise por IA

A chamada ao Gemini já levou entre 16s e 27s em teste. As rotas
`/api/analyze` e `/api/webhook/n8n` têm `export const maxDuration = 60` para
evitar timeout prematuro (504). Os limites exatos de duração variam por
plano da Vercel — confira em *Project Settings → Functions* antes de assumir
que 60s é suficiente no seu plano.

## Migration antes do deploy

Código que usa tabela nova só entra na `main` depois da migration aplicada no
Turso (seção 2.1). A Vercel publica a `main` sozinha: no PR #37 o cadastro falhou
até a tabela existir. Sem `GlobalJobHour`, o cadastro manual (`/api/jobs`,
`createJob`), a análise pelo site (`/api/analyze`) e o relatório de volume
respondem 500. O n8n não depende dela.

## Proteção da main

A Vercel publica toda alteração na `main`, então a regra `Proteger main` no GitHub
(`node scripts/github-protect-main.mjs`) exige PR com os dois jobs do CI verdes e
branch em dia, e bloqueia force push e exclusão da branch. Não há exceção nem
aprovação humana obrigatória, e `scripts/github-pr.mjs` continua fazendo o merge.
Numa emergência, ajustar em Settings > Rules > Rulesets. Segredo enviado por
engano continua exposto mesmo com a regra: trocar o segredo, não só apagar o commit.

## Espaço do banco no Turso

Apagar muitas linhas não reduz o arquivo: as páginas ficam livres e são
reaproveitadas pelas próximas gravações. Para ver, `PRAGMA page_count` e
`PRAGMA freelist_count` (multiplique por 4096 bytes). O Turso recusa `VACUUM`
pela API (`SQL not allowed statement`, testado em 30/10/2026), então devolver o
espaço exigiria recriar o banco a partir de um dump. Não vale fazer isso só por
causa das ~253 MB livres do incidente de 28/10.

## Checklist antes de ativar o deploy

- [ ] Banco criado no Turso e migrations aplicadas (passos 1–2)
- [ ] Apps OAuth de produção criados com as URLs de callback corretas (passo 3)
- [ ] Projeto importado na Vercel (passo 4)
- [ ] Variáveis de ambiente configuradas na Vercel (passo 5), incluindo
      `DATABASE_TARGET=turso` — só em Production
- [ ] Credenciais do Turso só no `.env.turso`, nunca no `.env` (passo 0)
- [ ] `.env*` local nunca commitado (já garantido pelo `.gitignore`)
- [ ] Testado no domínio de Production, não num link de Preview
