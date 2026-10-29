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
    INSERT INTO "Job" (id,"userId",company,title,description,status,"appliedAt")
    SELECT ${id} || '-' || n, ${id}, 'X','Y','Z','DESCARTADA',CURRENT_TIMESTAMP FROM seq`;
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

test("migration é compatível com executor de statements do Turso em arquivo temporário", async () => {
  // check:turso monta sua referência com libSQL e o parser do runner de produção.
  const output = execFileSync(process.execPath, [join(root, "scripts/check-turso-schema.mjs"), "--file", url.slice(5)], { cwd: root, encoding: "utf8", env: process.env });
  assert.match(output, /0 erro\(s\)/);
});
