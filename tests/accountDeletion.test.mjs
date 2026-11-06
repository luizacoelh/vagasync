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
const dir = mkdtempSync(join(tmpdir(), "vagasync-account-"));
process.env.NODE_ENV = "test";
delete process.env.DATABASE_TARGET;
process.env.DATABASE_URL = `file:${join(dir, "test.db").replace(/\\/g, "/")}`;

let prisma, deleteMyAccount, DELETED_ACCOUNT_NAME, checkAndConsumeGeminiQuota, adminUserRoute, adminUsersRoute, NextRequest;

before(async () => {
  execFileSync(process.execPath, [join(root, "node_modules/prisma/build/index.js"), "migrate", "deploy"], { cwd: root, env: process.env, stdio: "pipe" });
  ({ prisma } = await import("@/lib/prisma"));
  ({ DELETED_ACCOUNT_NAME } = await import("@/lib/accountDeletion"));
  ({ deleteMyAccount } = await import("@/app/actions/account"));
  ({ checkAndConsumeGeminiQuota } = await import("@/lib/rateLimit"));
  ({ NextRequest } = await import("next/server"));
  adminUserRoute = await import("@/app/api/admin/users/[id]/route");
  adminUsersRoute = await import("@/app/api/admin/users/route");
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
async function fullUser(data = {}) {
  const n = ++seq;
  const user = await prisma.user.create({
    data: { name: `Pessoa ${n}`, email: `p${n}@teste.dev`, image: "https://img.dev/a.png", isAdmin: true, ...data },
  });
  await prisma.account.create({
    data: { userId: user.id, type: "oauth", provider: "github", providerAccountId: `gh-${n}` },
  });
  await prisma.userProfile.create({ data: { userId: user.id } });
  await prisma.job.create({ data: { userId: user.id, company: "Empresa", title: "Vaga", description: "Descrição." } });
  const old = new Date(Date.now() - 2 * 3600000);
  await prisma.aiUsage.create({ data: { userId: user.id, action: "analyze_job", ip: "203.0.113.9", createdAt: old } });
  await prisma.aiUsage.create({ data: { userId: user.id, action: "import_url", ip: "203.0.113.9" } });
  globalThis.__session = { user: { id: user.id } };
  globalThis.__signOut = undefined;
  return user;
}

test("excluir conta apaga os dados pessoais e mantém o uso anônimo", async () => {
  const user = await fullUser();
  const other = await prisma.user.create({ data: { name: "Outra" } });
  await prisma.job.create({ data: { userId: other.id, company: "X", title: "Y", description: "Z" } });

  assert.equal(await deleteMyAccount("EXCLUIR"), undefined);
  assert.deepEqual(globalThis.__signOut, { redirectTo: "/" });

  const row = await prisma.user.findUnique({ where: { id: user.id } });
  assert.equal(row.name, DELETED_ACCOUNT_NAME);
  assert.equal(row.email, null);
  assert.equal(row.image, null);
  assert.equal(row.isAdmin, false);
  assert.equal(row.dailyAiLimitOverride, 0);
  assert.equal(row.createdAt.getTime(), user.createdAt.getTime());
  assert.equal(await prisma.job.count({ where: { userId: user.id } }), 0);
  assert.equal(await prisma.account.count({ where: { userId: user.id } }), 0);
  assert.equal(await prisma.userProfile.count({ where: { userId: user.id } }), 0);
  // O IP com mais de 1h sai; o da última hora fica para os limites por IP.
  const usage = await prisma.aiUsage.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } });
  assert.deepEqual(usage.map((u) => u.ip), [null, "203.0.113.9"]);
  // A conta dos outros não muda.
  assert.equal(await prisma.job.count({ where: { userId: other.id } }), 1);
});

