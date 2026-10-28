// Resume a saída de `n8n execute` (usado no GitHub Actions): quantas vagas
// cada nó processou e o que o VagaSync respondeu para cada uma. Não imprime a
// saída bruta, que tem o texto completo das vagas.
//
// Uso: node n8n-execution-summary.mjs <arquivo-com-a-saida>
// Sai com código 1 se a execução falhou ou se o webhook recusou o segredo.
import { readFileSync } from "node:fs";

const raw = readFileSync(process.argv[2], "utf8");
// Antes do JSON o n8n escreve linhas de log
const start = raw.search(/^\{/m);
if (start === -1) {
  console.error("Saída do n8n sem resultado:\n" + raw.slice(-2000));
  process.exit(1);
}
const execution = JSON.parse(raw.slice(start));
const { runData = {}, error } = execution.data?.resultData ?? {};

for (const [node, runs] of Object.entries(runData)) {
  const items = runs[0]?.data?.main?.[0]?.length ?? 0;
  const err = runs[0]?.error?.message;
  console.log(`${node}: ${items}${err ? ` (erro: ${err})` : ""}`);
}

const buscas = runData["Fontes"]?.[0]?.data?.main?.[0] ?? [];
const auth = buscas.some((i) => i.json.auth);
console.log(`Token do GitHub nas buscas: ${auth ? "sim" : "não"}`);

// Por busca: itens que a fonte devolveu e candidatas aprovadas em "Montar
// vagas" (cada candidata traz em `buscas` as posições de "Fontes" onde
// apareceu). Base para decidir sobre buscas que nunca trazem vaga.
const respostas = runData["Buscar vagas"]?.[0]?.data?.main?.[0] ?? [];
const aprovadas = new Map();
for (const item of runData["Montar vagas"]?.[0]?.data?.main?.[0] ?? []) {
  for (const i of item.json.buscas ?? []) aprovadas.set(i, (aprovadas.get(i) ?? 0) + 1);
}
if (buscas.length) console.log("Por busca (itens / aprovadas):");
buscas.forEach((item, i) => {
  const itens = countItems(respostas[i]?.json?.data);
  console.log(`  ${searchLabel(item.json.url)}: ${itens ?? "sem resposta"} / ${aprovadas.get(i) ?? 0}`);
});

// Quantas vagas a resposta da fonte trouxe, no mesmo formato que "Montar
// vagas" lê. null quando a busca falhou ou o formato mudou.
function countItems(body) {
  if (typeof body !== "string" || body === "") return null;
  try {
    if (body.trimStart().startsWith("<")) {
      const m = body.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
      const list = m && JSON.parse(m[1]).props?.pageProps?.initialJobList?.data;
      return Array.isArray(list) ? list.length : null;
    }
    const data = JSON.parse(body);
    const list = Array.isArray(data) ? data : data.data ?? data.jobs;
    return Array.isArray(list) ? list.length : null;
  } catch {
    return null;
  }
}

// "remotar estágio", "github soujava/vagas-java", "gupy term=estágio ti&state=Piauí"...
function searchLabel(url) {
  try {
    const u = new URL(url);
    if (u.hostname === "api.github.com") return `github ${u.pathname.split("/").slice(2, 4).join("/")}`;
    if (u.hostname.endsWith("remotar.com.br")) return `remotar ${u.searchParams.get("search")}`;
    if (u.hostname.endsWith("gupy.io")) {
      const q = new URLSearchParams(decodeURIComponent(u.pathname.split("/").pop()));
      for (const k of ["type", "sortBy", "sortOrder"]) q.delete(k);
      return `gupy ${decodeURIComponent(q.toString().replace(/\+/g, " "))}`;
    }
    const q = new URLSearchParams(u.search);
    q.delete("sort");
    return `${u.hostname.replace(/^www\./, "").split(".")[0]} ${decodeURIComponent(q.toString().replace(/\+/g, " "))}`;
  } catch {
    return String(url);
  }
}

// Checagem em lote antes dos envios: quantas candidatas já existiam
const check = runData["Checar já cadastradas"]?.[0]?.data?.main?.[0]?.[0]?.json;
if (check) {
  console.log(
    Array.isArray(check.novas)
      ? `Checagem: ${check.novas.length} novas, ${check.duplicadas} já cadastradas`
      : `Checagem falhou (${String(check.error?.message ?? check.error ?? "sem detalhe").slice(0, 120)}); enviando as primeiras candidatas`
  );
}

// "Enviar para VagaSync" recebe os itens de "Separar novas", na mesma ordem
const sent = runData["Separar novas"]?.[0]?.data?.main?.[0] ?? [];
const answers = runData["Enviar para VagaSync"]?.[0]?.data?.main?.[0] ?? [];
const count = { novas: 0, duplicadas: 0, erros: 0 };
let unauthorized = false;
answers.forEach((item, i) => {
  const r = item.json;
  const { source = "?", title = "" } = sent[i]?.json ?? {};
  if (r.duplicate) {
    count.duplicadas++;
    return;
  }
  if (r.id) {
    count.novas++;
    console.log(`  nova [${source}] ${title}`);
    return;
  }
  count.erros++;
  const message = String(r.error?.message ?? r.error ?? r.message ?? "sem detalhe").slice(0, 160);
  if (/401|autorizado/i.test(message)) unauthorized = true;
  console.log(`  erro [${source}] ${title}: ${message}`);
});
console.log(`VagaSync: ${count.novas} novas, ${count.duplicadas} duplicadas, ${count.erros} com erro`);

if (error) {
  console.error(`Execução falhou: ${error.message}`);
  process.exit(1);
}
if (unauthorized) {
  console.error("O webhook recusou o segredo: confira o secret N8N_WEBHOOK_SECRET do repositório.");
  process.exit(1);
}
