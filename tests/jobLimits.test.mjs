import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, fork } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

register("./support/ts-loader.mjs", import.meta.url);
const root = fileURLToPath(new URL("..", import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "vagasync-limits-"));
const url = `file:${join(dir, "test.db").replace(/\\/g, "/")}`;
process.env.NODE_ENV = "test";
delete process.env.DATABASE_TARGET;
process.env.DATABASE_URL = url;
process.env.GEMINI_API_KEY = "teste-sem-rede";
process.env.N8N_WEBHOOK_SECRET = "teste-limits";

let prisma, api, action, webhook, patch, updateMeta, NextRequest, createLimitedJob, jobCreateData;
const input = { company: "Empresa", title: "Desenvolvimento", description: "Vaga de desenvolvimento de software.", requirements: [], technologies: [], questions: [], checklist: [] };

before(async () => {
  execFileSync(process.execPath, [join(root, "node_modules/prisma/build/index.js"), "migrate", "deploy"], { cwd: root, env: process.env, stdio: "pipe" });
  ({ prisma } = await import("@/lib/prisma"));
  ({ POST: api } = await import("@/app/api/jobs/route"));
  ({ createJob: action, updateJobMeta: updateMeta } = await import("@/app/actions/jobs"));
  ({ POST: webhook } = await import("@/app/api/webhook/n8n/route"));
  ({ PATCH: patch } = await import("@/app/api/jobs/[id]/route"));
  ({ NextRequest } = await import("next/server"));
  ({ createLimitedJob } = await import("@/lib/jobCreation"));
  ({ jobCreateData } = await import("@/lib/jobInput"));
});
after(async () => {
  await prisma?.$disconnect();
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

async function user() {
  const u = await prisma.user.create({ data: {} });
  globalThis.__session = { user: { id: u.id } };
  process.env.N8N_TARGET_USER_ID = u.id;
  return u.id;
}
function request(body, secret = false) {
  return new NextRequest("http://localhost/api/jobs", { method: "POST", headers: { "content-type": "application/json", ...(secret ? { "x-webhook-secret": "teste-limits" } : {}) }, body: JSON.stringify(body) });
}
async function setQuota(id, channel, minute, day) {
  await prisma.$executeRaw`INSERT INTO "JobCreationQuota" ("userId", channel, "minuteStart", "minuteCount", "dayStart", "dayCount")
    VALUES (${id}, ${channel}, unixepoch(), ${minute}, unixepoch(), ${day})
    ON CONFLICT ("userId", channel) DO UPDATE SET "minuteStart"=unixepoch(), "minuteCount"=${minute}, "dayStart"=unixepoch(), "dayCount"=${day}`;
}
async function quota(id, channel = "manual") {
  return (await prisma.$queryRaw`SELECT * FROM "JobCreationQuota" WHERE "userId"=${id} AND channel=${channel}`)[0];
}

async function concurrentCreates(id, channels) {
  const workers = [];
  let timer;
  try {
    return await new Promise((resolve, reject) => {
      let ready = 0;
      let finished = 0;
      const results = [];
      timer = setTimeout(() => reject(new Error("Timeout dos workers de concorrência")), 30000);
      channels.forEach((channel, index) => {
        const child = fork(join(root, "tests/support/job-create-worker.mjs"), [], { env: process.env, stdio: ["ignore", "ignore", "pipe", "ipc"] });
        workers.push(child);
        let stderr = "";
        child.stderr.on("data", chunk => { stderr += chunk; });
        child.once("error", reject);
        child.on("message", message => {
          if (message.ready) {
            ready++;
            if (ready === channels.length) workers.forEach((w, i) => w.send({ input, userId: id, channel: channels[i] }));
          } else results[index] = message;
        });
        child.once("exit", code => {
          if (code !== 0 || !results[index]) return reject(new Error(stderr || "Worker sem resultado"));
          finished++;
          if (finished === channels.length) resolve(results);
        });
      });
    });
  } finally {
    clearTimeout(timer);
    for (const child of workers) if (child.exitCode === null) child.kill();
  }
}

test("API e Action compartilham limite sem IA; excluir e forjar canal não o contorna", async () => {
  const id = await user();
  globalThis.__geminiCalls = 0;
  for (let i = 0; i < 10; i++) {
    if (i % 2) assert.equal((await action(input)).ok, true);
    else assert.equal((await api(request({ ...input, source: "n8n", userId: "outro" }))).status, 201);
  }
  assert.equal(await prisma.job.count({ where: { userId: id, source: "manual" } }), 10);
  await prisma.job.deleteMany({ where: { userId: id } });
  const denied = await api(request(input));
  assert.equal(denied.status, 429);
  assert.ok(Number(denied.headers.get("Retry-After")) > 0);
  assert.match((await action(input)).error, /Aguarde/);
  assert.equal(globalThis.__geminiCalls, 0);
  await user();
  assert.equal((await action(input)).ok, true);
});

test("cota diária persiste após exclusão e só renova depois de 24h, pelo relógio do banco", async () => {
  const id = await user();
  await setQuota(id, "manual", 0, 100);
  const denied = await api(request({ ...input, appliedAt: "2000-01-01" }));
  assert.equal(denied.status, 429);
  assert.match((await denied.json()).error, /24 horas/);
  await prisma.$executeRaw`UPDATE "JobCreationQuota" SET "dayStart"=unixepoch()-86401, "minuteStart"=unixepoch()-61, "minuteCount"=10 WHERE "userId"=${id}`;
  assert.equal((await action(input)).ok, true);
  assert.equal(Number((await quota(id)).dayCount), 1);
  assert.equal(Number((await quota(id)).minuteCount), 1);
});

test("falha na criação reverte o consumo da cota", async () => {
  const id = await user();
  const data = jobCreateData(input, id);
  const job = await createLimitedJob(data, "manual");
  await assert.rejects(createLimitedJob({ ...data, id: job.id }, "manual"));
  assert.equal(Number((await quota(id)).dayCount), 1);
});

test("requisições concorrentes em conexões distintas disputam o último slot diário", async () => {
  const id = await user();
  await setQuota(id, "manual", 0, 99);
  // libSQL é o adapter de produção; aqui conecta só ao arquivo descartável.
  const results = await concurrentCreates(id, ["manual", "manual"]);
  assert.equal(results.filter(r => r.ok).length, 1);
  assert.equal(await prisma.job.count({ where: { userId: id } }), 1);
  assert.equal(Number((await quota(id)).dayCount), 100);
  // Contenção pode negar uma requisição antes de adquirir o lock; nunca libera.
  assert.equal((await api(request(input))).status, 429);
});

test("teto compartilhado conta descartadas e protege o último slot entre canais", async () => {
  const id = await user();
  await prisma.$executeRaw`WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n<1999)
    INSERT INTO "Job" (id,"userId",company,title,description,status,source,"appliedAt")
    SELECT ${id} || '-' || n, ${id}, 'X','Y','Z','DESCARTADA','n8n',CURRENT_TIMESTAMP FROM seq`;
  const results = await concurrentCreates(id, ["manual", "n8n"]);
  assert.equal(results.filter(r => r.ok).length, 1);
  assert.equal(await prisma.job.count({ where: { userId: id } }), 2000);
  assert.match((await action(input)).error, /2000 vagas/);
  // Conta legada já acima do teto também fica bloqueada, sem apagar nada.
  await prisma.job.create({ data: { ...jobCreateData(input, id), source: "manual" } });
  assert.equal((await api(request(input))).status, 429);
  assert.equal(await prisma.job.count({ where: { userId: id } }), 2001);
});

test("n8n tem cota própria, nega antes da IA, e duplicata não consome nem chama Gemini", async () => {
  const id = await user();
  await setQuota(id, "manual", 10, 100);
  await setQuota(id, "n8n", 0, 500);
  globalThis.__geminiCalls = 0;
  const body = { description: input.description, url: "https://example.com/job-limits", source: "remotar" };
  assert.equal((await webhook(request(body, true))).status, 429);
  assert.equal(globalThis.__geminiCalls, 0);
  await prisma.job.create({ data: { ...jobCreateData({ ...input, url: body.url }, id), source: "n8n" } });
  const duplicate = await webhook(request(body, true));
  assert.equal(duplicate.status, 200);
  assert.equal((await duplicate.json()).duplicate, true);
  assert.equal(globalThis.__geminiCalls, 0);
  assert.equal(Number((await quota(id, "n8n")).dayCount), 500);
  await setQuota(id, "n8n", 60, 0);
  assert.equal((await webhook(request({ ...body, url: "https://example.com/another" }, true))).status, 429);
  assert.equal(globalThis.__geminiCalls, 0);
  await setQuota(id, "n8n", 0, 0);
  globalThis.__geminiReply = { ...input, title: "Outra vaga", summary: "Resumo", differentials: [], location: "REMOTO", salary: null };
  assert.equal((await webhook(request({ ...body, url: "https://example.com/another" }, true))).status, 201);
  assert.equal(globalThis.__geminiCalls, 1);
});

test("payloads malformados e grandes são recusados por API, Action e edição", async () => {
  await user();
  for (const invalid of [null, [], { ...input, salary: {} }, { ...input, description: "x".repeat(8001) }, { ...input, title: "x".repeat(201) }, { ...input, requirements: [1] }, { ...input, technologies: Array(31).fill("x") }, { ...input, url: "javascript:alert(1)" }, { ...input, url: "https://user:pass@example.com" }]) {
    assert.equal((await api(request(invalid))).status, 400);
    assert.ok((await action(invalid)).error);
  }
  assert.equal((await api(request({ ...input, extra: "x".repeat(70000) }))).status, 400);
  const job = await action(input);
  for (const invalid of [{ salary: "x".repeat(201) }, { url: "https://example.com/" + "x".repeat(2000) }, { url: {} }, null]) {
    assert.ok((await updateMeta(job.id, invalid)).error);
    assert.equal((await patch(request(invalid), { params: Promise.resolve({ id: job.id }) })).status, 400);
  }
});

test("sem autenticação não cria nem consome cota", async () => {
  globalThis.__session = null;
  assert.equal((await api(request(input))).status, 401);
  assert.match((await action(input)).error, /autenticado/);
});

test("perfil limita tamanho e tipos antes de gravar; dados de outra conta ficam isolados", async () => {
  const { PUT, GET } = await import("@/app/api/profile/route");
  const id = await user();
  for (const body of [null, [], { goal: "x".repeat(1001) }, { skills: {} }, { skills: [1] }, { skills: Array(101).fill("JS") }, { interestArea: "x".repeat(70000) }]) {
    assert.equal((await PUT(request(body))).status, 400);
    assert.equal(await prisma.userProfile.count({ where: { userId: id } }), 0);
  }
  assert.equal((await PUT(request({ goal: "Dev", skills: ["JS"] }))).status, 200);
  await user();
  assert.equal(await (await GET()).json(), null);
  globalThis.__session = null;
  assert.equal((await PUT(request({ goal: "Dev" }))).status, 401);
});

test("acoes individuais rejeitam filtros Prisma e ids ausentes", async () => {
  const id = await user();
  const { updateJobStatus, toggleChecklistItem } = await import("@/app/actions/jobs");
  const job = await createLimitedJob(jobCreateData(input, id), "manual");
  for (const bad of [undefined, null, { not: "" }, "", "x".repeat(65)]) {
    assert.ok((await updateJobStatus(bad, "OFERTA")).error);
    assert.ok((await updateMeta(bad, { salary: "999" })).error);
    assert.ok((await toggleChecklistItem(bad, 0, true)).error);
  }
  const saved = await prisma.job.findUnique({ where: { id: job.id } });
  assert.equal(saved.status, "APLICADA");
  assert.equal(saved.salary, null);
});

test("reserva de IA por IP conta chamadas ainda em andamento e falhas", async () => {
  const { checkIpRateLimit } = await import("@/lib/ipRateLimit");
  await prisma.appSettings.upsert({ where: { id: "singleton" }, create: { id: "singleton", ipHourlyLimit: 1 }, update: { ipHourlyLimit: 1 } });
  const a = await user();
  const b = await user();
  const results = await Promise.all([checkIpRateLimit("192.0.2.1", a, 10), checkIpRateLimit("192.0.2.1", b, 10)]);
  assert.equal(results.filter(r => r.allowed).length, 1);
  assert.equal(await prisma.aiUsage.count({ where: { ip: "192.0.2.1" } }), 1);
  assert.equal((await checkIpRateLimit("192.0.2.1", b, 10)).allowed, false);
});

test("webhook limita tentativas de IA mesmo sem gravar vaga", async () => {
  const id = await user();
  await setQuota(id, "n8n-analysis", 60, 60);
  globalThis.__geminiCalls = 0;
  assert.equal((await webhook(request({ description: input.description }, true))).status, 429);
  assert.equal(globalThis.__geminiCalls, 0);
  assert.equal(await prisma.job.count({ where: { userId: id } }), 0);
});

test("analisar rejeita corpo excessivo antes de consumir cota", async () => {
  const id = await user();
  const { POST } = await import("@/app/api/analyze/route");
  for (const body of [null, { description: "x".repeat(8001) }, { description: input.description, extra: "x".repeat(70000) }]) {
    assert.equal((await POST(request(body))).status, 400);
  }
  assert.equal((await prisma.user.findUnique({ where: { id } })).geminiCallCount, 0);
});

test("endpoints privados negam visitante e admin revalida papel no banco", async () => {
  globalThis.__session = null;
  for (const [path, methods] of [
    ["jobs", ["GET", "POST"]], ["jobs/[id]", ["GET", "PATCH", "DELETE"]],
    ["jobs/export", ["GET"]], ["profile", ["GET", "PUT"]], ["analyze", ["POST"]],
    ["admin/settings", ["GET", "PUT"]], ["admin/users", ["GET"]], ["admin/users/[id]", ["PATCH"]],
  ]) {
    const route = await import(`@/app/api/${path}/route`);
    for (const method of methods) assert.equal((await route[method](request({}), { params: Promise.resolve({ id: "other" }) })).status, 401, `${method} ${path}`);
  }
  await user();
  globalThis.__session.user.isAdmin = true;
  const { GET } = await import("@/app/api/admin/users/route");
  assert.equal((await GET()).status, 404);
  const { POST } = await import("@/app/api/webhook/n8n/check/route");
  assert.equal((await POST(request({ vagas: [] }))).status, 401);
  assert.equal((await webhook(request({ description: input.description }))).status, 401);
});

test("API e actions nao leem nem alteram vagas de outro usuario", async () => {
  const owner = await user();
  const job = await createLimitedJob(jobCreateData(input, owner), "manual");
  await user();
  const route = await import("@/app/api/jobs/[id]/route");
  for (const method of ["GET", "PATCH", "DELETE"]) {
    assert.equal((await route[method](request({ salary: "999" }), { params: Promise.resolve({ id: job.id }) })).status, 404);
  }
  assert.ok((await updateMeta(job.id, { salary: "999" })).error);
  assert.equal((await prisma.job.findUnique({ where: { id: job.id } })).salary, null);
});

test("CSV neutraliza formulas e retorno do login rejeita caracteres de controle", async () => {
  const id = await user();
  await createLimitedJob(jobCreateData({ ...input, company: '=HYPERLINK("https://example.com")' }, id), "manual");
  const { GET } = await import("@/app/api/jobs/export/route");
  assert.ok((await (await GET()).text()).includes("'=HYPERLINK"));
  const { safeRedirectPath } = await import("@/lib/safeRedirect");
  for (const path of ["/\t/evil.test", "//evil.test", "/\\evil.test", null, {}]) assert.equal(safeRedirectPath(path), "/");
  assert.equal(safeRedirectPath("/monitoradas"), "/monitoradas");
});

test("migration é compatível com executor de statements do Turso em arquivo temporário", async () => {
  // check:turso monta sua referência com libSQL e o parser do runner de produção.
  const output = execFileSync(process.execPath, [join(root, "scripts/check-turso-schema.mjs"), "--file", url.slice(5)], { cwd: root, encoding: "utf8", env: process.env });
  assert.match(output, /0 erro\(s\)/);
});