test("sem a confirmação certa ou sem login, nada é apagado", async () => {
  const user = await fullUser();
  assert.match((await deleteMyAccount("excluir")).error, /EXCLUIR/);
  assert.match((await deleteMyAccount(undefined)).error, /EXCLUIR/);
  assert.equal(await prisma.job.count({ where: { userId: user.id } }), 1);
  assert.equal(globalThis.__signOut, undefined);

  globalThis.__session = null;
  assert.equal((await deleteMyAccount("EXCLUIR")).error, "Não autenticado.");
  assert.equal((await prisma.user.findUnique({ where: { id: user.id } })).email, user.email);
});

test("a conta da dona não é excluída", async () => {
  const owner = await fullUser({ isOwner: true });
  assert.match((await deleteMyAccount("EXCLUIR")).error, /dona/);
  const row = await prisma.user.findUnique({ where: { id: owner.id } });
  assert.equal(row.email, owner.email);
  assert.equal(await prisma.job.count({ where: { userId: owner.id } }), 1);
  assert.equal(globalThis.__signOut, undefined);
});

test("a exclusão seguinte limpa o IP antigo de contas já excluídas", async () => {
  const first = await fullUser();
  await deleteMyAccount("EXCLUIR");
  // Simula a hora passando para o uso recente da primeira conta.
  await prisma.aiUsage.updateMany({ where: { userId: first.id }, data: { createdAt: new Date(Date.now() - 2 * 3600000) } });
  const live = await prisma.user.create({ data: { name: "Ativa", email: "ativa@teste.dev" } });
  await prisma.aiUsage.create({ data: { userId: live.id, action: "analyze_job", ip: "198.51.100.1", createdAt: new Date(Date.now() - 2 * 3600000) } });

  await fullUser();
  await deleteMyAccount("EXCLUIR");
  assert.equal(await prisma.aiUsage.count({ where: { userId: first.id, ip: { not: null } } }), 0);
  // Conta ativa não é tocada.
  assert.equal(await prisma.aiUsage.count({ where: { userId: live.id, ip: "198.51.100.1" } }), 1);
});

test("conta excluída não usa IA nem depois de a janela de 24h vencer", async () => {
  const user = await fullUser();
  await deleteMyAccount("EXCLUIR");
  await prisma.user.update({
    where: { id: user.id },
    data: { geminiCallCount: 0, geminiCallResetAt: new Date(Date.now() - 2 * 86400000) },
  });
  const result = await checkAndConsumeGeminiQuota(user.id);
  assert.equal(result.allowed, false);
  assert.equal((await prisma.user.findUnique({ where: { id: user.id } })).geminiCallCount, 0);
});

test("o admin não altera conta excluída", async () => {
  const target = await fullUser();
  await deleteMyAccount("EXCLUIR");
  const admin = await prisma.user.create({ data: { name: "Admin", email: "admin@teste.dev", isAdmin: true } });
  globalThis.__session = { user: { id: admin.id, isAdmin: true } };
  for (const body of [{ dailyAiLimitOverride: 50 }, { dailyAiLimitOverride: null }, { isAdmin: true }]) {
    const req = new NextRequest(`http://localhost/api/admin/users/${target.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const res = await adminUserRoute.PATCH(req, { params: Promise.resolve({ id: target.id }) });
    assert.equal(res.status, 400);
  }
  const row = await prisma.user.findUnique({ where: { id: target.id } });
  assert.equal(row.dailyAiLimitOverride, 0);
  assert.equal(row.isAdmin, false);
});

test("a lista de usuários do admin esconde as contas excluídas", async () => {
  const gone = await fullUser();
  await deleteMyAccount("EXCLUIR");
  const kept = await fullUser();
  const noName = await prisma.user.create({ data: { email: "semnome@teste.dev" } });
  const noEmail = await prisma.user.create({ data: { name: "Sem e-mail" } });
  const blank = await prisma.user.create({ data: {} });
  globalThis.__session = { user: { id: kept.id, isAdmin: true } };
  const res = await adminUsersRoute.GET();
  assert.equal(res.status, 200);
  const ids = (await res.json()).map((u) => u.id);
  for (const u of [kept, noName, noEmail, blank]) assert.ok(ids.includes(u.id));
  assert.ok(!ids.includes(gone.id));
});
