import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaLibSql } from "@prisma/adapter-libsql";

// Este projeto usa DOIS drivers de banco dependendo do ambiente:
//
// - Local / desenvolvimento: SQLite via better-sqlite3 (arquivo local, rápido, zero custo)
// - Produção (Vercel): libSQL via Turso (mesmo SQLite por baixo, mas hospedado)
//
// IMPORTANTE — globalForPrisma em TODOS os ambientes (incluindo produção):
// Em serverless (Vercel), cada função pode ser reutilizada entre requisições
// dentro da mesma instância quente ("warm"). Sem o globalThis, cada request
// criaria um novo PrismaClient e abriria uma nova conexão HTTP ao Turso —
// esse cold start de conexão era a principal causa do skeleton aparecer por
// 800ms+ em produção, mesmo com JWT e Promise.all já aplicados.
// Com o cache no globalThis, a conexão é reutilizada enquanto a função
// permanecer quente — que é o comportamento esperado e documentado pela
// própria Prisma para ambientes serverless.
//
// ESCOLHA DO BANCO — sempre explícita, via DATABASE_TARGET:
// - "turso": produção. Só a Vercel (Production) define isso. Exige
//   TURSO_DATABASE_URL e TURSO_AUTH_TOKEN; sem elas o app não sobe.
// - ausente ou "sqlite": SQLite local em DATABASE_URL (precisa ser "file:").
//   Variáveis do Turso que estejam no ambiente são IGNORADAS.
// NODE_ENV não participa da escolha: `next start` local roda com
// NODE_ENV=production e, antes, isso bastava para conectar no Turso.
function createPrismaClient(): PrismaClient {
  const target = process.env.DATABASE_TARGET?.trim() || "sqlite";

  if (target === "turso") {
    if (process.env.NODE_ENV === "test") {
      throw new Error("DATABASE_TARGET=turso não é permitido em testes. Use um SQLite descartável.");
    }
    const tursoUrl = process.env.TURSO_DATABASE_URL;
    const tursoToken = process.env.TURSO_AUTH_TOKEN;
    if (!tursoUrl || !tursoToken) {
      throw new Error("DATABASE_TARGET=turso exige TURSO_DATABASE_URL e TURSO_AUTH_TOKEN.");
    }
    const adapter = new PrismaLibSql({ url: tursoUrl, authToken: tursoToken });
    return new PrismaClient({ adapter });
  }

  if (target !== "sqlite") {
    throw new Error(`DATABASE_TARGET inválido: "${target}". Use "sqlite" ou "turso".`);
  }

  // Falha segura: um deploy de produção sem a variável não pode cair num
  // SQLite vazio em silêncio. Como a variável também é lida no build, o
  // deploy falha e a Vercel mantém a versão anterior no ar.
  if (process.env.VERCEL_ENV === "production") {
    throw new Error("Deploy de produção sem DATABASE_TARGET=turso. Configure a variável na Vercel.");
  }

  const localUrl = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
  if (!localUrl.startsWith("file:")) {
    throw new Error('DATABASE_URL precisa apontar para um arquivo SQLite local ("file:..."). Para o Turso, use DATABASE_TARGET=turso.');
  }
  if (process.env.TURSO_DATABASE_URL) {
    console.warn("[prisma] TURSO_DATABASE_URL ignorada: DATABASE_TARGET não é \"turso\", usando o SQLite local.");
  }
  const adapter = new PrismaBetterSqlite3({ url: localUrl });
  return new PrismaClient({ adapter });
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Cache em TODOS os ambientes — não só em desenvolvimento.
// Em dev evita "too many connections" com hot reload.
// Em produção reutiliza a conexão HTTP ao Turso entre requests na mesma
// instância serverless quente, eliminando o overhead de reconexão.
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

globalForPrisma.prisma = prisma;
