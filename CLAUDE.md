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
- Nó Filter de "últimas 2h": "Always Output Data" deve ficar DESLIGADO. Nó Code: manter o guard `if (!title || !link) continue;`.
- Alterar workflow em produção: exportar o JSON antes, mudar, versionar o JSON no repo.

## Segredos
- Nunca ler, imprimir ou colar `.env*`, tokens do Turso, `AUTH_SECRET`, `GEMINI_API_KEY` ou `N8N_WEBHOOK_SECRET`.
- O `.env` local usa SQLite local. O token de escrita do Turso fica fora do repo (ver `docs/CLAUDE_CODE.md`).

## Comandos
`npm run dev` · `npm run lint` · `npm run build` · `npm run check:turso` · `npm run migrate:turso -- --dry-run`
