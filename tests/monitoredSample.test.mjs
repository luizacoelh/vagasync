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
const dir = mkdtempSync(join(tmpdir(), "vagasync-sample-"));
process.env.NODE_ENV = "test";
delete process.env.DATABASE_TARGET;
process.env.DATABASE_URL = "file:" + join(dir, "test.db").split("\\").join("/");

const HOUR = 3600000;
let prisma, lib, copySampleJob, settingsRoute, NextRequest, target;

before(async () => {
  execFileSync(process.execPath, [join(root, "node_modules/prisma/build/index.js"), "migrate", "deploy"], { cwd: root, env: process.env, stdio: "pipe" });
  ({ prisma } = await import("@/lib/prisma"));
  lib = await import("@/lib/monitoredSample");
  ({ copySampleJob } = await import("@/app/actions/monitoredSample"));
  ({ NextRequest } = await import("next/server"));
  settingsRoute = await import("@/app/api/admin/settings/route");
  target = await prisma.user.create({ data: { name: "Dona", email: "dona@teste.dev", isOwner: true, isAdmin: true } });
  process.env.N8N_TARGET_USER_ID = target.id;
});
after(async () => {
  await prisma?.$disconnect();
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch (error) {
    if (error.code !== "EBUSY") throw error;
  }
});

let seq = 0;
async function newUser(hoursAgo = 1, data = {}) {
  const n = ++seq;
  const user = await prisma.user.create({
    data: { email: `u${n}@teste.dev`, createdAt: new Date(Date.now() - hoursAgo * HOUR), ...data },
  });
  globalThis.__session = { user: { id: user.id } };
  return user;
}
function robotJob(overrides = {}) {
  return prisma.job.create({
    data: {
      userId: target.id,
      company: "Empresa",
      title: "Estágio Dev",
      description: "Descrição da vaga do robô.",
      status: "MONITORADA",
      source: "n8n",
      technologies: JSON.stringify(["React", "Node.js"]),
      summary: "Resumo",
      url: `https://vagas.dev/${++seq}`,
      ...overrides,
    },
  });
}

test("horas restantes da amostra", () => {
  const now = Date.now();
  assert.equal(lib.trialHoursLeft(new Date(now - 2 * HOUR), 24, now), 22);
  assert.equal(lib.trialHoursLeft(new Date(now - 25 * HOUR), 24, now), 0);
  assert.equal(lib.trialHoursLeft(new Date(now), 0, now), 0);
});

test("amostra só para conta nova que não é a dona nem excluída", async () => {
  assert.equal(await lib.sampleHoursLeftFor(target.id), 0);
  assert.ok((await lib.sampleHoursLeftFor((await newUser(1)).id)) > 0);
  assert.equal(await lib.sampleHoursLeftFor((await newUser(30)).id), 0);
  assert.equal(await lib.sampleHoursLeftFor((await newUser(1, { email: null, name: "Conta excluída" })).id), 0);
  await prisma.appSettings.upsert({ where: { id: "singleton" }, update: { monitoredTrialHours: 0 }, create: { id: "singleton", monitoredTrialHours: 0 } });
  assert.equal(await lib.sampleHoursLeftFor((await newUser(1)).id), 0);
  await prisma.appSettings.update({ where: { id: "singleton" }, data: { monitoredTrialHours: 24 } });
});

test("a amostra traz as vagas recentes do robô da conta-alvo, triadas ou não, sem campos privados", async () => {
  const visible = await robotJob();
  // Triada pela dona: continua na amostra, para não revelar a triagem.
  const triaged = await robotJob({ status: "DESCARTADA" });
  const old = await robotJob({ createdAt: new Date(Date.now() - 10 * 24 * HOUR) });
  const manual = await robotJob({ source: "manual", status: "APLICADA" });
  const other = await newUser(1);
  const foreign = await prisma.job.create({ data: { userId: other.id, company: "X", title: "Y", description: "Z", status: "MONITORADA", source: "n8n" } });
  const ids = new Set((await lib.getMonitoredSample()).map((j) => j.id));
  assert.ok(ids.has(visible.id));
  assert.ok(ids.has(triaged.id));
  for (const job of [old, manual, foreign]) assert.ok(!ids.has(job.id));
  const sample = await lib.getMonitoredSample();
  assert.ok(sample.every((j) => !("status" in j) && !("description" in j)));
});

test("ordena pelas skills do perfil", () => {
  const jobs = [
    { id: "a", technologies: ["Java"] },
    { id: "b", technologies: ["React", "Node.js"] },
    { id: "c", technologies: ["React"] },
  ];
  assert.deepEqual(lib.sortBySkillMatch(jobs, ["react", "NodeJS"]).map((j) => j.id), ["b", "c", "a"]);
  assert.deepEqual(lib.sortBySkillMatch(jobs, []).map((j) => j.id), ["a", "b", "c"]);
});

