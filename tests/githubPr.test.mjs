import assert from "node:assert/strict";
import test from "node:test";
import { motivosParaNaoFazerMerge } from "../scripts/github-pr.mjs";

const SHA = "a".repeat(40);
const LINT = "Lint + TypeScript + Build";
const MIGRATIONS = "Migrations em banco limpo + check:turso";

function verde(name) {
  return { name, status: "completed", conclusion: "success" };
}

function estadoVerde() {
  const checkRuns = [verde(LINT), verde(MIGRATIONS)];
  return {
    sha: SHA,
    pr: {
      state: "open",
      draft: false,
      changed_files: 1,
      base: { ref: "main" },
      head: { sha: SHA, repo: { full_name: "luizacoelh/vagasync" } },
    },
    checkRuns,
    totalCheckRuns: checkRuns.length,
    combinedStatus: { state: "success", statuses: [{ context: "Vercel", state: "success" }] },
    arquivos: ["lib/volumeReport.ts"],
    commitsAtrasados: 0,
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

test("PR fechado, rascunho, outra base ou de fork recusam o merge", () => {
  for (const [ajuste, motivo] of [
    [(pr) => { pr.state = "closed"; }, "PR não está aberto"],
    [(pr) => { pr.draft = true; }, "PR é rascunho"],
    [(pr) => { pr.base.ref = "feat/x"; }, "base do PR não é a main"],
    [(pr) => { pr.head.repo.full_name = "outra/vagasync"; }, "PR não vem deste repositório"],
  ]) {
    const estado = estadoVerde();
    ajuste(estado.pr);
    assert.deepEqual(motivosParaNaoFazerMerge(estado), [motivo]);
  }
});

test("SHA curto recusa o merge", () => {
  const estado = estadoVerde();
  estado.sha = "abc1234";
  assert.ok(motivosParaNaoFazerMerge(estado).includes("informe o SHA completo"));
});

test("branch atrás da main recusa o merge", () => {
  const estado = estadoVerde();
  estado.commitsAtrasados = 1;
  assert.deepEqual(motivosParaNaoFazerMerge(estado), ["branch atrás da main: atualizar e esperar o CI"]);
});

test("qualquer job vermelho recusa o merge", () => {
  for (const conclusion of ["failure", "cancelled", "timed_out", "action_required"]) {
    const estado = estadoVerde();
    estado.checkRuns.push({ name: "Outro", status: "completed", conclusion });
    estado.totalCheckRuns = estado.checkRuns.length;
    assert.deepEqual(motivosParaNaoFazerMerge(estado), ["CI falhou: Outro"]);
  }
});

test("job em andamento recusa o merge", () => {
  const estado = estadoVerde();
  estado.checkRuns.push({ name: "Outro", status: "in_progress", conclusion: null });
  estado.totalCheckRuns = estado.checkRuns.length;
  assert.deepEqual(motivosParaNaoFazerMerge(estado), ["CI em andamento: Outro"]);
});

test("os dois jobs obrigatórios precisam de sucesso de verdade", () => {
  const ausente = estadoVerde();
  ausente.checkRuns = [verde(LINT)];
  ausente.totalCheckRuns = 1;
  assert.deepEqual(motivosParaNaoFazerMerge(ausente), [`CI obrigatório sem sucesso: ${MIGRATIONS}`]);

  for (const conclusion of ["skipped", "neutral"]) {
    const pulado = estadoVerde();
    pulado.checkRuns[1] = { name: MIGRATIONS, status: "completed", conclusion };
    assert.deepEqual(motivosParaNaoFazerMerge(pulado), [`CI obrigatório sem sucesso: ${MIGRATIONS}`]);
  }
});

test("resposta da API com menos jobs que o total recusa o merge", () => {
  const estado = estadoVerde();
  estado.totalCheckRuns = 101;
  assert.deepEqual(motivosParaNaoFazerMerge(estado), ["CI incompleto na resposta da API"]);
});

test("status externo pendente ou falho recusa; lista vazia não", () => {
  for (const state of ["pending", "failure"]) {
    const estado = estadoVerde();
    estado.combinedStatus = { state, statuses: [{ context: "Vercel", state }] };
    assert.deepEqual(motivosParaNaoFazerMerge(estado), [`status externo: ${state}`]);
  }

  const semStatus = estadoVerde();
  semStatus.combinedStatus = { state: "pending", statuses: [] };
  assert.deepEqual(motivosParaNaoFazerMerge(semStatus), []);
});

test("lista de arquivos incompleta recusa o merge", () => {
  const estado = estadoVerde();
  estado.pr.changed_files = 3001;
  assert.deepEqual(motivosParaNaoFazerMerge(estado), ["lista de arquivos do PR incompleta"]);
});

test("migration exige confirmação de que já foi ao Turso", () => {
  const estado = estadoVerde();
  estado.arquivos.push("prisma/migrations/2026_x/migration.sql");
  estado.pr.changed_files = 2;
  assert.deepEqual(motivosParaNaoFazerMerge(estado), [
    "PR tem migration: aplicar no Turso antes e usar --turso-aplicado",
  ]);
  assert.deepEqual(motivosParaNaoFazerMerge({ ...estado, tursoAplicado: true }), []);
});
