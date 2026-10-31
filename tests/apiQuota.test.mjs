import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

register("./support/ts-loader.mjs", import.meta.url);
const root = fileURLToPath(new URL("..", import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "vagasync-api-quota-"));
const url = `file:${join(dir, "test.db").replace(/\\/g, "/")}`;
process.env.NODE_ENV = "test";
delete process.env.DATABASE_TARGET;
process.env.DATABASE_URL = url;

let prisma, jobsRoute, jobRoute, exportRoute, profileRoute, actions, NextRequest, API_LIMITS, allowApiRequest, getAiUsageStats, createLimitedJob;

before(async () => {
  execFileSync(process.execPath, [join(root, "node_modules/prisma/build/index.js"), "migrate", "deploy"], { cwd: root, env: process.env, stdio: "pipe" });
  ({ prisma } = await import("@/lib/prisma"));
  ({ API_LIMITS, allowApiRequest } = await import("@/lib/apiQuota"));
  ({ getAiUsageStats } = await import("@/lib/aiUsageStats"));
  ({ createLimitedJob } = await import("@/lib/jobCreation"));
  ({ NextRequest } = await import("next/server"));
  jobsRoute = await import("@/app/api/jobs/route");
  jobRoute = await import("@/app/api/jobs/[id]/route");
  exportRoute = await import("@/app/api/jobs/export/route");
  profileRoute = await import("@/app/api/profile/route");
  actions = await import("@/app/actions/jobs");
});
after(async () => {
  await prisma?.$disconnect();
  // No Windows o libSQL pode segurar o arquivo temporário depois do disconnect.
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch (error) {
    if (error.code !== "EBUSY") throw error;
  }
});

async function user() {
  const created = await prisma.user.create({ data: {} });
  globalThis.__session = { user: { id: created.id } };
  return created.id;
}
function job(userId, overrides = {}) {
  return prisma.job.create({
    data: { userId, company: "Empresa", title: "Vaga", description: "Descrição da vaga de teste.", ...overrides },
  });
}
function get(query = "") {
  return new NextRequest(`http://localhost/api/jobs${query}`);
}
async function exhaust(id, limit = "general") {
  await prisma.$executeRaw`INSERT INTO "JobCreationQuota" ("userId", channel, "minuteStart", "minuteCount", "dayStart", "dayCount")
    VALUES (${id}, ${`api-${limit}`}, unixepoch(), ${API_LIMITS[limit]}, 0, 0)`;
}

test("limite por conta barra o pedido seguinte e renova depois de um minuto", async () => {
  const id = await user();
  for (let i = 0; i < API_LIMITS.export; i++) assert.equal(await allowApiRequest(id, "export"), true);
  assert.equal(await allowApiRequest(id, "export"), false);

  await prisma.$executeRaw`UPDATE "JobCreationQuota" SET "minuteStart" = unixepoch() - 61 WHERE "userId" = ${id}`;
  assert.equal(await allowApiRequest(id, "export"), true);
  const [row] = await prisma.$queryRaw`SELECT "minuteCount" FROM "JobCreationQuota" WHERE "userId" = ${id}`;
  assert.equal(Number(row.minuteCount), 1);
});

test("pedidos simultâneos não passam do limite", async () => {
  const id = await user();
  const results = await Promise.all(Array.from({ length: API_LIMITS.export * 3 }, () => allowApiRequest(id, "export")));
  assert.equal(results.filter(Boolean).length, API_LIMITS.export);
});

test("limite é por conta e não afeta outra conta nem outro tipo", async () => {
  const blocked = await user();
  await exhaust(blocked);
  assert.equal(await allowApiRequest(blocked), false);
  assert.equal(await allowApiRequest(blocked, "export"), true);
  assert.equal(await allowApiRequest(await user()), true);
});

test("sessão de conta excluída é recusada sem erro de banco", async () => {
  const id = await user();
  await prisma.user.delete({ where: { id } });
  assert.equal(await allowApiRequest(id), false);
});

test("rotas sem cota própria respondem 429 com Retry-After no limite", async () => {
  const id = await user();
  const own = await job(id);
  await exhaust(id);
  await exhaust(id, "export");
  const context = { params: Promise.resolve({ id: own.id }) };
  const patch = new NextRequest("http://localhost/api/jobs/x", { method: "PATCH", body: JSON.stringify({ salary: "1" }) });
  const put = new NextRequest("http://localhost/api/profile", { method: "PUT", body: JSON.stringify({ goal: "x" }) });

  for (const res of [
    await jobsRoute.GET(get()),
    await jobRoute.GET(get(), context),
    await jobRoute.PATCH(patch, context),
    await jobRoute.DELETE(get(), context),
    await exportRoute.GET(),
    await profileRoute.GET(),
    await profileRoute.PUT(put),
  ]) {
    assert.equal(res.status, 429);
    assert.equal(res.headers.get("retry-after"), "60");
  }
  const stored = await prisma.job.findUnique({ where: { id: own.id } });
  assert.equal(stored.salary, null);
});

test("actions devolvem o erro do limite e não alteram nada", async () => {
  const id = await user();
  const own = await job(id, { status: "MONITORADA", checklist: '["item"]' });
  await exhaust(id);

  for (const result of [
    await actions.updateJobStatus(own.id, "ENTREVISTA"),
    await actions.updateJobMeta(own.id, { salary: "1" }),
    await actions.toggleChecklistItem(own.id, 0, true),
    await actions.markJobsInterested([own.id]),
    await actions.discardJobs([own.id]),
    await actions.restoreDiscardedJobs([own.id]),
    await actions.deleteJobs([own.id]),
  ]) {
    assert.match(result.error, /Muitas ações/);
  }
  const stored = await prisma.job.findUnique({ where: { id: own.id } });
  assert.equal(stored.status, "MONITORADA");
  assert.equal(stored.salary, null);
  assert.equal(stored.checklistDone, null);
});

