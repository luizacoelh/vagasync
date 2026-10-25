-- Adiciona "differentials" ao modelo Job: diferenciais/desejáveis da vaga
-- (o que conta pontos mas não é obrigatório), extraídos pelo Gemini.
-- JSON stringificado (array), mesma convenção de requirements/technologies.
--
-- Opcional (NULL) para não exigir backfill: vagas antigas aparecem sem a seção.

-- AlterTable
ALTER TABLE "Job" ADD COLUMN "differentials" TEXT;