test("Tenho interesse copia a vaga sem IA, uma vez só", async () => {
  const job = await robotJob();
  const user = await newUser(2);
  const first = await copySampleJob(job.id);
  assert.ok(first.ok);
  const copy = await prisma.job.findUnique({ where: { id: first.id } });
  assert.equal(copy.userId, user.id);
  assert.equal(copy.status, "APLICADA");
  assert.equal(copy.source, "manual");
  assert.equal(copy.description, job.description);
  assert.equal(copy.technologies, job.technologies);
  const again = await copySampleJob(job.id);
  assert.equal(again.id, first.id);
  assert.equal(await prisma.job.count({ where: { userId: user.id } }), 1);
  // A vaga da dona não muda.
  assert.equal((await prisma.job.findUnique({ where: { id: job.id } })).status, "MONITORADA");
});

test("fora da amostra ou vaga fora do feed, nada é copiado", async () => {
  const job = await robotJob();
  const old = await newUser(48);
  assert.match((await copySampleJob(job.id)).error, /terminou/);
  assert.equal(await prisma.job.count({ where: { userId: old.id } }), 0);

  const fresh = await newUser(1);
  const manual = await robotJob({ source: "manual" });
  assert.match((await copySampleJob(manual.id)).error, /saiu da amostra/);
  const foreign = await prisma.job.create({ data: { userId: old.id, company: "X", title: "Y", description: "Z", status: "MONITORADA" } });
  assert.match((await copySampleJob(foreign.id)).error, /saiu da amostra/);
  assert.equal(await prisma.job.count({ where: { userId: fresh.id } }), 0);

  globalThis.__session = { user: { id: target.id } };
  assert.match((await copySampleJob(job.id)).error, /terminou/);
});

test("o admin define as horas da amostra, de 0 a 720", async () => {
  globalThis.__session = { user: { id: target.id, isAdmin: true } };
  const put = (body) =>
    settingsRoute.PUT(
      new NextRequest("http://localhost/api/admin/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  assert.equal((await put({ monitoredTrialHours: 0 })).status, 200);
  assert.equal((await prisma.appSettings.findUnique({ where: { id: "singleton" } })).monitoredTrialHours, 0);
  assert.equal((await put({ monitoredTrialHours: 721 })).status, 400);
  assert.equal((await put({ monitoredTrialHours: -1 })).status, 400);
  assert.equal((await put({ monitoredTrialHours: 1.5 })).status, 400);
  assert.equal((await put({ monitoredTrialHours: 48 })).status, 200);
});

test("o admin libera, bloqueia e devolve a amostra à regra padrão", async () => {
  const usersRoute = await import("@/app/api/admin/users/[id]/route");
  const admin = await prisma.user.create({ data: { name: "Admin", email: `adm${++seq}@teste.dev`, isAdmin: true } });
  const patch = async (id, body) => {
    globalThis.__session = { user: { id: admin.id, isAdmin: true } };
    const req = new NextRequest(`http://localhost/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    return usersRoute.PATCH(req, { params: Promise.resolve({ id }) });
  };

  const old = await newUser(100);
  assert.equal(await lib.sampleHoursLeftFor(old.id), 0);
  assert.equal((await patch(old.id, { sampleHours: 48 })).status, 200);
  assert.equal(await lib.sampleHoursLeftFor(old.id), 48);

  const fresh = await newUser(1);
  assert.equal((await patch(fresh.id, { sampleHours: 0 })).status, 200);
  assert.equal(await lib.sampleHoursLeftFor(fresh.id), 0);
  assert.equal((await patch(fresh.id, { sampleHours: null })).status, 200);
  assert.ok((await lib.sampleHoursLeftFor(fresh.id)) > 0);

  // Liberação individual vale mesmo com a amostra padrão desligada.
  await prisma.appSettings.update({ where: { id: "singleton" }, data: { monitoredTrialHours: 0 } });
  assert.equal(await lib.sampleHoursLeftFor(old.id), 48);
  await prisma.appSettings.update({ where: { id: "singleton" }, data: { monitoredTrialHours: 24 } });

  for (const sampleHours of [-1, 1.5, 721, "24"]) {
    assert.equal((await patch(fresh.id, { sampleHours })).status, 400);
  }
  assert.equal((await patch(target.id, { sampleHours: 24 })).status, 400);
});

test("status da amostra mostrado no admin", async () => {
  const { sampleStatus } = await import("@/lib/sampleOverride");
  const now = Date.now();
  const created = new Date(now - 2 * HOUR);
  assert.equal(sampleStatus({ createdAt: created, monitoredTrialUntil: null }, 24, now).kind, "padrao");
  assert.equal(sampleStatus({ createdAt: new Date(now - 30 * HOUR), monitoredTrialUntil: null }, 24, now).kind, "encerrada");
  assert.equal(sampleStatus({ createdAt: created, monitoredTrialUntil: null }, 0, now).kind, "desligada");
  assert.equal(sampleStatus({ createdAt: created, monitoredTrialUntil: new Date(now + HOUR).toISOString() }, 0, now).kind, "liberada");
  assert.equal(sampleStatus({ createdAt: created, monitoredTrialUntil: new Date(now - HOUR) }, 24, now).kind, "bloqueada");
});
