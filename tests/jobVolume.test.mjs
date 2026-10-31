// node --test tests/ — teto global de cadastro manual, teto de contas novas e
// relatório de volume, num SQLite temporário criado pelas migrations (banco
// próprio porque os tetos somam todas as contas). Sem rede: Gemini simulado.
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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

let prisma, api, action, analyze, volume, allowSignIn, checkSignIn, checkJobCreationQuota, NextRequest, JOB_LIMITS, VOLUME_ALERTS, NEW_ACCOUNTS_PER_DAY, DEFAULTS, updateAppSettings, settingsRoute, checkIpRateLimit, volumeAlerts;
const input = { company: "Empresa", title: "Vaga", description: "Vaga de desenvolvimento de software.", requirements: [], technologies: [], questions: [], checklist: [] };

before(async () => {
  execFileSync(process.execPath, [join(root, "node_modules/prisma/build/index.js"), "migrate", "deploy"], { cwd: root, env: process.env, stdio: "pipe" });
  ({ prisma } = await import("@/lib/prisma"));
  ({ POST: api } = await import("@/app/api/jobs/route"));
  ({ POST: analyze } = await import("@/app/api/analyze/route"));
  ({ createJob: action } = await import("@/app/actions/jobs"));
  ({ GET: volume } = await import("@/app/api/webhook/n8n/volume/route"));
  ({ NextRequest } = await import("next/server"));
  ({ JOB_LIMITS, checkJobCreationQuota } = await import("@/lib/jobCreation"));
  const appSettings = await import("@/lib/appSettings");
  ({ updateAppSettings } = appSettings);
  DEFAULTS = await appSettings.getAppSettings();
  ({ volumeAlerts } = await import("@/lib/volumeReport"));
  VOLUME_ALERTS = volumeAlerts(DEFAULTS);
  NEW_ACCOUNTS_PER_DAY = DEFAULTS.newAccountsPerDay;
  ({ allowSignIn, checkSignIn } = await import("@/lib/signupGuard"));
  ({ checkIpRateLimit } = await import("@/lib/ipRateLimit"));
  settingsRoute = await import("@/app/api/admin/settings/route");
});
after(async () => {
  await prisma?.$disconnect();
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});
beforeEach(async () => {
  await prisma.job.deleteMany();
  await prisma.user.deleteMany();
  await prisma.aiUsage.deleteMany();
  await prisma.$executeRaw`DELETE FROM "GlobalJobHour"`;
  await prisma.appSettings.deleteMany();
});

const account = (data = {}) => prisma.user.create({ data });
const login = (user) => { globalThis.__session = { user: { id: user.id } }; };
// Cadastros já feitos na janela de 24h da conta, como a cota os registra
const created = (userId, dayCount, channel = "manual") => prisma.$executeRaw`
  INSERT INTO "JobCreationQuota" ("userId", channel, "minuteStart", "minuteCount", "dayStart", "dayCount")
  VALUES (${userId}, ${channel}, 0, 0, unixepoch(), ${dayCount})`;
// Cadastros do site inteiro numa hora; hoursAgo 0 é a hora atual
const sitewide = (count, hoursAgo = 0) => prisma.$executeRaw`
  INSERT INTO "GlobalJobHour" ("hour", "count") VALUES (unixepoch() / 3600 - ${hoursAgo}, ${count})`;
