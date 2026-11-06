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

test("nenhum nó de código tem caractere de controle (ex: \b virado backspace no JSON)", () => {
  for (const n of workflow.nodes) {
    if (typeof n.parameters.jsCode !== "string") continue;
    assert.doesNotMatch(n.parameters.jsCode, /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/, n.name);
  }
});

test("título de vendas/RH cai mesmo com categoria de TI no Remotar", () => {
  const vagas = montar([
    remotar([
      ["Estágio em Sales Ops", "ZG Soluções", "Programação"],
      ["Estágio RH", "ZG Soluções", "Programação"],
      ["Estágio em Back-end", "ZG Soluções", "Programação"],
    ]),
  ]);
  assert.deepEqual(vagas.map((v) => v.title), ["Estágio em Back-end"]);
});

test("a checagem lê as candidatas do nó Montar vagas", () => {
  const body = workflow.nodes.find((n) => n.name === "Checar já cadastradas").parameters.jsonBody;
  assert.match(body, /\$\('Montar vagas'\)\.all\(\)/);
});

// Respostas reais (28/10/2026): descrições curtas em português do Remotar, que
// o filtro antigo de idioma recusava, e vagas em inglês do Himalayas.
const fixture = JSON.parse(readFileSync(new URL("./fixtures/n8n-idioma.json", import.meta.url), "utf8"));
const recente = new Date(now - 3600000).toISOString();
const remotarReal = (jobs) => ({ meta: {}, data: jobs.map((j) => ({ ...j, createdAt: recente })) });
// Embala só a descrição numa vaga que passa em todo o resto (remota, Brasil,
// estágio, título de TI): o que decidir é o idioma.
const soIdioma = (descriptions) => ({
  jobs: descriptions.map((description, i) => ({
    title: `Estágio em Desenvolvimento ${i}`,
    companyName: `Empresa ${i}`,
    pubDate: Math.floor(now / 1000) - 3600,
    applicationLink: `https://himalayas.app/j/idioma-${i}`,
    locationRestrictions: ["Brazil"],
    seniority: ["Entry-level"],
    description,
  })),
});

test("descrições curtas reais em português passam no idioma", () => {
  // remotas e com categoria de TI, para só o idioma decidir
  const jobs = fixture.remotarCurtas.map((j) => ({ ...j, type: "remote", jobCategories: [{ category: { name: "Programação" } }] }));
  assert.equal(montar([remotarReal(jobs)]).length, 3);
});

test("descrição curta do Remotar segue o resto do filtro", () => {
  // IA (remoto, Programação) passa; Segurança cai por local (híbrido em BH);
  // Contabilidade cai pela categoria
  const vagas = montar([remotarReal(fixture.remotarCurtas)]);
  assert.deepEqual(vagas.map((v) => v.title), ["Estágio em Inteligência Artificial"]);
});

test("vaga em inglês continua recusada; em espanhol passa", () => {
  assert.equal(montar([soIdioma(fixture.himalayasIngles.map((j) => j.description))]).length, 0);
  const espanhol =
    "Buscamos un estudiante de ingeniería de sistemas para unirse a nuestro equipo de desarrollo. " +
    "El practicante trabajará con el equipo en la construcción de aplicaciones web y en la mejora de los procesos internos. " +
    "Requisitos: conocimientos en JavaScript y en bases de datos, disponibilidad para trabajar en las tardes, " +
    "buena comunicación con el cliente y con los compañeros. Ofrecemos un ambiente flexible y la posibilidad de crecer.";
  assert.equal(montar([soIdioma([espanhol])]).length, 1);
});

test("ênclise do português não conta como espanhol", () => {
  // o português soma 5 ("os", "e" duas vezes, "da", "com"); sem o hífen no
  // token, os pronomes ("-las", "-los", "-la", "-lo") dariam 11 ao espanhol
  const enclise =
    "Receber os relatórios, analisá-las e corrigi-los; validá-las, revisá-los, organizá-las, documentá-los, " +
    "apoiá-la, testá-lo, integrá-las, publicá-los e acompanhá-las junto da equipe técnica, " +
    "com foco remoto, prazos definidos, entregas semanais, métricas claras, feedback contínuo, mentoria próxima, " +
    "rotina flexível, ferramentas modernas, aprendizado diário, código revisado, testes automatizados, dados abertos, " +
    "projetos reais, impacto direto.";
  assert.equal(montar([soIdioma([enclise])]).length, 1);
});

