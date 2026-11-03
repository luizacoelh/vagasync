import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import http from "node:http";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

register("./support/ts-loader.mjs", import.meta.url);
const root = fileURLToPath(new URL("..", import.meta.url));
const fixture = (name) => readFileSync(join(root, "tests/fixtures/importar", name), "utf8");
const dir = mkdtempSync(join(tmpdir(), "vagasync-importar-"));
process.env.NODE_ENV = "test";
delete process.env.DATABASE_TARGET;
process.env.DATABASE_URL = `file:${join(dir, "test.db").replace(/\\/g, "/")}`;

let prisma, NextRequest, route, safe, extract, imp, quota, types, ipRateLimit, aiUsageStats, usersRoute, appSettings;
let server, port;

before(async () => {
  execFileSync(process.execPath, [join(root, "node_modules/prisma/build/index.js"), "migrate", "deploy"], {
    cwd: root,
    env: process.env,
    stdio: "pipe",
  });
  ({ prisma } = await import("@/lib/prisma"));
  ({ NextRequest } = await import("next/server"));
  route = await import("@/app/api/vaga/importar/route");
  usersRoute = await import("@/app/api/admin/users/route");
  safe = await import("@/lib/safeFetch");
  extract = await import("@/lib/jobImport/extract");
  imp = await import("@/lib/jobImport/importUrl");
  quota = await import("@/lib/jobImport/quota");
  types = await import("@/lib/jobImport/types");
  ipRateLimit = await import("@/lib/ipRateLimit");
  aiUsageStats = await import("@/lib/aiUsageStats");
  appSettings = await import("@/lib/appSettings");

  // Servidor local para os testes de rede. Só é alcançável porque os testes
  // liberam 127.0.0.1 e a porta dele; a rota usa as regras padrão.
  server = http.createServer((req, res) => {
    const path = req.url ?? "/";
    if (path === "/ok") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end("<html><body><main>Vaga de teste</main></body></html>");
    } else if (path.startsWith("/redirect/")) {
      res.writeHead(302, { location: decodeURIComponent(path.slice("/redirect/".length)) });
      res.end();
    } else if (path.startsWith("/loop/")) {
      const n = Number(path.slice(6));
      res.writeHead(302, { location: `/loop/${n + 1}` });
      res.end();
    } else if (path === "/grande") {
      res.writeHead(200, { "content-type": "text/html" });
      const chunk = Buffer.alloc(64 * 1024, "a");
      let sent = 0;
      const pump = () => {
        while (sent < 3 * 1024 * 1024) {
          sent += chunk.length;
          if (!res.write(chunk)) return res.once("drain", pump);
        }
        res.end();
      };
      pump();
    } else if (path === "/grande-declarada") {
      res.writeHead(200, { "content-type": "text/html", "content-length": String(3 * 1024 * 1024) });
      res.end("a");
    } else if (path === "/lenta") {
      res.writeHead(200, { "content-type": "text/html" });
      res.write("<html>");
      // nunca termina
    } else if (path === "/gzip") {
      res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" });
      res.end(zlib.gzipSync("<html><body>comprimido</body></html>"));
    } else if (path === "/bomba") {
      res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" });
      res.end(zlib.gzipSync(Buffer.alloc(5 * 1024 * 1024, "a")));
    } else if (path === "/pdf") {
      res.writeHead(200, { "content-type": "application/pdf" });
      res.end("%PDF");
    } else {
      res.writeHead(404, { "content-type": "text/html" });
      res.end("não achei");
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = server.address().port;
});

after(async () => {
  server?.closeAllConnections?.();
  server?.close();
  await prisma?.$disconnect();
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch (error) {
    if (error.code !== "EBUSY") throw error;
  }
});

beforeEach(async () => {
  await prisma.aiUsage.deleteMany();
  await prisma.job.deleteMany();
  await prisma.appSettings.deleteMany();
});

// Liberado só para o servidor local; "interno.test" resolve para a rede interna.
const local = {
  allowedPorts: [80, 443],
  allowAddress: (address) => address === "127.0.0.1",
  resolve: async (host) => (host === "interno.test" ? ["10.0.0.5"] : ["127.0.0.1"]),
};
const opts = (extra = {}) => ({ ...local, allowedPorts: [80, 443, port], ...extra });
const at = (path) => `http://site.test:${port}${path}`;

async function code(promise) {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof safe.SafeFetchError, `erro inesperado: ${error}`);
    return error.code;
  }
  assert.fail("devia recusar");
}

