-- Limites do site inteiro editáveis em /admin, sem deploy. Os padrões mantêm os
-- valores que estavam no código. O índice serve à contagem de IA em 24h.
ALTER TABLE "AppSettings" ADD COLUMN "newAccountsPerDay" INTEGER NOT NULL DEFAULT 20;
ALTER TABLE "AppSettings" ADD COLUMN "globalManualJobsPerDay" INTEGER NOT NULL DEFAULT 500;
ALTER TABLE "AppSettings" ADD COLUMN "globalAiPerDay" INTEGER NOT NULL DEFAULT 500;

CREATE INDEX "AiUsage_action_createdAt_idx" ON "AiUsage"("action", "createdAt");
