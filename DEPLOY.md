# Deploy — VagaSync

Guia detalhado de deploy em produção (Vercel + Turso). Para visão geral do
projeto, ver [`README.md`](./README.md).

## Por que SQLite local não funciona em produção

O filesystem de funções serverless da Vercel é efêmero e, em muitos casos,
somente leitura fora de `/tmp`. Um arquivo SQLite local não persiste de forma
confiável entre requisições — cada invocação pode rodar numa instância
diferente. Por isso o banco de produção é o Turso (SQLite hospedado,
compatível com esse ambiente).

## 1. Criar o banco no Turso

Pode ser feito pela CLI ou pelo painel em https://app.turso.tech (o painel
funciona bem no Windows, sem precisar de WSL). Guarde a URL de conexão e o
token gerados — são `TURSO_DATABASE_URL` e `TURSO_AUTH_TOKEN`.

## 2. Aplicar as migrations no Turso

O `prisma migrate dev` não funciona diretamente contra o Turso (limitação
conhecida do Prisma com libSQL remoto). As migrations continuam sendo
geradas localmente, contra o SQLite local, como no dia a dia de
desenvolvimento — só a aplicação em produção é diferente.

Com `TURSO_DATABASE_URL` e `TURSO_AUTH_TOKEN` já preenchidas no seu `.env`:

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
| `TURSO_DATABASE_URL` | do passo 1 |
| `TURSO_AUTH_TOKEN` | do passo 1 |
| `AUTH_SECRET` | gere um valor **diferente** do de dev |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | do passo 3 |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | do app novo do passo 3 |
| `AUTH_TRUST_HOST` | `true` |
| `GEMINI_API_KEY` | sua chave do Gemini |
| `N8N_WEBHOOK_SECRET` / `N8N_TARGET_USER_ID` | opcional — só se for usar o webhook |

**Não** defina `DATABASE_URL` na Vercel — sua ausência, combinada com
`TURSO_DATABASE_URL` presente, é o que faz `lib/prisma.ts` escolher o
adapter do Turso automaticamente (só em `NODE_ENV=production`).

## 6. Deploy

Com as variáveis configuradas, qualquer push na branch de produção já builda
e publica. O `postinstall: prisma generate` no `package.json` garante que o
client do Prisma é gerado a cada deploy.

**Preview deployments (branches) não conseguem logar** — cada deployment de
Preview tem uma URL com hash aleatório, que não bate com nenhuma callback
URL cadastrada no Google/GitHub. Isso é esperado; teste login sempre no
domínio de Production.

## 7. Virar admin (uma vez, depois do primeiro login)

Não existe cadastro de admin pela interface de propósito — evita
autopromoção. Depois de logar pela primeira vez em produção:

```bash
node scripts/set-admin.mjs seu-email@exemplo.com
```

Com `TURSO_DATABASE_URL`/`TURSO_AUTH_TOKEN` preenchidos no `.env`, o script
detecta automaticamente que deve mexer no banco do Turso (produção), não no
SQLite local. Depois disso, `/admin` fica acessível, e outras contas podem
ser promovidas direto pelo painel.

## Sobre o tempo de execução da análise por IA

A chamada ao Gemini já levou entre 16s e 27s em teste. As rotas
`/api/analyze` e `/api/webhook/n8n` têm `export const maxDuration = 60` para
evitar timeout prematuro (504). Os limites exatos de duração variam por
plano da Vercel — confira em *Project Settings → Functions* antes de assumir
que 60s é suficiente no seu plano.

## Checklist antes de ativar o deploy

- [ ] Banco criado no Turso e migrations aplicadas (passos 1–2)
- [ ] Apps OAuth de produção criados com as URLs de callback corretas (passo 3)
- [ ] Projeto importado na Vercel (passo 4)
- [ ] Variáveis de ambiente configuradas na Vercel (passo 5)
- [ ] `.env` local nunca commitado (já garantido pelo `.gitignore`)
- [ ] Testado no domínio de Production, não num link de Preview