// ---------- SSRF ----------

test("recusa cada faixa interna ou reservada e aceita endereço público", () => {
  for (const address of [
    "127.0.0.1", "127.255.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1",
    "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255",
    "::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "ff02::1",
    "::ffff:10.0.0.1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:8.8.8.8", "64:ff9b::a00:1",
  ]) {
    assert.equal(safe.isPublicAddress(address), false, address);
  }
  for (const address of ["8.8.8.8", "172.32.0.1", "100.128.0.1", "2606:4700:4700::1111"]) {
    assert.equal(safe.isPublicAddress(address), true, address);
  }
  assert.equal(safe.isPublicAddress("não é ip"), false);
});

test("recusa protocolo, credencial, porta e nome local", () => {
  for (const url of [
    "ftp://site.com/vaga",
    "file:///etc/passwd",
    "https://user:senha@site.com/",
    "https://site.com:8443/vaga",
    "http://localhost/",
    "http://app.localhost/",
    "http://servidor.internal/",
    `https://site.com/${"a".repeat(2000)}`,
  ]) {
    assert.throws(() => safe.parsePublicUrl(url), (error) => error.code === "url_recusada", url);
  }
  assert.equal(safe.parsePublicUrl("https://site.com:443/vaga#topo").href, "https://site.com/vaga");
});

test("recusa nome que resolve para a rede interna, mesmo com um endereço público junto", async () => {
  assert.equal(await code(safe.safeFetch("https://interno.test/", { resolve: async () => ["10.0.0.5"] })), "url_recusada");
  assert.equal(await code(safe.safeFetch("https://misto.test/", { resolve: async () => ["8.8.8.8", "127.0.0.1"] })), "url_recusada");
  assert.equal(await code(safe.safeFetch("http://169.254.169.254/latest/meta-data/")), "url_recusada");
  assert.equal(await code(safe.safeFetch("http://[::1]/")), "url_recusada");
});

test("lê página, segue redirecionamento e descomprime", async () => {
  const page = await safe.safeFetch(at(`/redirect/${encodeURIComponent("/ok")}`), opts());
  assert.equal(page.status, 200);
  assert.equal(page.url, at("/ok"));
  assert.match(page.body, /Vaga de teste/);
  assert.match((await safe.safeFetch(at("/gzip"), opts())).body, /comprimido/);
});

test("redirecionamento para a rede interna, outra porta ou site bloqueado é recusado", async () => {
  const to = (target) => at(`/redirect/${encodeURIComponent(target)}`);
  assert.equal(await code(safe.safeFetch(to(`http://interno.test:${port}/ok`), opts())), "url_recusada");
  assert.equal(await code(safe.safeFetch(to("http://site.test:22/"), opts())), "url_recusada");
  assert.equal(await code(safe.safeFetch(to("http://127.0.0.1:8080/"), opts())), "url_recusada");
  const blocked = await code(
    safe.safeFetch(to("https://www.linkedin.com/jobs/view/1"), opts({ isBlockedHost: (h) => h.endsWith("linkedin.com") })),
  );
  assert.equal(blocked, "site_bloqueado");
});

test("no máximo 3 redirecionamentos", async () => {
  assert.equal((await safe.safeFetch(at("/loop/1"), { ...opts(), maxRedirects: 3 }).catch((e) => e)).code, "leitura_falhou");
});

