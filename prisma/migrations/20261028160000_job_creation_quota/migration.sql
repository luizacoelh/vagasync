-- Cota de criação separada da IA. Duas linhas no máximo por usuário.
-- Janelas iniciadas no primeiro cadastro e renovadas após 60s/24h.
CREATE TABLE "JobCreationQuota" (
  "userId" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "minuteStart" INTEGER NOT NULL DEFAULT 0,
  "minuteCount" INTEGER NOT NULL DEFAULT 0,
  "dayStart" INTEGER NOT NULL DEFAULT 0,
  "dayCount" INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY ("userId", "channel"),
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
