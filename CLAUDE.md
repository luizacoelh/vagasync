@AGENTS.md

# VagaSync — guia para o Claude Code

Tracker de candidaturas com IA. Next.js 16 (App Router, `proxy.ts`), TypeScript, Tailwind, Prisma 7,
Auth.js (JWT), Gemini, Turso (prod) / SQLite (local), n8n self-hosted alimentando vagas via webhook.
Deploy na Vercel. Repo público: nunca commitar segredos nem `*.db`.

## Regras do projeto
- Git Flow + Conventional Commits. Nunca commitar na `main`; trabalhar em `feat/*`, `fix/*`, `chore/*`.
- Toda mudança relevante atualiza `ROADMAP.md`, `ARCHITECTURE.md` e/ou `DEPLOY.md`.
- Comunicação em português, direta e curta.
- Next 16: `proxy.ts` substitui `middleware.ts` (nunca criar os dois). Ler `node_modules/next/dist/docs/` antes de usar API nova.
- Rodar `npm run lint` e `npm run build` antes de dar algo como pronto.

## Banco de dados (regra mais importante)
- O schema só muda por migration em `prisma/migrations/`. Nunca `prisma db push` nem SQL solto em produção.
- Produção (Turso) só recebe migration via `npm run migrate:turso` (usa `scripts/apply-turso-migrations.mjs`:
  rastreia `_turso_migrations`, tem `--dry-run`, recusa `DROP TABLE`).
- Fluxo obrigatório: backup (Download SQLite File no painel Turso) → ensaio em cópia local → `--dry-run` →
  aplicar → `npm run check:turso`. Plano grátis só tem PITR de 24h.
- Preferir consultas somente leitura. Qualquer UPDATE/DELETE em produção: mostrar o SQL e esperar confirmação.
- `User.isOwner` é imutável pela UI/API; só muda por código/script. Não afrouxar `requireAdmin()` nem a proteção do owner.
- Scripts legados `fix-turso-job-table.mjs` e `sync-turso-schema.mjs` estão aposentados; não rodar.

## n8n
- Workflow exportado em `n8n-workflows/`; endpoint `/api/webhook/n8n` (header `x-webhook-secret`, comparação timing-safe).
- Vagas entram com status `MONITORADA` e aparecem em `/monitoradas`.
- Roda no GitHub Actions (`.github/workflows/n8n-vagas.yml`) a partir do JSON do repo; o agendamento do n8n local fica desligado.
- Nó "Montar vagas": manter o guard `if (!v.title || !v.url || v.description.length < 20) continue;`.
- Duplicata (mesma URL ou título + empresa de outra origem) é regra de `lib/jobDedup.ts`; o teto de 40 envios
  por rodada fica em "Separar novas", depois da checagem em lote. Detalhes em `docs/N8N_SETUP.md`.
- Alterar workflow em produção: exportar o JSON antes, mudar, versionar o JSON no repo.

## Segredos
- Nunca ler, imprimir ou colar `.env*`, tokens do Turso, `AUTH_SECRET`, `GEMINI_API_KEY` ou `N8N_WEBHOOK_SECRET`.
- Banco escolhido só por `DATABASE_TARGET` (`lib/prisma.ts`): sem ela, dev/build/start usam o SQLite local;
  `turso` só na Vercel (Production). Nunca definir `DATABASE_TARGET=turso` para rodar o app localmente.
- Credenciais do Turso ficam em `.env.turso` (o Next não carrega), lido só pelos scripts
  (`scripts/lib/turso-env.mjs`). `check:turso` usa só `TURSO_READONLY_AUTH_TOKEN`; escrita exige `DATABASE_TARGET=turso`.
- `set-admin.mjs` escreve no SQLite local; produção só com `--turso`.
- Testes: SQLite descartável (`DATABASE_URL=file:./test.db`); `NODE_ENV=test` recusa o Turso.

## Comandos
`npm run dev` · `npm run lint` · `npm test` · `npm run build` · `npm run check:turso` · `npm run migrate:turso -- --dry-run`