test("corta resposta acima de 2 MB, inclusive comprimida", async () => {
  assert.equal(await code(safe.safeFetch(at("/grande"), opts())), "pagina_grande_demais");
  assert.equal(await code(safe.safeFetch(at("/grande-declarada"), opts())), "pagina_grande_demais");
  assert.equal(await code(safe.safeFetch(at("/bomba"), opts())), "pagina_grande_demais");
});

test("interrompe pelo tempo total", async () => {
  const started = Date.now();
  assert.equal(await code(safe.safeFetch(at("/lenta"), opts({ timeoutMs: 300 }))), "tempo_esgotado");
  assert.ok(Date.now() - started < 3000);
  const slowDns = { ...opts({ timeoutMs: 200 }), resolve: () => new Promise(() => {}) };
  assert.equal(await code(safe.safeFetch(at("/ok"), slowDns)), "tempo_esgotado");
});

test("recusa formato que não é página nem JSON; página de erro volta com o status", async () => {
  assert.equal(await code(safe.safeFetch(at("/pdf"), opts())), "formato_nao_suportado");
  assert.equal((await safe.safeFetch(at("/nada"), opts())).status, 404);
});

// ---------- Extração ----------

test("JSON-LD: título, empresa, salário e modalidade", () => {
  const result = extract.extractFromHtml(fixture("jsonld.html"));
  assert.equal(result.titulo, "Desenvolvedora Back-end Júnior");
  assert.equal(result.empresa, "Empresa Exemplo");
  assert.match(result.texto, /Node\.js/);
  assert.match(result.texto, /- PostgreSQL/);
  assert.match(result.texto, /Salário: BRL 4000 a 5500 por mês/);
  assert.match(result.texto, /Local: Remoto/);
  assert.doesNotMatch(result.texto, /<li>|Menu do site/);
});

test("Remotar (__NEXT_DATA__): empresa, seções, salário e etiquetas sem emoji", () => {
  const result = extract.extractFromHtml(fixture("remotar.html"));
  assert.equal(result.titulo, "Pessoa Desenvolvedora Front-end Júnior");
  assert.equal(result.empresa, "Empresa Remota");
  assert.match(result.texto, /React/);
  assert.match(result.texto, /Salário: BRL 3000 a 4000/);
  assert.match(result.texto, /Modalidade: Remoto/);
  assert.match(result.texto, /Etiquetas: Júnior, 100% Remoto/);
  assert.doesNotMatch(result.texto, /Outra vaga parecida/);
});

test("Gupy (__NEXT_DATA__): name, careerPage e requisitos", () => {
  const result = extract.extractFromHtml(fixture("gupy.html"));
  assert.equal(result.titulo, "Estágio em Desenvolvimento de Software");
  assert.equal(result.empresa, "Empresa da Gupy");
  assert.match(result.texto, /Responsabilidades:\n- Desenvolver APIs/);
  assert.match(result.texto, /Requisitos:\n- Cursando Ciência da Computação/);
  assert.match(result.texto, /Python/);
});

test("último recurso: texto principal sem menu, rodapé e scripts", () => {
  const result = extract.extractFromHtml(fixture("pagina-simples.html"));
  assert.equal(result.titulo, "Analista de Dados Pleno");
  assert.equal(result.empresa, "Carreiras Exemplo");
  assert.match(result.texto, /SQL e Power BI/);
  assert.doesNotMatch(result.texto, /Menu|Rodapé|console\.log/);
});

test("detecta captcha, login e página só com JavaScript", () => {
  assert.equal(extract.pageProblem('<html><div id="cf-chl-widget"></div>Just a moment...</html>', 30), "desafio_ou_captcha");
  assert.equal(extract.pageProblem('<form><input type="password"></form>', 40), "exige_login");
  assert.equal(extract.pageProblem('<div id="root"></div><script src="app.js"></script>', 0), "pagina_so_javascript");
  assert.equal(extract.pageProblem("<main>texto</main>", 2000), null);
});

