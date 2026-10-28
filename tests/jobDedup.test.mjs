// node --test tests/ — regras de lib/jobDedup.ts (Node 22 lê o .ts direto).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEDUP_WINDOW_DAYS,
  findDuplicate,
  normalizeCompany,
  normalizeText,
} from "../lib/jobDedup.ts";

const NOW = Date.parse("2026-10-27T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const job = (id, url, title, company, daysAgo = 1) => ({
  id,
  url,
  title,
  company,
  createdAt: new Date(NOW - daysAgo * DAY),
});

test("normaliza acentos, maiúsculas, pontuação e espaços", () => {
  assert.equal(normalizeText("  Estágio   em TI – Grupo CÉV "), "estagio em ti grupo cev");
  assert.equal(normalizeText("Desenvolvedor(a) Fullstack Backend - Trainee"), "desenvolvedor a fullstack backend trainee");
  assert.equal(normalizeText("ENGENHARIA DE SOFTWARE JR"), normalizeText("Engenharia de Software Jr."));
  assert.equal(normalizeText("   "), null);
  assert.equal(normalizeText(undefined), null);
});

test("empresa vazia ou genérica não vale como empresa", () => {
  assert.equal(normalizeCompany(""), null);
  assert.equal(normalizeCompany("Confidencial"), null);
  assert.equal(normalizeCompany("Confidencial (via Sylisi)"), null);
  assert.equal(normalizeCompany("Não informado"), null);
  assert.equal(normalizeCompany("Sicredi"), "sicredi");
});

test("mesma URL é duplicata em qualquer data", () => {
  const existing = [job("a", "https://remotar.com.br/job/1", "Outro título", "Outra", 400)];
  assert.deepEqual(findDuplicate({ url: " https://remotar.com.br/job/1 " }, existing, NOW), {
    id: "a",
    reason: "url",
  });
});

test("mesma vaga em outra fonte (título + empresa com acento/caixa diferentes)", () => {
  const existing = [job("a", "https://remotar.com.br/job/9", "Engenharia de Software JR – Foco em Financiamentos PF", "Sicredi")];
  const candidate = {
    url: "https://sicredi.gupy.io/job/123",
    title: "engenharia de software jr - foco em financiamentos pf",
    company: "  SICREDI ",
  };
  assert.deepEqual(findDuplicate(candidate, existing, NOW), { id: "a", reason: "titulo_empresa" });
});

test("vagas distintas com título e empresa iguais no mesmo site entram", () => {
  const existing = [job("a", "https://empresa.gupy.io/job/1", "Estágio em TI", "Grupo CEV")];
  const candidate = { url: "https://empresa.gupy.io/job/2", title: "Estágio em TI", company: "Grupo CEV" };
  assert.equal(findDuplicate(candidate, existing, NOW), null);
});

test("empresa vazia ou genérica dos dois lados não casa", () => {
  const existing = [
    job("a", "https://github.com/x/1", "Desenvolvedor Java Júnior", ""),
    job("b", "https://github.com/x/2", "Desenvolvedor Java Júnior", "Confidencial"),
  ];
  assert.equal(findDuplicate({ url: "https://remotar.com.br/job/5", title: "Desenvolvedor Java Júnior", company: "" }, existing, NOW), null);
  assert.equal(
    findDuplicate({ url: "https://remotar.com.br/job/5", title: "Desenvolvedor Java Júnior", company: "Confidencial" }, existing, NOW),
    null
  );
});

test("título diferente ou empresa diferente não é duplicata", () => {
  const existing = [job("a", "https://remotar.com.br/job/1", "Estágio em Dados", "Ponte")];
  assert.equal(findDuplicate({ url: "https://himalayas.app/j/1", title: "Estágio em Dados", company: "Outra" }, existing, NOW), null);
  assert.equal(findDuplicate({ url: "https://himalayas.app/j/1", title: "Estágio em QA", company: "Ponte" }, existing, NOW), null);
});

test("fora da janela de dias só a URL conta", () => {
  const old = [job("a", "https://remotar.com.br/job/1", "Estágio em TI", "Ponte", DEDUP_WINDOW_DAYS + 1)];
  assert.equal(findDuplicate({ url: "https://himalayas.app/j/1", title: "Estágio em TI", company: "Ponte" }, old, NOW), null);
  const recent = [job("a", "https://remotar.com.br/job/1", "Estágio em TI", "Ponte", DEDUP_WINDOW_DAYS - 1)];
  assert.ok(findDuplicate({ url: "https://himalayas.app/j/1", title: "Estágio em TI", company: "Ponte" }, recent, NOW));
});

test("sem título ou empresa na candidata, só a URL decide", () => {
  const existing = [job("a", "https://remotar.com.br/job/1", "Estágio em TI", "Ponte")];
  assert.equal(findDuplicate({ url: "https://himalayas.app/j/1", company: "Ponte" }, existing, NOW), null);
  assert.equal(findDuplicate({ url: "https://himalayas.app/j/1", title: "Estágio em TI" }, existing, NOW), null);
});

test("vaga colada à mão (sem URL) conta como outra origem", () => {
  const existing = [job("a", null, "Estágio em TI", "Ponte")];
  assert.ok(findDuplicate({ url: "https://remotar.com.br/job/1", title: "Estágio em TI", company: "Ponte" }, existing, NOW));
});

test("empresa genérica escrita pela IA não casa", () => {
  for (const name of ["Não especificada", "Empresa não informada", "Desconhecida", "Não divulgado", "A definir", "Confidencial (via Sylisi)"]) {
    assert.equal(normalizeCompany(name), null, name);
  }
  // nomes reais que começam parecido continuam valendo
  assert.equal(normalizeCompany("Sem Parar"), "sem parar");
  assert.equal(normalizeCompany("Nao Sei Tecnologia"), "nao sei tecnologia");
});

test("C++, C# e .NET não viram o mesmo título", () => {
  assert.notEqual(normalizeText("Desenvolvedor C++ Jr"), normalizeText("Desenvolvedor C# Jr"));
  assert.equal(normalizeText("Estágio .NET"), "estagio dotnet");
  const existing = [job("a", "https://remotar.com.br/job/1", "Desenvolvedor C++ Jr", "Ponte")];
  assert.equal(findDuplicate({ url: "https://himalayas.app/j/1", title: "Desenvolvedor C# Jr", company: "Ponte" }, existing, NOW), null);
});

test("no GitHub cada repositório é uma origem", () => {
  const existing = [job("a", "https://github.com/frontendbr/vagas/issues/1", "Dev Júnior", "Ponte")];
  // mesma vaga em outro repositório de vagas: duplicata
  assert.ok(findDuplicate({ url: "https://github.com/backend-br/vagas/issues/9", title: "Dev Júnior", company: "Ponte" }, existing, NOW));
  // outra issue no mesmo repositório: vaga distinta
  assert.equal(findDuplicate({ url: "https://github.com/frontendbr/vagas/issues/2", title: "Dev Júnior", company: "Ponte" }, existing, NOW), null);
});
