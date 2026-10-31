import assert from "node:assert/strict";
import test from "node:test";
import { motivosParaNaoFazerMerge } from "../scripts/github-pr.mjs";

const SHA = "a".repeat(40);

function estadoVerde() {
  return {
    sha: SHA,
    pr: { state: "open", draft: false, base: { ref: "main" }, head: { sha: SHA } },
    checkRuns: [{ name: "Lint + TypeScript + Build", status: "completed", conclusion: "success" }],
    combinedStatus: { state: "success", statuses: [{ context: "Vercel", state: "success" }] },
    arquivos: ["lib/volumeReport.ts"],
    tursoAplicado: false,
  };
}

test("CI verde no SHA conferido libera o merge", () => {
  assert.deepEqual(motivosParaNaoFazerMerge(estadoVerde()), []);
});

test("commit novo no PR recusa o merge", () => {
  const estado = estadoVerde();
  estado.pr.head.sha = "b".repeat(40);
  assert.deepEqual(motivosParaNaoFazerMerge(estado), ["o SHA do PR mudou"]);
});

test("CI falho ou em andamento recusa o merge", () => {
  const falho = estadoVerde();
  falho.checkRuns.push({ name: "Migrations", status: "completed", conclusion: "failure" });
  assert.deepEqual(motivosParaNaoFazerMerge(falho), ["CI falhou: Migrations"]);

  const andando = estadoVerde();
  andando.checkRuns[0] = { name: "Lint + TypeScript + Build", status: "in_progress", conclusion: null };
  assert.deepEqual(motivosParaNaoFazerMerge(andando), ["CI em andamento: Lint + TypeScript + Build"]);
});

test("sem o CI obrigatório não há merge", () => {
  const estado = estadoVerde();
  estado.checkRuns = [];
  assert.equal(motivosParaNaoFazerMerge(estado).length, 1);
});

test("status externo pendente recusa; lista vazia não", () => {
  const pendente = estadoVerde();
  pendente.combinedStatus = { state: "pending", statuses: [{ context: "Vercel", state: "pending" }] };
  assert.deepEqual(motivosParaNaoFazerMerge(pendente), ["status externo: pending"]);

  const semStatus = estadoVerde();
  semStatus.combinedStatus = { state: "pending", statuses: [] };
  assert.deepEqual(motivosParaNaoFazerMerge(semStatus), []);
});

test("migration exige confirmação de que já foi ao Turso", () => {
  const estado = estadoVerde();
  estado.arquivos.push("prisma/migrations/2026_x/migration.sql");
  assert.equal(motivosParaNaoFazerMerge(estado).length, 1);
  assert.deepEqual(motivosParaNaoFazerMerge({ ...estado, tursoAplicado: true }), []);
});
