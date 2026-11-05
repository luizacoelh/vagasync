-- Amostra das vagas monitoradas para contas novas: horas desde a criação da
-- conta em que /monitoradas mostra as vagas do robô (0 desliga). Editável em /admin.
ALTER TABLE "AppSettings" ADD COLUMN "monitoredTrialHours" INTEGER NOT NULL DEFAULT 24;