test("issue do GitHub vai pela API pública", () => {
  assert.equal(
    extract.githubIssueApi(new URL("https://github.com/frontendbr/vagas/issues/123")),
    "https://api.github.com/repos/frontendbr/vagas/issues/123",
  );
  assert.equal(extract.githubIssueApi(new URL("https://github.com/frontendbr/vagas")), null);
  const result = extract.extractFromGithubIssue(
    JSON.stringify({ title: "[Remoto] Dev React", body: "## Requisitos\n- React\n- TypeScript", labels: [{ name: "Júnior" }] }),
  );
  assert.equal(result.titulo, "[Remoto] Dev React");
  assert.match(result.texto, /TypeScript/);
  assert.match(result.texto, /Etiquetas: Júnior/);
});

// ---------- Fluxo da importação (sem rede) ----------

function deps(overrides = {}) {
  const calls = { reserve: 0, fetch: [], find: [] };
  return {
    calls,
    deps: {
      maxTextChars: 8000,
      findJobByUrl: async (urls) => {
        calls.find.push(urls);
        return null;
      },
      reserve: async () => {
        calls.reserve++;
        return true;
      },
      fetchPage: async (url) => {
        calls.fetch.push(url);
        return { status: 200, url, contentType: "text/html", body: fixture("jsonld.html") };
      },
      ...overrides,
    },
  };
}
const u = (s) => new URL(s);

test("vaga lida: link sem rastreio, site e texto pronto para a confirmação", async () => {
  const { deps: d, calls } = deps();
  const result = await imp.importJobFromUrl(u("https://Empresa.gupy.io/jobs/123?jobBoardSource=gupy_public_page&utm_source=x#topo"), d);
  assert.equal(result.status, "ok");
  assert.equal(result.vaga.urlFinal, "https://empresa.gupy.io/jobs/123");
  assert.equal(result.vaga.site, "empresa.gupy.io");
  assert.equal(result.vaga.titulo, "Desenvolvedora Back-end Júnior");
  assert.deepEqual(result.vaga.avisos, []);
  assert.equal(calls.reserve, 1);
});

test("link já cadastrado não baixa nem gasta cota, inclusive com parâmetro de rastreio", async () => {
  const { deps: d, calls } = deps({ findJobByUrl: async (urls) => (urls.includes("https://empresa.gupy.io/jobs/9") ? "job-9" : null) });
  const result = await imp.importJobFromUrl(u("https://empresa.gupy.io/jobs/9?jobBoardSource=gupy_public_page"), d);
  assert.deepEqual(result, { status: "duplicada", jobId: "job-9" });
  assert.equal(calls.reserve, 0);
  assert.equal(calls.fetch.length, 0);
});

test("duplicata também é conferida no endereço final", async () => {
  const { deps: d } = deps({
    findJobByUrl: async (urls) => (urls.includes("https://site.com/vaga-final") ? "job-final" : null),
    fetchPage: async () => ({ status: 200, url: "https://site.com/vaga-final", contentType: "text/html", body: "" }),
  });
  assert.deepEqual(await imp.importJobFromUrl(u("https://encurta.do/x"), d), { status: "duplicada", jobId: "job-final" });
});

test("LinkedIn e Indeed vão para colar texto sem baixar e sem gastar cota", async () => {
  for (const link of ["https://www.linkedin.com/jobs/view/123", "https://br.indeed.com/viewjob?jk=1"]) {
    const { deps: d, calls } = deps();
    const result = await imp.importJobFromUrl(u(link), d);
    assert.equal(result.status, "colar_texto");
    assert.equal(result.motivo, "site_bloqueado");
    assert.equal(result.url, link);
    assert.equal(calls.reserve + calls.fetch.length, 0);
  }
});

test("endereço interno é recusado antes da cota", async () => {
  const { deps: d, calls } = deps();
  const result = await imp.importJobFromUrl(u("http://192.168.0.1/admin"), d);
  assert.equal(result.motivo, "url_recusada");
  assert.equal(calls.reserve, 0);
});

test("limite atingido não baixa a página", async () => {
  const { deps: d, calls } = deps({ reserve: async () => false });
  assert.deepEqual(await imp.importJobFromUrl(u("https://site.com/vaga"), d), { status: "limite" });
  assert.equal(calls.fetch.length, 0);
});

