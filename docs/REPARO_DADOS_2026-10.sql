-- REPARO DE DADOS (out/2026) — rode no SQL console do Turso, UM BLOCO POR VEZ,
-- conferindo o resultado esperado antes de seguir.
--
-- Contexto: quando o script antigo recriou a tabela Job (17/10/2026 03:03:16 UTC):
--   (1) as 49 vagas ficaram com appliedAt = '2026-10-17 03:03:16' (a data de candidatura se perdeu);
--   (2) o userId foi preenchido com o seu id em todas — inclusive na vaga de exemplo
--       ("Empresa Exemplo Tecnologia") que o João cadastrou.
-- NÃO é possível recuperar daqui: url, location e salary (ver docs/RECUPERACAO_TURSO.md).

-- ============ 1) PRÉVIA — vagas com a data "carimbada" pelo incidente (esperado: 49)
SELECT count(*) AS carimbadas FROM "Job" WHERE "appliedAt" = '2026-10-17 03:03:16';

-- ============ 2) Datas de candidatura voltam para a data de cadastro da vaga
-- É uma APROXIMAÇÃO: o formulário usa "hoje" como data de candidatura, então na
-- maioria das vagas as duas datas coincidem. Onde você tinha editado a data à
-- mão, ela fica igual à do cadastro. Só mexe nas vagas carimbadas.
UPDATE "Job" SET "appliedAt" = "createdAt" WHERE "appliedAt" = '2026-10-17 03:03:16';

-- ============ 3) PRÉVIA — vaga do João (esperado: 1 linha, 'Empresa Exemplo Tecnologia',
-- cadastrada 31 s depois do único uso de IA do João, em 29/09/2026 22:02:49)
SELECT "id", "company", "title", "userId", "createdAt" FROM "Job"
WHERE "id" = 'cmun83g5i000004jk59fkno96';

-- ============ 4) Devolve a vaga ao João (só atualiza se ainda estiver no seu usuário)
UPDATE "Job" SET "userId" = 'cmrr23cb6000004jrzggf8go5'
WHERE "id" = 'cmun83g5i000004jk59fkno96' AND "userId" = 'cmrqov1m10000dkfiatn0lpd4';

-- ============ 5) CONFERÊNCIA
-- esperado: 48 vagas no usuário cmrqov1m... (Luiza) e 1 em cmrr23cb... (João)
SELECT "userId", count(*) AS vagas FROM "Job" GROUP BY "userId";
-- esperado: 49 (cada vaga com a sua própria data) e nenhuma com o carimbo do incidente
SELECT count(DISTINCT "appliedAt") AS datas_distintas,
       sum("appliedAt" = '2026-10-17 03:03:16') AS ainda_carimbadas
FROM "Job";
