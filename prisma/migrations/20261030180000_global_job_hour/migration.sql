-- Teto global de cadastro manual: um contador por hora (unixepoch() / 3600),
-- somado nas últimas 24 horas. Tabela nova, sem tocar nas existentes.
CREATE TABLE "GlobalJobHour" (
  "hour" INTEGER NOT NULL PRIMARY KEY,
  "count" INTEGER NOT NULL DEFAULT 0
);