test("status e falhas da leitura viram colar texto com mensagem sem detalhes internos", async () => {
  const cases = [
    [{ status: 403, body: "proibido" }, "acesso_negado"],
    [{ status: 503, body: "<html>Just a moment...<div id=cf-chl></div>" }, "desafio_ou_captcha"],
    [{ status: 404, body: "" }, "leitura_falhou"],
    [{ status: 200, body: '<div id="root"></div>' }, "pagina_so_javascript"],
    [{ status: 200, body: '<form><input type="password"></form><p>Entre na sua conta</p>' }, "exige_login"],
  ];
  for (const [page, motivo] of cases) {
    const { deps: d } = deps({ fetchPage: async (url) => ({ url, contentType: "text/html", ...page }) });
    const result = await imp.importJobFromUrl(u("https://site.com/vaga?id=1"), d);
    assert.equal(result.status, "colar_texto");
    assert.equal(result.motivo, motivo);
    assert.equal(result.url, "https://site.com/vaga?id=1");
    assert.doesNotMatch(result.mensagem, /<|10\.|127\./);
  }
  const { deps: d } = deps({ fetchPage: async () => Promise.reject(new safe.SafeFetchError("tempo_esgotado", "https://site.com/vaga")) });
  assert.equal((await imp.importJobFromUrl(u("https://site.com/vaga"), d)).motivo, "tempo_esgotado");
  const crash = deps({ fetchPage: async () => Promise.reject(new Error("ECONNRESET 10.0.0.1")) });
  const failed = await imp.importJobFromUrl(u("https://site.com/vaga"), crash.deps);
  assert.equal(failed.motivo, "leitura_falhou");
  assert.doesNotMatch(failed.mensagem, /10\.0/);
});

test("texto curto e texto longo aparecem com aviso, nunca descartados", async () => {
  const short = deps({
    fetchPage: async (url) => ({ url, status: 200, contentType: "text/html", body: `<main>${"Vaga curta. ".repeat(15)}</main>` }),
  });
  const shortResult = await imp.importJobFromUrl(u("https://site.com/curta"), short.deps);
  assert.equal(shortResult.status, "ok");
  assert.deepEqual(shortResult.vaga.avisos, ["texto_incompleto"]);

  const long = deps({ maxTextChars: 200 });
  const longResult = await imp.importJobFromUrl(u("https://site.com/longa"), long.deps);
  assert.ok(longResult.vaga.texto.length <= 200);
  assert.ok(longResult.vaga.avisos.includes("texto_cortado"));
});

test("issue do GitHub: busca na API e guarda o link da issue", async () => {
  const fetched = [];
  const { deps: d } = deps({
    fetchPage: async (url) => ({
      url: (fetched.push(url), url),
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ title: "Dev Python", body: "Requisitos: Python, Django e SQL. ".repeat(12) }),
    }),
  });
  const result = await imp.importJobFromUrl(u("https://github.com/backend-br/vagas/issues/42"), d);
  assert.deepEqual(fetched, ["https://api.github.com/repos/backend-br/vagas/issues/42"]);
  assert.equal(result.vaga.urlFinal, "https://github.com/backend-br/vagas/issues/42");
  assert.equal(result.vaga.titulo, "Dev Python");
});

// ---------- Rota e banco ----------

