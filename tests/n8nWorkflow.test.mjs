// node --test tests/ — roda o código dos nós "Montar vagas" e "Separar novas"
// direto do n8n-workflows/vagas-br.json, com respostas falsas das fontes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = JSON.parse(readFileSync(new URL("../n8n-workflows/vagas-br.json", import.meta.url), "utf8"));
const code = (name) => workflow.nodes.find((n) => n.name === name).parameters.jsCode;

// Executa o jsCode de um nó Code com $input/$ simulados.
function runNode(name, { input = [], nodes = {} } = {}) {
  const $input = { all: () => input, first: () => input[0] };
  const $ = (node) => ({ all: () => nodes[node] ?? [] });
  return new Function("$input", "$", "$env", `return (() => {${code(name)}})();`)($input, $, {});
}

const montar = (responses) =>
  runNode("Montar vagas", { input: responses.map((r) => ({ json: { data: typeof r === "string" ? r : JSON.stringify(r) } })) }).map(
    (item) => item.json
  );

const now = Date.now();
// Texto em português com palavras suficientes para o filtro de idioma.
const DESC = (extra = "") =>
  `<p>Sobre a vaga: você vai trabalhar com a nossa equipe. Requisitos e conhecimentos desejáveis. Benefícios e atividades da empresa. ${extra}</p>`;

const himalayas = (jobs) => ({
  jobs: jobs.map(([title, companyName, extra]) => ({
    title,
    companyName,
    pubDate: Math.floor(now / 1000) - 3600,
    applicationLink: `https://himalayas.app/j/${encodeURIComponent(title)}`,
    locationRestrictions: ["Brazil"],
    seniority: ["Entry-level"],
    description: DESC(extra),
  })),
});

const gupyHtml = (jobs) =>
  `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: {
      pageProps: {
        initialJobList: {
          data: jobs.map(([name, careerPageName], i) => ({
            name,
            careerPageName,
            jobUrl: `https://empresa.gupy.io/job/${i}?jobBoardSource=x`,
            publishedDate: new Date(now - 86400000).toISOString(),
            workplaceType: "remote",
            description: DESC(),
          })),
        },
      },
    },
  })}</script></html>`;

const remotar = (jobs) => ({
  meta: {},
  data: jobs.map(([title, company, categoria], i) => ({
    id: 100 + i,
    title,
    companyDisplayName: company,
    createdAt: new Date(now - 3600000).toISOString(),
    type: "remote",
    jobTags: [{ tag: { name: "Estágio" } }],
    jobCategories: [{ category: { name: categoria } }],
    description: DESC(),
  })),
});

test("vagas de TI passam e de marketing/vendas ficam de fora", () => {
  const vagas = montar([
    himalayas([
      ["Estágio em Marketing e Vendas", "BMC Hyundai", "Buscamos autodesenvolvimento e sistemas de gestão."],
      ["Estágio em Pré-Vendas - Comercial (Remoto)", "VExpenses", "Uso de CRM e sistemas."],
      ["Estágio em Desenvolvimento de Negócios", "BMC Hyundai", "Desenvolvimento comercial."],
      ["Estágio em Desenvolvimento Web", "Nimbus", "React e JavaScript."],
      ["Analista de Dados de Marketing Júnior", "Ponte", "SQL e Python."],
    ]),
    gupyHtml([
      ["Estágio em TI", "Grupo CEV"],
      ["Estágio em Marketing Digital", "Grupo CEV"],
    ]),
    remotar([["Estágio em Desenvolvimento Front-end", "ZG Soluções", "Programação"]]),
  ]);
  const titles = vagas.map((v) => v.title).sort();
  assert.deepEqual(titles, [
    "Analista de Dados de Marketing Júnior",
    "Estágio em Desenvolvimento Front-end",
    "Estágio em Desenvolvimento Web",
    "Estágio em TI",
  ]);
});

test("título e empresa saem como campos estruturados", () => {
  const vagas = montar([
    himalayas([["Estágio em Desenvolvimento Web", "Nimbus"]]),
    gupyHtml([["Estágio em TI", "Grupo CEV"]]),
    remotar([["Estágio em QA", "ZG Soluções", "QA"]]),
  ]);
  const byTitle = Object.fromEntries(vagas.map((v) => [v.title, v]));
  assert.equal(byTitle["Estágio em Desenvolvimento Web"].company, "Nimbus");
  assert.equal(byTitle["Estágio em TI"].company, "Grupo CEV");
  assert.equal(byTitle["Estágio em TI"].url, "https://empresa.gupy.io/job/0");
  assert.equal(byTitle["Estágio em QA"].company, "ZG Soluções");
  for (const v of vagas) assert.equal(typeof v.description, "string");
});

test("Montar vagas não corta em 40: o teto fica para depois da checagem", () => {
  const many = Array.from({ length: 60 }, (_, i) => [`Estágio em Desenvolvimento ${i}`, `Empresa ${i}`]);
  assert.equal(montar([himalayas(many)]).length, 60);
});

const candidatas = Array.from({ length: 100 }, (_, i) => ({ json: { url: `https://x/${i}`, title: `Vaga ${i}` } }));
const separar = (resposta) =>
  runNode("Separar novas", { input: [{ json: resposta }], nodes: { "Montar vagas": candidatas } }).map((i) => i.json.url);

test("duplicadas não ocupam o teto de 40 da rodada", () => {
  // as 70 primeiras já existem; as 30 novas estão no fim da fila
  const novas = Array.from({ length: 30 }, (_, i) => 70 + i);
  const urls = separar({ novas, duplicadas: 70 });
  assert.equal(urls.length, 30);
  assert.equal(urls[0], "https://x/70");
});

test("o teto de 40 vale sobre as novas", () => {
  const novas = Array.from({ length: 90 }, (_, i) => 10 + i);
  const urls = separar({ novas, duplicadas: 10 });
  assert.equal(urls.length, 40);
  assert.equal(urls[0], "https://x/10");
  assert.equal(urls[39], "https://x/49");
});

test("sem novas, nada é enviado", () => {
  assert.equal(separar({ novas: [], duplicadas: 100 }).length, 0);
});

test("se a checagem falhar, volta às 40 primeiras", () => {
  const urls = separar({ error: { message: "503" } });
  assert.equal(urls.length, 40);
  assert.equal(urls[0], "https://x/0");
});