test("o limite geral não atinge o cadastro manual, que tem cota própria", async () => {
  const id = await user();
  await exhaust(id);
  const result = await actions.createJob({
    company: "Empresa",
    title: "Vaga",
    description: "Descrição da vaga de teste.",
    requirements: [],
    technologies: [],
    questions: [],
    checklist: [],
  });
  assert.equal(result.ok, true);
});

test("uso normal das actions continua funcionando", async () => {
  const id = await user();
  const own = await job(id, { checklist: '["item"]' });
  assert.deepEqual(await actions.updateJobMeta(own.id, { salary: "1000" }), { ok: true });
  assert.deepEqual(await actions.toggleChecklistItem(own.id, 0, true), { ok: true });
  assert.deepEqual(await actions.updateJobStatus(own.id, "ENTREVISTA"), { ok: true });
  assert.deepEqual(await actions.deleteJobs([own.id]), { ok: true, count: 1 });
});

test("GET /api/jobs pagina sem repetir nem perder vagas, mesmo com a mesma data", async () => {
  const id = await user();
  const sameDate = new Date("2026-10-01T12:00:00.000Z");
  const ids = [];
  for (let i = 0; i < 5; i++) ids.push((await job(id, { createdAt: sameDate })).id);
  ids.push((await job(id, { createdAt: new Date("2026-09-01T12:00:00.000Z") })).id);
  await job(id, { status: "DESCARTADA" });
  await job(await user());
  globalThis.__session = { user: { id } };

  const seen = [];
  let cursor = null;
  let pages = 0;
  do {
    const res = await jobsRoute.GET(get(`?limit=2${cursor ? `&cursor=${cursor}` : ""}`));
    assert.equal(res.status, 200);
    const page = await res.json();
    assert.ok(Array.isArray(page) && page.length <= 2);
    seen.push(...page.map((item) => item.id));
    cursor = res.headers.get("x-next-cursor");
    pages++;
  } while (cursor);

  assert.equal(pages, 3);
  assert.equal(seen.length, 6);
  assert.deepEqual([...seen].sort(), [...ids].sort());
});

test("GET /api/jobs traz no máximo 100 vagas por padrão", async () => {
  const id = await user();
  await prisma.job.createMany({
    data: Array.from({ length: 101 }, () => ({ userId: id, company: "E", title: "V", description: "D" })),
  });
  const res = await jobsRoute.GET(get());
  assert.equal((await res.json()).length, 100);
  assert.ok(res.headers.get("x-next-cursor"));
});

test("GET /api/jobs recusa limite e cursor inválidos", async () => {
  await user();
  for (const query of ["?limit=0", "?limit=101", "?limit=abc", "?limit=", "?cursor=abc", "?cursor=", "?cursor=99999999999999999_a"]) {
    assert.equal((await jobsRoute.GET(get(query))).status, 400, query);
  }
});

test("CSV continua com as mesmas colunas e neutraliza fórmulas", async () => {
  const id = await user();
  await job(id, { company: "=SOMA(1)", technologies: '["Node","SQL"]', status: "ENTREVISTA" });
  const text = await (await exportRoute.GET()).text();
  assert.match(text, /Empresa,Cargo,Status,Tecnologias,Data de criação/);
  assert.match(text, /'=SOMA\(1\),Vaga,.*,Node; SQL,/);
  assert.ok(!text.includes("Descrição da vaga"));
});

async function statsScenario(db) {
  const [a, b] = await Promise.all([
    db.user.create({ data: { name: "Ana", email: `ana-${Date.now()}@teste.dev` } }),
    db.user.create({ data: { name: "Bia", email: `bia-${Date.now()}@teste.dev` } }),
  ]);
  const old = new Date(Date.now() - 40 * 86400000);
  await db.aiUsage.createMany({
    data: [
      { userId: a.id, action: "analyze_job", tokens: 10 },
      { userId: a.id, action: "analyze_job", tokens: null },
      { userId: a.id, action: "analyze_job", tokens: 5, createdAt: old },
      { userId: b.id, action: "analyze_job", tokens: 1 },
    ],
  });
  const stats = await getAiUsageStats(db);
  const ana = stats.byUser.find((row) => row.userId === a.id);
  assert.equal(ana.userName, "Ana");
  assert.equal(ana.totalCalls, 3);
  assert.equal(ana.totalTokens, 15);
  assert.ok(ana.lastUsedAt instanceof Date && ana.lastUsedAt > old);
  assert.equal(stats.byUser[0].userId, a.id);
  assert.ok(stats.totalCalls >= 4);
  assert.equal(stats.byDay.length, 14);
  assert.ok(stats.byDay.at(-1).calls >= 3);
}

test("painel de IA soma no banco e mostra os últimos 14 dias", async () => {
  await prisma.aiUsage.deleteMany();
  await statsScenario(prisma);
});

test("painel de IA funciona no driver libSQL, o mesmo do Turso", async () => {
  await prisma.aiUsage.deleteMany();
  const { PrismaClient } = await import("@prisma/client");
  const { PrismaLibSql } = await import("@prisma/adapter-libsql");
  const libsql = new PrismaClient({ adapter: new PrismaLibSql({ url }) });
  try {
    await statsScenario(libsql);
  } finally {
    await libsql.$disconnect();
  }
});

test("createLimitedJob segue independente do limite geral", async () => {
  const id = await user();
  await exhaust(id);
  const created = await createLimitedJob({ userId: id, company: "E", title: "V", description: "Descrição." }, "manual");
  assert.equal(created.source, "manual");
});