function post(body, ip = "203.0.113.9") {
  return new NextRequest("http://localhost/api/vaga/importar", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
async function login(data = {}) {
  const user = await prisma.user.create({ data });
  globalThis.__session = { user: { id: user.id } };
  return user;
}

test("rota exige login", async () => {
  globalThis.__session = null;
  assert.equal((await route.POST(post({ url: "https://site.com/vaga" }))).status, 401);
});

test("rota recusa corpo ou link inválido com 400", async () => {
  await login();
  for (const body of ["{", { url: 1 }, {}, { url: "isso não é link" }, { url: "javascript:alert(1)" }, { url: `https://a.com/${"a".repeat(2001)}` }]) {
    const res = await route.POST(post(body));
    assert.equal(res.status, 400, JSON.stringify(body).slice(0, 40));
    assert.equal(typeof (await res.json()).error, "string");
  }
});

test("rota: duplicata e site bloqueado sem rede e sem registrar importação", async () => {
  const user = await login();
  const job = await prisma.job.create({
    data: { userId: user.id, company: "E", title: "V", description: "Descrição da vaga de teste.", url: "https://empresa.gupy.io/jobs/7" },
  });
  const dup = await (await route.POST(post({ url: "https://empresa.gupy.io/jobs/7?jobBoardSource=gupy_public_page" }))).json();
  assert.deepEqual(dup, { status: "duplicada", jobId: job.id });
  const blocked = await (await route.POST(post({ url: "https://www.linkedin.com/jobs/view/1" }))).json();
  assert.equal(blocked.motivo, "site_bloqueado");
  assert.equal(await prisma.aiUsage.count(), 0);

  // A vaga de outra conta não conta como duplicata.
  await login();
  const other = await (await route.POST(post({ url: "https://empresa.gupy.io/jobs/7" }))).json();
  assert.notEqual(other.status, "duplicada");
});

test("rota responde 429 no limite por hora da conta", async () => {
  const user = await login();
  await prisma.aiUsage.createMany({
    data: Array.from({ length: types.IMPORT_QUOTA.perHour }, () => ({ userId: user.id, action: "import_url" })),
  });
  const res = await route.POST(post({ url: "https://site.com/vaga" }));
  assert.equal(res.status, 429);
  assert.match((await res.json()).error, /Limite de importações/);
});

test("cota de importação: por hora, por dia e por IP", async () => {
  const a = await prisma.user.create({ data: {} });
  const b = await prisma.user.create({ data: {} });
  for (let i = 0; i < types.IMPORT_QUOTA.perHour; i++) assert.equal(await quota.reserveImport(a.id, null), true);
  assert.equal(await quota.reserveImport(a.id, null), false);

  const old = new Date(Date.now() - 2 * 3600000);
  await prisma.aiUsage.updateMany({ where: { userId: a.id }, data: { createdAt: old } });
  await prisma.aiUsage.createMany({
    data: Array.from({ length: types.IMPORT_QUOTA.perDay - types.IMPORT_QUOTA.perHour }, () => ({
      userId: a.id, action: "import_url", createdAt: old,
    })),
  });
  assert.equal(await quota.reserveImport(a.id, null), false);

  await prisma.aiUsage.createMany({
    data: Array.from({ length: types.IMPORT_QUOTA.perIpHour }, () => ({ userId: a.id, action: "import_url", ip: "198.51.100.7" })),
  });
  assert.equal(await quota.reserveImport(b.id, "198.51.100.7"), false);
  assert.equal(await quota.reserveImport(b.id, "198.51.100.8"), true);
  assert.equal(await quota.reserveImport("conta-que-nao-existe", null), false);
});

test("importações ficam fora do limite de IA por IP, do painel e da contagem do admin", async () => {
  const user = await prisma.user.create({ data: { isAdmin: true } });
  await appSettings.updateAppSettings({ ipHourlyLimit: 2 });
  await prisma.aiUsage.createMany({
    data: Array.from({ length: 5 }, () => ({ userId: user.id, action: "import_url", ip: "198.51.100.20" })),
  });
  assert.deepEqual(await ipRateLimit.checkIpRateLimit("198.51.100.20", user.id, 1), { allowed: true });

  const stats = await aiUsageStats.getAiUsageStats();
  assert.equal(stats.totalCalls, 1);
  assert.equal(stats.byDay.reduce((sum, day) => sum + day.calls, 0), 1);

  globalThis.__session = { user: { id: user.id } };
  const users = await (await usersRoute.GET()).json();
  assert.equal(users.find((row) => row.id === user.id)._count.aiUsage, 1);
});