test("texto curto ou empatado não é recusado só pelo idioma", () => {
  const curto = "Remote internship. You will build web apps with the team in React and Node.";
  const tecnico = Array.from({ length: 50 }, (_, i) => `React${i}`).join(" ");
  assert.equal(montar([soIdioma([curto, tecnico])]).length, 2);
});

test("cada candidata diz de quais buscas veio", () => {
  // itens de "Buscar vagas" na ordem de "Fontes": a mesma vaga em 0 e 2
  const vaga = himalayas([["Estágio em Desenvolvimento Web", "Nimbus"]]);
  const outra = remotar([["Estágio em Back-end", "ZG Soluções", "Programação"]]);
  const vagas = montar([vaga, outra, vaga]);
  const byTitle = Object.fromEntries(vagas.map((v) => [v.title, v.buscas]));
  assert.deepEqual(byTitle, { "Estágio em Desenvolvimento Web": [0, 2], "Estágio em Back-end": [1] });
});

test("índice repetido na resposta não envia a vaga duas vezes", () => {
  assert.deepEqual(separar({ novas: [3, 3, 5], duplicadas: 97 }), ["https://x/3", "https://x/5"]);
});

// Vagas de fora do Brasil (Himalayas com outros países, GetOnBoard). Respostas
// reais de 05/11/2026, cortadas; a data é trocada por uma recente.
const exterior = JSON.parse(readFileSync(new URL("./fixtures/n8n-exterior.json", import.meta.url), "utf8"));
const himReal = (jobs) => ({ jobs: jobs.map((j) => ({ ...j, pubDate: Math.floor(now / 1000) - 3600 })) });
const gobReal = (jobs) => ({
  data: jobs.map((j) => ({ ...j, attributes: { ...j.attributes, published_at: Math.floor(now / 1000) - 3600 } })),
  meta: { page: 1, per_page: 100, total_pages: 1 },
});
const [analistaDatos, netJr] = exterior.himalayas.latamEspanhol;
// a mesma vaga real com outra lista de países, outro texto ou outro link
const comPaises = (job, locationRestrictions) => ({ ...job, locationRestrictions });
const comTexto = (job, texto, i = 0) => ({
  ...job,
  applicationLink: `${job.applicationLink}&teste=${i}`,
  description: `<p>${texto}</p>${job.description}`,
});
const gobCom = (job, attrs) => ({ ...job, attributes: { ...job.attributes, ...attrs } });
const tenants = (...ids) => ({ data: ids.map((id) => ({ id, type: "country", attributes: { name: id } })) });

test("remota LATAM em espanhol aberta ao Brasil passa", () => {
  // "Entre 0 y 4 años" e "1 a 2 años": faixa que começa em 0 ou 1 não é exigência
  const vagas = montar([himReal([analistaDatos, netJr])]);
  assert.deepEqual(vagas.map((v) => v.title).sort(), [analistaDatos.title, netJr.title].sort());
  for (const v of vagas) assert.equal(v.source, "himalayas");
  // sem lista de países = qualquer país
  assert.equal(montar([himReal([comPaises(netJr, [])])]).length, 1);
});

test("remota só para Espanha ou UE cai", () => {
  const { soEspanha, soEuropa } = exterior.himalayas;
  assert.equal(montar([himReal([soEspanha, soEuropa])]).length, 0);
  // a vaga que passa cai quando a lista de países não tem o Brasil
  assert.equal(montar([himReal([comPaises(netJr, soEspanha.locationRestrictions)])]).length, 0);
  assert.equal(montar([himReal([comPaises(netJr, soEuropa.locationRestrictions)])]).length, 0);
});

