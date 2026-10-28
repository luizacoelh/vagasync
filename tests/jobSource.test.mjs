// node --test tests/ — Job.source gravado de verdade num SQLite descartável:
// vaga nova pelo webhook do n8n fica "n8n", cadastro manual (Server Action
// createJob) fica "manual". O Gemini é simulado (tests/support/stubs/), sem
// chamar a API; o banco é criado pelas migrations num diretório temporário.
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
const dir = mkdtempSync(join(tmpdir(), "vagasync-source-"));
const dbUrl = `file:${join(dir, "test.db").replace(/\\/g, "/")}`;
const SECRET = "segredo-de-teste";

// Antes de qualquer import do app: lib/prisma.ts escolhe o banco ao carregar
process.env.NODE_ENV = "test";
delete process.env.DATABASE_TARGET;
process.env.DATABASE_URL = dbUrl;
process.env.GEMINI_API_KEY = "teste-sem-rede";
process.env.N8N_WEBHOOK_SECRET = SECRET;

let prisma;
let webhook;
let createJob;
let NextRequest;
let userId;

const analise = {
  company: "Nimbus",
  title: "Estágio em Desenvolvimento Web",
  summary: "Estágio remoto em desenvolvimento web.",
  requirements: ["JavaScript"],
  differentials: [],
  technologies: ["React"],
  questions: [],
  checklist: [],
  location: "REMOTO",
  salary: null,
};

before(async () => {
  execFileSync(process.execPath, [join(root, "node_modules/prisma/build/index.js"), "migrate", "deploy"], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: dbUrl },
    stdio: "pipe",
  });
  ({ prisma } = await import("@/lib/prisma"));
  ({ POST: webhook } = await import("@/app/api/webhook/n8n/route"));
  ({ createJob } = await import("@/app/actions/jobs"));
  ({ NextRequest } = await import("next/server"));

  userId = (await prisma.user.create({ data: { email: "teste@vagasync.local" } })).id;
  process.env.N8N_TARGET_USER_ID = userId;
  globalThis.__session = { user: { id: userId } };
});

after(async () => {
  await prisma?.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

const enviar = (body) =>
  webhook(
    new NextRequest("http://localhost/api/webhook/n8n", {
      method: "POST",
      headers: { "content-type": "application/json", "x-webhook-secret": SECRET },
      body: JSON.stringify(body),
    })
  );

test("vaga nova pelo webhook é gravada com source n8n, sem o nome do provedor", async () => {
  globalThis.__geminiReply = analise;
  globalThis.__geminiCalls = 0;
  const res = await enviar({
    description: "Estágio em Desenvolvimento Web na Nimbus, remoto, com React e JavaScript.",
    url: "https://himalayas.app/j/estagio-web",
    source: "himalayas",
    title: analise.title,
    company: analise.company,
  });
  assert.equal(res.status, 201);
  assert.equal(globalThis.__geminiCalls, 1);
  const body = await res.json();
  // a resposta HTTP continua informando o provedor
  assert.equal(body.source, "himalayas");

  const job = await prisma.job.findUnique({ where: { id: body.id } });
  assert.equal(job.source, "n8n");
  assert.equal(job.status, "MONITORADA");
  assert.equal(job.userId, userId);
  const uso = await prisma.aiUsage.findFirst({ where: { userId } });
  assert.equal(uso.action, "analyze_job_webhook_himalayas");
});

test("vaga repetida no webhook não chama a IA nem cria outra linha", async () => {
  globalThis.__geminiCalls = 0;
  const res = await enviar({
    description: "Estágio em Desenvolvimento Web na Nimbus, remoto, com React e JavaScript.",
    url: "https://himalayas.app/j/estagio-web",
    source: "himalayas",
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).duplicate, true);
  assert.equal(globalThis.__geminiCalls, 0);
  assert.equal(await prisma.job.count({ where: { source: "n8n" } }), 1);
});

test("cadastro manual mantém source manual", async () => {
  const result = await createJob({
    description: "Vaga cadastrada pela interface, colando o texto.",
    company: "Ponte",
    title: "Desenvolvedora Júnior",
    requirements: [],
    technologies: [],
    questions: [],
    checklist: [],
  });
  assert.equal(result.ok, true);
  const job = await prisma.job.findUnique({ where: { id: result.id } });
  assert.equal(job.source, "manual");
  assert.equal(job.status, "APLICADA");
});
