-- Migration: adiciona status MONITORADA ao enum JobStatus
-- Turso/libSQL não tem ALTER TYPE como Postgres — o enum é validado
-- no nível da aplicação (Prisma), não no banco. Para SQLite/libSQL,
-- basta rodar: npx prisma generate (para atualizar o client)
-- e npx prisma db push (para sincronizar o schema).
--
-- NÃO é necessário SQL manual neste caso.
-- Ver instruções em MIGRATION_GUIDE.md

SELECT 'Migration aplicada via prisma db push — ver instruções abaixo' as info;