test("texto que restringe a residentes de outro país derruba a vaga de fora", () => {
  const restritas = [
    "Importante: solo residentes en España.",
    "Candidates must be based in the EU.",
    "É obrigatório residir em Portugal.",
    "Requisito: contar con permiso de trabajo en la Unión Europea.",
  ];
  assert.equal(montar([himReal(restritas.map((t, i) => comTexto(netJr, t, i)))]).length, 0);
  const abertas = [
    "Debes residir en México, Colombia, Argentina o Brasil.",
    "Somos una empresa ubicada en España con equipo distribuido.",
    "Trabajo 100% remoto, sin presencialidad.",
  ];
  assert.equal(montar([himReal(abertas.map((t, i) => comTexto(netJr, t, i)))]).length, 3);
});

test("presencial ou híbrido fora do Brasil cai", () => {
  const madri = comTexto(comPaises(netJr, []), "Modalidad: presencial en Madrid, de lunes a viernes.");
  const hibrido = { ...comPaises(netJr, []), title: "Desarrollador Net Jr - híbrido en Madrid" };
  assert.equal(montar([himReal([madri, hibrido])]).length, 0);
  // GetOnBoard marca a modalidade: mesmo aberta ao Brasil, presencial cai
  const base = exterior.getonbrd.latamSemBrasil;
  const presencial = gobCom(base, { remote: false, remote_modality: "no_remote", countries: ["Spain"], location_tenants: tenants("brasil") });
  assert.equal(montar([gobReal([presencial])]).length, 0);
});

test("júnior que exige 3 anos de experiência cai", () => {
  const tresAnos = {
    ...netJr,
    description: netJr.description.replace("1 a 2 años de experiencia", "Mínimo 3 años de experiencia"),
  };
  assert.notEqual(tresAnos.description, netJr.description);
  assert.equal(montar([himReal([tresAnos])]).length, 0);
  const ptTresAnos = comTexto(comPaises(netJr, []), "Requisito: 3 anos de experiência com C#.");
  assert.equal(montar([himReal([ptTresAnos])]).length, 0);
});

test("GetOnBoard: só remota aberta ao Brasil, em português ou espanhol", () => {
  const { latamSemBrasil, soColombia, remotoIngles, soChile } = exterior.getonbrd;
  // reais: LATAM sem o Brasil, só Colômbia, remota em inglês, só Chile
  assert.equal(montar([gobReal([latamSemBrasil, soColombia, remotoIngles, soChile])]).length, 0);
  // a primeira com o Brasil na lista (ou com a região América do Sul) passa
  const ids = latamSemBrasil.attributes.location_tenants.data.map((t) => t.id);
  const comBrasil = gobCom(latamSemBrasil, { location_tenants: tenants(...ids, "brasil") });
  const comRegiao = gobCom(latamSemBrasil, {
    location_regions: { data: [{ id: "south_america", type: "region", attributes: { name: "South America" } }] },
  });
  const [vaga, ...resto] = montar([gobReal([comBrasil])]);
  assert.equal(resto.length, 0);
  assert.equal(vaga.source, "getonbrd");
  assert.equal(vaga.title, "Front-end (Angular Flutter)");
  assert.equal(vaga.company, "Grupo Mariposa");
  assert.equal(vaga.url, latamSemBrasil.links.public_url);
  assert.match(vaga.description, /Modalidade: remoto/);
  assert.equal(montar([gobReal([comRegiao])]).length, 1);
  // remota sem lista de países (qualquer lugar) e em espanhol passa
  const mundo = gobCom(latamSemBrasil, { remote_modality: "fully_remote", location_tenants: { data: [] }, location_regions: { data: [] } });
  assert.equal(montar([gobReal([mundo])]).length, 1);
  // semi senior cai pelo nível
  assert.equal(montar([gobReal([gobCom(comBrasil, { seniority: { data: { id: 3, type: "seniority" } } })])]).length, 0);
});

test("resposta do GetOnBoard não é confundida com a do Remotar", () => {
  const comBrasil = gobCom(exterior.getonbrd.latamSemBrasil, { location_tenants: tenants("brasil") });
  const vagas = montar([gobReal([comBrasil]), remotar([["Estágio em Back-end", "ZG Soluções", "Programação"]])]);
  assert.deepEqual(vagas.map((v) => v.source).sort(), ["getonbrd", "remotar"]);
});

