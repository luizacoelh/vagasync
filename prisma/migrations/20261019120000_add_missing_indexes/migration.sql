-- Garante os índices únicos e o índice de Job.userId.
--
-- Idempotente (IF NOT EXISTS): num banco criado só pelas migrations eles já
-- existem e nada muda; num banco que os perdeu (o do Turso em produção estava
-- sem eles, sem violar nada — não há duplicatas), eles são recriados.
-- Se houvesse duplicatas, o CREATE UNIQUE INDEX falharia e a migration NÃO
-- seria registrada como aplicada — nada é apagado.
--
-- UserProfile.userId fica de fora de propósito: em produção a unicidade já
-- existe embutida na tabela (UNIQUE inline), e um segundo índice seria redundante.

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Job_userId_idx" ON "Job"("userId");
