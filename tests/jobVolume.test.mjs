// node --test tests/ — teto global de cadastro manual e relatório de volume,
// num SQLite temporário criado pelas migrations (banco próprio porque o teto
// conta todas as contas). Sem rede.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

register("./support/ts-loader.mjs", import.meta.url);
const root = fileURLToPath(new URL("..", import.meta.url));
const dir = mkdtempSync(join(tmpdir(), "vagasync-volume-"));
const url = `file:${join(dir, "test.db").replace(/\\/g, "/")}`;
const SECRET = "teste-volume";
process.env.NODE_ENV = "test";
delete process.env.DATABASE_TARGET;
process.env.DATABASE_URL = url;
process.env.N8N_WEBHOOK_SECRET = SECRET;

let prisma, api, action, volume, NextRequest, JOB_LIMITS, VOLUME_ALERTS;
const input = { company: "Empresa", title: "Vaga", description: "Vaga de desenvolvimento de software.", requirements: [], technologies: [], questions: [], checklist: [] };

before(async () => {
  execFileSync(process.execPath, [join(root, "node_modules/prisma/build/index.js"), "migrate", "deploy"], { cwd: root, env: process.env, stdio: "pipe" });
  ({ prisma } = await import("@/lib/prisma"));
  ({ POST: api } = await import("@/app/api/jobs/route"));
  ({ createJob: action } = await import("@/app/actions/jobs"));
  ({ GET: volume } = await import("@/app/api/webhook/n8n/volume/route"));
  ({ NextRequest } = await import("next/server"));
  ({ JOB_LIMITS } = await import("@/lib/jobCreation"));
  ({ VOLUME_ALERTS } = await import("@/lib/volumeReport"));
});
after(async () => {
  await prisma?.$disconnect();
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});
beforeEach(async () => {
  await prisma.job.deleteMany();
  await prisma.user.deleteMany();
});

const account = (data = {}) => prisma.user.create({ data });
const login = (user) => { globalThis.__session = { user: { id: user.id } }; };
const seed = (userId, count, extra = {}) =>
  prisma.job.createMany({ data: Array.from({ length: count }, () => ({ userId, company: "x", title: "x", description: "x", ...extra })) });
const post = () =>
  api(new NextRequest("http://localhost/api/jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }));
const report = (secret = SECRET) =>
  volume(new NextRequest("http://localhost/api/webhook/n8n/volume", { headers: { "x-webhook-secret": secret } }));

test("teto global barra uma conta nova que está dentro da própria cota", async () => {
  await seed((await account()).id, JOB_LIMITS.globalManualDay);
  login(await account());
  const res = await post();
  assert.equal(res.status, 429);
  assert.equal(res.headers.get("retry-after"), "3600");
  assert.match((await action(input)).error, /temporariamente limitado/);
  assert.equal(await prisma.job.count(), JOB_LIMITS.globalManualDay);
});

test("abaixo do teto o cadastro segue normal", async () => {
  await seed((await account()).id, JOB_LIMITS.globalManualDay - 1);
  login(await account());
  assert.equal((await post()).status, 201);
  assert.equal((await post()).status, 429);
});

test("vagas do n8n, antigas ou do dono não contam, e o dono cadastra acima do teto", async () => {
  const owner = await account({ isOwner: true });
  const other = await account();
  await seed(other.id, JOB_LIMITS.globalManualDay, { source: "n8n" });
  await seed(other.id, 100, { createdAt: new Date(Date.now() - 2 * 86400000) });
  await seed(owner.id, JOB_LIMITS.globalManualDay);
  login(other);
  assert.equal((await post()).status, 201);

  await seed(other.id, JOB_LIMITS.globalManualDay);
  assert.equal((await post()).status, 429);
  login(owner);
  assert.equal((await post()).status, 201);
});

test("relatório exige o segredo e não traz dados de usuários", async () => {
  process.env.N8N_TARGET_USER_ID = (await account()).id;
  assert.equal((await report("errado")).status, 401);
  const body = await (await report()).json();
  assert.deepEqual(body, { totalJobs: 0, manualJobs: 0, accountsCreating: 0, aiCalls: 0, alert: false, alerts: [] });
});

test("relatório alerta volume alto e muitas contas criando", async () => {
  const user = await account();
  process.env.N8N_TARGET_USER_ID = user.id;
  await seed(user.id, VOLUME_ALERTS.manualJobs + 1);
  for (let i = 0; i < VOLUME_ALERTS.accountsCreating; i++) await seed((await account()).id, 1);
  const body = await (await report()).json();
  assert.equal(body.alert, true);
  assert.equal(body.accountsCreating, VOLUME_ALERTS.accountsCreating + 1);
  assert.equal(body.alerts.length, 2);
});
