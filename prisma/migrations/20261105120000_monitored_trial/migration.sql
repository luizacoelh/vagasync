-- Amostra das vagas monitoradas para contas novas: horas desde a criação da
-- conta em que /monitoradas mostra as vagas do robô (0 desliga). Editável em /admin.
ALTER TABLE "AppSettings" ADD COLUMN "monitoredTrialHours" INTEGER NOT NULL DEFAULT 24;

-- Leitura da amostra: vagas do robô da conta-alvo nos últimos dias.
CREATE INDEX "Job_userId_source_createdAt_idx" ON "Job"("userId", "source", "createdAt");
