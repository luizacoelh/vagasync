-- Adiciona os campos de origem e análise da IA ao modelo Job.
--
-- "source"           diferencia vagas manuais das coletadas pelo n8n
--                    (valores esperados: "manual" | "n8n"; NULL = legado)
-- "recruiterProfile" perfil do recrutador inferido pelo Gemini (JSON)
-- "skillsToStudy"    habilidades para estudar sugeridas pelo Gemini (JSON array)
--
-- Todos os campos são opcionais (NULL) para garantir compatibilidade com
-- registros existentes e não exigir backfill.
--
-- Idempotente no Turso: apply-turso-migrations.mjs ignora o erro
-- "duplicate column" quando já foram aplicados à mão — ver linha ~202 do script.

-- AlterTable
ALTER TABLE "Job" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'manual';

-- AlterTable
ALTER TABLE "Job" ADD COLUMN "recruiterProfile" TEXT;

-- AlterTable
ALTER TABLE "Job" ADD COLUMN "skillsToStudy" TEXT;
