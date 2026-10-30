// node --test tests/ — teto global de cadastro manual, teto de contas novas e
// relatório de volume, num SQLite temporário criado pelas migrations (banco
// próprio porque os tetos somam todas as contas). Sem rede: Gemini simulado.
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
process.env.GEMINI_API_KEY = "teste-sem-rede";
process.env.N8N_WEBHOOK_SECRET = SECRET;

let prisma, api, action, analyze, volume, allowSignIn, NextRequest, JOB_LIMITS, VOLUME_ALERTS, NEW_ACCOUNTS_PER_DAY;
const input = { company: "Empresa", title: "Vaga", description: "Vaga de desenvolvimento de software.", requirements: [], technologies: [], questions: [], checklist: [] };

before(async () => {
  execFileSync(process.execPath, [join(root, "node_modules/prisma/build/index.js"), "migrate", "deploy"], { cwd: root, env: process.env, stdio: "pipe" });
  ({ prisma } = await import("@/lib/prisma"));
  ({ POST: api } = await import("@/app/api/jobs/route"));
  ({ POST: analyze } = await import("@/app/api/analyze/route"));
  ({ createJob: action } = await import("@/app/actions/jobs"));
  ({ GET: volume } = await import("@/app/api/webhook/n8n/volume/route"));
  ({ NextRequest } = await import("next/server"));
  ({ JOB_LIMITS } = await import("@/lib/jobCreation"));
  ({ VOLUME_ALERTS } = await import("@/lib/volumeReport"));
  ({ allowSignIn, NEW_ACCOUNTS_PER_DAY } = await import("@/lib/signupGuard"));
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
// Cadastros já feitos na janela de 24h da conta, como a cota os registra
const created = (userId, dayCount, channel = "manual") => prisma.$executeRaw`
  INSERT INTO "JobCreationQuota" ("userId", channel, "minuteStart", "minuteCount", "dayStart", "dayCount")
  VALUES (${userId}, ${channel}, 0, 0, unixepoch(), ${dayCount})`;
const post = () =>
  api(new NextRequest("http://localhost/api/jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }));
const report = (secret = SECRET) =>
  volume(new NextRequest("http://localhost/api/webhook/n8n/volume", { headers: { "x-webhook-secret": secret } }));

test("teto global barra uma conta nova que está dentro da própria cota", async () => {
  await created((await account()).id, JOB_LIMITS.globalManualDay);
  login(await account());
  const res = await post();
  assert.equal(res.status, 429);
  assert.equal(res.headers.get("retry-after"), "3600");
  assert.match((await action(input)).error, /temporariamente limitado/);
  assert.equal(await prisma.job.count(), 0);
});

test("abaixo do teto o cadastro segue, e apagar a vaga não devolve o espaço", async () => {
  await created((await account()).id, JOB_LIMITS.globalManualDay - 1);
  login(await account());
  const res = await post();
  assert.equal(res.status, 201);
  await prisma.job.delete({ where: { id: (await res.json()).id } });
  assert.equal((await post()).status, 429);
});

test("cota do n8n, janela vencida e cadastros do dono não contam; o dono cadastra acima do teto", async () => {
  const owner = await account({ isOwner: true });
  const other = await account();
  await created(other.id, JOB_LIMITS.globalManualDay, "n8n");
  await created((await account()).id, JOB_LIMITS.globalManualDay - 1);
  await prisma.$executeRaw`UPDATE "JobCreationQuota" SET "dayStart" = unixepoch() - 90000 WHERE channel = 'manual'`;
  // o dono continua com a cota pessoal dele; só fica fora do teto global
  await created(owner.id, JOB_LIMITS.manual.day - 1);
  login(other);
  assert.equal((await post()).status, 201);

  await created((await account()).id, JOB_LIMITS.globalManualDay);
  assert.equal((await post()).status, 429);
  login(owner);
  assert.equal((await post()).status, 201);
});

test("com o teto atingido, a análise recusa antes de chamar a IA", async () => {
  await created((await account()).id, JOB_LIMITS.globalManualDay);
  login(await account());
  globalThis.__geminiCalls = 0;
  const res = await analyze(new NextRequest("http://localhost/api/analyze", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ description: input.description }),
  }));
  assert.equal(res.status, 429);
  assert.equal(globalThis.__geminiCalls, 0);
  assert.equal(await prisma.aiUsage.count(), 0);
});

test("contas novas: quem já existe sempre entra; nova só abaixo do teto de 24h", async () => {
  const known = await account({ email: "ja@existe.dev" });
  await prisma.account.create({ data: { userId: known.id, type: "oauth", provider: "github", providerAccountId: "123" } });
  // known + estas = teto - 1 contas criadas nas últimas 24h
  for (let i = 2; i < NEW_ACCOUNTS_PER_DAY; i++) await account();
  await account({ createdAt: new Date(Date.now() - 2 * 86400000) });
  assert.equal(await allowSignIn("nova@conta.dev", "google", "novo-1"), true);

  await account();
  assert.equal(await allowSignIn("nova@conta.dev", "google", "novo-1"), false);
  assert.equal(await allowSignIn(null, "github", "123"), true);
  assert.equal(await allowSignIn("ja@existe.dev", "google", "outro"), true);
});

test("relatório exige o segredo e não traz dados de usuários", async () => {
  process.env.N8N_TARGET_USER_ID = (await account()).id;
  assert.equal((await report("errado")).status, 401);
  const body = await (await report()).json();
  assert.deepEqual(body, { manualCreated: 0, accountsCreating: 0, newAccounts: 1, aiCalls: 0, storedJobs: 0, alert: false, alerts: [] });
});

test("relatório alerta cada limite, e vaga apagada continua contando", async () => {
  const user = await account();
  process.env.N8N_TARGET_USER_ID = user.id;
  await created(user.id, VOLUME_ALERTS.manualCreated + 1);
  for (let i = 0; i < VOLUME_ALERTS.accountsCreating; i++) await created((await account()).id, 1);
  await prisma.aiUsage.createMany({ data: Array.from({ length: VOLUME_ALERTS.aiCalls + 1 }, () => ({ userId: user.id, action: "analyze_job" })) });
  await prisma.job.createMany({ data: Array.from({ length: VOLUME_ALERTS.storedJobs + 1 }, () => ({ userId: user.id, company: "x", title: "x", description: "x" })) });
  const body = await (await report()).json();
  assert.equal(body.alert, true);
  assert.equal(body.accountsCreating, VOLUME_ALERTS.accountsCreating + 1);
  assert.deepEqual(body.alerts.map((a) => a.split(":")[0]).sort(), ["accountsCreating", "aiCalls", "manualCreated", "newAccounts", "storedJobs"]);

  await prisma.job.deleteMany();
  assert.equal((await (await report()).json()).manualCreated, VOLUME_ALERTS.manualCreated + 1 + VOLUME_ALERTS.accountsCreating);
});