test("Fontes inclui o GetOnBoard e as buscas do Himalayas abertas ao Brasil", () => {
  const urls = runNode("Fontes").map((i) => i.json.url);
  const gob = urls.filter((u) => u.startsWith("https://www.getonbrd.com/api/v0/search/jobs?"));
  assert.ok(gob.length >= 1);
  for (const u of gob) assert.match(decodeURIComponent(u), /expand=\["company","location_tenants","location_regions"\]/);
  assert.ok(urls.some((u) => u.includes("himalayas.app") && u.includes("q=desarrollador&country=Brazil")));
});

test("Remotar: etiqueta Espanhol passa; Inglês e Sênior continuam fora", () => {
  const comTag = (tag) => {
    const r = remotar([["Estágio em Desenvolvimento Web", "Nimbus", "Programação"]]);
    r.data[0].jobTags.push({ tag: { name: tag } });
    return r;
  };
  assert.equal(montar([comTag("Espanhol")]).length, 1);
  assert.equal(montar([comTag("Inglês")]).length, 0);
  assert.equal(montar([comTag("Sênior")]).length, 0);
});

// Sólides: resposta de /api/vacancies (formato salvo em 06/11/2026).
const dia = (dias) => new Date(now - dias * 86400000).toISOString().slice(0, 10);
const solides = (vagas) => ({
  totalPages: 1,
  currentPage: 1,
  count: vagas.length,
  data: vagas.map((v, i) => ({
    id: 900 + i,
    title: "Estágio em Desenvolvimento Web",
    companyName: "Empresa",
    slug: "empresa",
    redirectLink: "https://empresa./vacancies/x",
    currentState: "em_andamento",
    isDisabled: false,
    isHiddenJob: false,
    jobType: "remoto",
    homeOffice: false,
    city: { name: "São Paulo" },
    state: { code: "SP" },
    seniority: [{ name: "Estagiário" }],
    recruitmentContractType: [{ name: "Estágio" }],
    occupationAreas: [{ name: "Tecnologia" }],
    language: [],
    createdAt: dia(2),
    date: { due: dia(-20) },
    description: DESC("React e JavaScript."),
    ...v,
  })),
});

test("Sólides: estágio e júnior de TI remotos ou em Teresina, até 30 dias e com inscrição aberta", () => {
  const vagas = montar([
    solides([
      {},
      { title: "Analista de QA Júnior", seniority: [{ name: "Junior" }], recruitmentContractType: [{ name: "CLT" }], createdAt: dia(20) },
      { title: "Estagiário - TI", jobType: "presencial", city: { name: "Teresina" }, state: { code: "PI" } },
      { title: "Estágio em Suporte de TI", jobType: "presencial", city: { name: "Recife" }, state: { code: "PE" } },
      { title: "Estágio em Desenvolvimento Mobile", createdAt: dia(40) },
      { title: "Estágio em Dados", date: { due: dia(1) } },
      { title: "Estágio em Back-end", slug: "" },
      { title: "Estágio em Front-end", isHiddenJob: true },
      { title: "Estágio em Marketing Digital" },
      { title: "Desenvolvedor Pleno", seniority: [{ name: "Pleno" }], recruitmentContractType: [{ name: "CLT" }] },
    ]),
  ]);
  assert.deepEqual(vagas.map((v) => v.title).sort(), ["Analista de QA Júnior", "Estagiário - TI", "Estágio em Desenvolvimento Web"]);
  const web = vagas.find((v) => v.title === "Estágio em Desenvolvimento Web");
  assert.equal(web.source, "solides");
  assert.equal(web.url, "https://empresa.vagas.solides.com.br/vaga/900");
  assert.match(web.description, /Modalidade: remoto/);
  assert.match(web.description, /Inscrições até: /);
});

test("Fontes inclui as buscas da Sólides", () => {
  const urls = runNode("Fontes").map((i) => i.json.url).filter((u) => u.includes("vagas.solides.com.br/api/vacancies"));
  assert.equal(urls.length, 4);
  for (const u of urls) assert.match(u, /take=20/);
  assert.ok(urls.some((u) => decodeURIComponent(u).includes("locations=Teresina - PI")));
});