const post = () =>
  api(new NextRequest("http://localhost/api/jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) }));
const report = (secret = SECRET) =>
  volume(new NextRequest("http://localhost/api/webhook/n8n/volume", { headers: { "x-webhook-secret": secret } }));

test("teto global barra uma conta nova que está dentro da própria cota", async () => {
  await sitewide(JOB_LIMITS.globalManualDay);
  login(await account());
  const res = await post();
  assert.equal(res.status, 429);
  assert.equal(res.headers.get("retry-after"), "3600");
  assert.match((await action(input)).error, /temporariamente limitado/);
  assert.equal(await prisma.job.count(), 0);
});

test("recusa do teto não gasta a cota da conta", async () => {
  const user = await account();
  await sitewide(JOB_LIMITS.globalManualDay);
  login(user);
  await post();
  assert.equal(await prisma.jobCreationQuota.count({ where: { userId: user.id } }), 0);
});

test("conta perto da própria cota recebe a mensagem do teto global", async () => {
  const user = await account();
  await created(user.id, JOB_LIMITS.manual.day - 1);
  await sitewide(JOB_LIMITS.globalManualDay);
  login(user);
  assert.match((await action(input)).error, /temporariamente limitado/);
});

test("abaixo do teto o cadastro segue, e apagar a vaga não devolve o espaço", async () => {
  await sitewide(JOB_LIMITS.globalManualDay - 1);
  login(await account());
  const res = await post();
  assert.equal(res.status, 201);
  await prisma.job.delete({ where: { id: (await res.json()).id } });
  assert.equal((await post()).status, 429);
});

test("janelas de contas espalhadas no tempo não burlam o teto", async () => {
  // as janelas de 24h das contas já venceram, mas os cadastros seguem na soma
  for (let hour = 1; hour <= 24; hour++) {
    await sitewide(Math.ceil(JOB_LIMITS.globalManualDay / 24), hour);
    await created((await account()).id, 1);
  }
  await prisma.$executeRaw`UPDATE "JobCreationQuota" SET "dayStart" = unixepoch() - 90000`;
  login(await account());
  assert.equal((await post()).status, 429);
});

test("só hora vencida sai da soma, e ela é limpa", async () => {
  await sitewide(JOB_LIMITS.globalManualDay, 25);
  await sitewide(1, 24);
  login(await account());
  assert.equal((await post()).status, 201);
  const [{ n }] = await prisma.$queryRaw`SELECT COUNT(*) AS n FROM "GlobalJobHour"`;
  assert.equal(Number(n), 2);
});

test("dono fica fora do teto, mas segue com a cota pessoal", async () => {
  const owner = await account({ isOwner: true });
  await sitewide(JOB_LIMITS.globalManualDay);
  login(owner);
  assert.equal((await post()).status, 201);
  const [{ n }] = await prisma.$queryRaw`SELECT SUM("count") AS n FROM "GlobalJobHour"`;
  assert.equal(Number(n), JOB_LIMITS.globalManualDay);

  await prisma.$executeRaw`UPDATE "JobCreationQuota" SET "dayCount" = ${JOB_LIMITS.manual.day} WHERE "userId" = ${owner.id}`;
  assert.equal((await post()).status, 429);
});

test("pré-checagem do n8n não depende da tabela do teto global", async () => {
  const user = await account();
  await prisma.$executeRaw`ALTER TABLE "GlobalJobHour" RENAME TO "GlobalJobHourFora"`;
  try {
    await checkJobCreationQuota(user.id, "n8n");
  } finally {
    await prisma.$executeRaw`ALTER TABLE "GlobalJobHourFora" RENAME TO "GlobalJobHour"`;
  }
});

test("com o teto atingido, a análise recusa antes de chamar a IA", async () => {
  await sitewide(JOB_LIMITS.globalManualDay);
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

test("login recusado vai para a mensagem própria da tela de login", async () => {
  assert.equal(await checkSignIn({ email: "qualquer@conta.dev" }, null), true);
  const google = { provider: "google", providerAccountId: "n1" };
  assert.equal(await checkSignIn({ email: "nova@conta.dev" }, google), true);
  for (let i = 0; i < NEW_ACCOUNTS_PER_DAY; i++) await account();
  assert.equal(await checkSignIn({ email: "nova@conta.dev" }, google), "/login?error=CadastroLimitado");
  assert.match(readFileSync(new URL("../app/login/page.tsx", import.meta.url), "utf8"), /error === "CadastroLimitado"/);
});

test("relatório alerta cada limite, e vaga apagada continua contando", async () => {
  const user = await account();
  process.env.N8N_TARGET_USER_ID = user.id;
  await sitewide(VOLUME_ALERTS.manualCreated + 1, 3);
  await created(user.id, 1);
  for (let i = 0; i < VOLUME_ALERTS.accountsCreating; i++) await created((await account()).id, 1);
  await prisma.aiUsage.createMany({ data: Array.from({ length: VOLUME_ALERTS.aiCalls + 1 }, () => ({ userId: user.id, action: "analyze_job" })) });
  await prisma.job.createMany({ data: Array.from({ length: VOLUME_ALERTS.storedJobs + 1 }, () => ({ userId: user.id, company: "x", title: "x", description: "x" })) });
  const body = await (await report()).json();
  assert.equal(body.alert, true);
  assert.equal(body.accountsCreating, VOLUME_ALERTS.accountsCreating + 1);
  assert.deepEqual(body.alerts.map((a) => a.split(":")[0]).sort(), ["accountsCreating", "aiCalls", "manualCreated", "newAccounts", "storedJobs"]);

  await prisma.job.deleteMany();
  assert.equal((await (await report()).json()).manualCreated, VOLUME_ALERTS.manualCreated + 1);
});

test("os padrões da migration mantêm os limites que estavam no código", () => {
  assert.equal(DEFAULTS.newAccountsPerDay, 20);
  assert.equal(DEFAULTS.globalManualJobsPerDay, JOB_LIMITS.globalManualDay);
  assert.equal(DEFAULTS.globalAiPerDay, 500);
  assert.deepEqual(VOLUME_ALERTS, { manualCreated: 200, accountsCreating: 5, newAccounts: 5, aiCalls: 300, storedJobs: 5000 });
});

test("teto de contas novas muda sem deploy, nos dois sentidos", async () => {
  for (let i = 0; i < NEW_ACCOUNTS_PER_DAY; i++) await account();
  assert.equal(await allowSignIn("nova@conta.dev", "google", "n2"), false);
  await updateAppSettings({ newAccountsPerDay: NEW_ACCOUNTS_PER_DAY + 1 });
  assert.equal(await allowSignIn("nova@conta.dev", "google", "n2"), true);
  await updateAppSettings({ newAccountsPerDay: 1 });
  assert.equal(await allowSignIn("nova@conta.dev", "google", "n2"), false);
});

test("teto global de cadastros muda sem deploy, na checagem e na reserva", async () => {
  await sitewide(JOB_LIMITS.globalManualDay);
  login(await account());
  assert.equal((await post()).status, 429);

  await updateAppSettings({ globalManualJobsPerDay: JOB_LIMITS.globalManualDay + 2 });
  assert.equal((await post()).status, 201);
  assert.equal((await post()).status, 201);
  assert.equal((await post()).status, 429);

  await updateAppSettings({ globalManualJobsPerDay: 1 });
  await checkJobCreationQuota((await account()).id, "n8n");
  login(await account());
  assert.equal((await post()).status, 429);
});

test("teto de IA barra antes do Gemini, sem contar dono nem n8n", async () => {
  const user = await account();
  const owner = await account({ isOwner: true });
  await updateAppSettings({ globalAiPerDay: 2 });
  const old = new Date(Date.now() - 2 * 86400000);
  await prisma.aiUsage.createMany({
    data: [
      { userId: user.id, action: "analyze_job" },
      { userId: user.id, action: "analyze_job", createdAt: old },
      { userId: user.id, action: "analyze_job_webhook_gupy" },
      { userId: owner.id, action: "analyze_job" },
    ],
  });
  assert.deepEqual(await checkIpRateLimit(null, user.id, 1), { allowed: true });

  login(await account());
  globalThis.__geminiCalls = 0;
  const res = await analyze(new NextRequest("http://localhost/api/analyze", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ description: input.description }),
  }));
  assert.equal(res.status, 429);
  assert.equal(res.headers.get("retry-after"), "3600");
  assert.match((await res.json()).error, /temporariamente limitada/);
  assert.equal(globalThis.__geminiCalls, 0);

  assert.deepEqual(await checkIpRateLimit(null, owner.id, 1), { allowed: true });
});

test("reservas simultâneas não passam do teto de IA", async () => {
  await updateAppSettings({ globalAiPerDay: 3 });
  const user = await account();
  const results = await Promise.all(Array.from({ length: 8 }, () => checkIpRateLimit(null, user.id, 1)));
  assert.equal(results.filter((result) => result.allowed).length, 3);
  assert.equal(await prisma.aiUsage.count(), 3);
});

test("alertas acompanham os tetos editados", async () => {
  await updateAppSettings({ newAccountsPerDay: 100, globalManualJobsPerDay: 1000, globalAiPerDay: 1000 });
  process.env.N8N_TARGET_USER_ID = (await account()).id;
  for (let i = 0; i < 5; i++) await account();
  assert.equal((await (await report()).json()).alert, false);

  await updateAppSettings({ newAccountsPerDay: 20 });
  const body = await (await report()).json();
  assert.deepEqual(body.alerts, ["newAccounts: 6 (limite 5)"]);
});

test("admin salva os tetos novos e recusa valor inválido", async () => {
  const admin = await account({ isAdmin: true });
  login(admin);
  const put = (body) => settingsRoute.PUT(new NextRequest("http://localhost/api/admin/settings", { method: "PUT", body: JSON.stringify(body) }));

  const res = await put({ newAccountsPerDay: 50, globalManualJobsPerDay: 800, globalAiPerDay: 900 });
  assert.equal(res.status, 200);
  const saved = await res.json();
  assert.equal(saved.newAccountsPerDay, 50);
  assert.equal(saved.globalManualJobsPerDay, 800);
  assert.equal(saved.globalAiPerDay, 900);
  assert.equal(saved.dailyAiLimit, DEFAULTS.dailyAiLimit);

  for (const invalid of [0, -1, 1.5, "20", 2147483648]) {
    assert.equal((await put({ newAccountsPerDay: invalid })).status, 400, String(invalid));
  }
  assert.equal((await put({ isOwner: true, id: "x" })).status, 200);
  assert.equal(await prisma.appSettings.count(), 1);

  login(await account());
  assert.equal((await put({ globalAiPerDay: 1 })).status, 404);
});

test("análise do n8n não entra no alerta de IA", async () => {
  const user = await account();
  process.env.N8N_TARGET_USER_ID = user.id;
  await prisma.aiUsage.createMany({ data: Array.from({ length: VOLUME_ALERTS.aiCalls + 1 }, () => ({ userId: user.id, action: "analyze_job_webhook_gupy" })) });
  assert.equal((await (await report()).json()).aiCalls, 0);
});
