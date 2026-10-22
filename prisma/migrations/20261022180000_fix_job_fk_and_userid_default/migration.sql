-- Reconstrói a tabela Job para corrigir dois problemas deixados pelo reparo
-- manual de out/2026 (scripts/fix-turso-job-table.mjs, já aposentado):
--
--   1. DEFAULT legado em userId: 'cmrps1nmz0000cgfi88x4ylo4'
--      Esse id não existe em User. Em produção nunca causou problema porque o
--      app sempre fornece userId explicitamente; mas é uma bomba silenciosa caso
--      alguém insira uma vaga sem userId (vai criar uma vaga órfã invisível em
--      vez de falhar ruidosamente).
--
--   2. FK Job.userId → User(id) ON DELETE CASCADE está AUSENTE no Turso.
--      Sem ela, apagar um User deixa vagas órfãs para sempre. Hoje o app não
--      expõe deleção de usuário, então o risco é baixo — mas a integridade
--      referencial deve ser garantida pelo banco, não pelo app.
--
-- ⚠️  REQUER --allow-redefine: usa DROP TABLE internamente (padrão Prisma para
--     mudanças de coluna que SQLite não suporta via ALTER COLUMN).
--
-- Fluxo obrigatório antes de aplicar em produção:
--   1. Baixar backup no painel Turso (Database → Backups → Download SQLite File)
--   2. Testar nesta cópia: npm run migrate:turso -- --allow-redefine --file ./backup.db
--   3. Conferir: npm run check:turso -- --file ./backup.db  (deve zerar os 2 avisos)
--   4. Aplicar em produção: npm run migrate:turso -- --allow-redefine
--   5. Confirmar: npm run check:turso  (deve zerar os 2 avisos em produção)

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_Job" (
    "id"              TEXT     NOT NULL PRIMARY KEY,
    "userId"          TEXT     NOT NULL,
    "company"         TEXT     NOT NULL,
    "title"           TEXT     NOT NULL,
    "description"     TEXT     NOT NULL,
    "status"          TEXT     NOT NULL DEFAULT 'APLICADA',
    "url"             TEXT,
    "location"        TEXT     NOT NULL DEFAULT 'NAO_INFORMADO',
    "salary"          TEXT,
    "appliedAt"       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summary"         TEXT,
    "requirements"    TEXT,
    "technologies"    TEXT,
    "questions"       TEXT,
    "checklist"       TEXT,
    "source"          TEXT     NOT NULL DEFAULT 'manual',
    "recruiterProfile" TEXT,
    "skillsToStudy"   TEXT,
    "createdAt"       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Job_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_Job" (
    "id", "userId", "company", "title", "description", "status",
    "url", "location", "salary", "appliedAt", "summary", "requirements",
    "technologies", "questions", "checklist", "source", "recruiterProfile",
    "skillsToStudy", "createdAt"
)
SELECT
    "id", "userId", "company", "title", "description", "status",
    "url", "location", "salary", "appliedAt", "summary", "requirements",
    "technologies", "questions", "checklist", "source", "recruiterProfile",
    "skillsToStudy", "createdAt"
FROM "Job";

DROP TABLE "Job";
ALTER TABLE "new_Job" RENAME TO "Job";

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Recriar índice (DROP TABLE apaga junto)
CREATE INDEX "Job_userId_idx" ON "Job"("userId");
