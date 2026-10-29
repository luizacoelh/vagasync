// Processo separado simula outra instância da Vercel usando o adapter libSQL.
// Só aceita o arquivo SQLite descartável configurado pelo teste pai.
import { register } from "node:module";
import { PrismaClient } from "@prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

if (process.env.NODE_ENV !== "test" || !process.env.DATABASE_URL?.startsWith("file:")) throw new Error("Worker exige SQLite de teste.");
register("./ts-loader.mjs", import.meta.url);
const { createLimitedJob } = await import("@/lib/jobCreation");
const { jobCreateData } = await import("@/lib/jobInput");
const db = new PrismaClient({ adapter: new PrismaLibSql({ url: process.env.DATABASE_URL }) });
process.send({ ready: true });
process.once("message", async ({ input, userId, channel }) => {
  let result;
  try {
    await createLimitedJob(jobCreateData(input, userId), channel, db);
    result = { ok: true };
  } catch (error) {
    result = { ok: false, name: error.name, message: error.message };
  } finally {
    await db.$disconnect();
  }
  process.send(result, () => process.exit(0));
});
