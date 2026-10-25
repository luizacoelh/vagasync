-- Adiciona "checklistDone" ao modelo Job: índices (JSON array de números) dos
-- itens de "checklist" que o usuário marcou como feitos. O checklist em si
-- continua sendo o array de strings gerado pela IA.
--
-- Opcional (NULL = nada marcado), sem backfill.

-- AlterTable
ALTER TABLE "Job" ADD COLUMN "checklistDone" TEXT;
