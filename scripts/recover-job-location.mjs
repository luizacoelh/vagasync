// Recupera o campo `location` das vagas que estão como NAO_INFORMADO inferindo
// o valor a partir do texto da `description`.
//
// Regras (ordem de precedência — a primeira que bater vence):
//   1. HIBRIDO    — menção a "híbrido" / "hibrido" na descrição
//   2. REMOTO     — menção a "remoto" / "remote" na descrição
//   3. PRESENCIAL — menção a "presencial" na descrição
//   (sem nenhuma das três → permanece NAO_INFORMADO)
//
// Uso:
//   node scripts/recover-job-location.mjs             → mostra o que seria alterado (dry-run)
//   node scripts/recover-job-location.mjs --apply     → executa os UPDATEs no Turso
//
// Sempre mostra o SQL antes de perguntar confirmação. Seguro rodar várias vezes
// (idempotente: só toca vagas ainda com NAO_INFORMADO).
//
// Roda contra o Turso de produção: exige o .env.turso com DATABASE_TARGET=turso
// (ver scripts/lib/turso-env.mjs), inclusive no dry-run.

import { createClient } from "@libsql/client";
import { createInterface } from "node:readline";
import { requireTursoWrite } from "./lib/turso-env.mjs";

const APPLY = process.argv.includes("--apply");

const client = createClient(requireTursoWrite());

// Padrões de detecção (case-insensitive)
const HIBRIDO    = /\bh[ií]brid[oa]\b/i;
const REMOTO     = /\bremot[oa]\b|\bremote\b/i;
const PRESENCIAL = /\bpresencial\b/i;

function inferLocation(description) {
  if (!description) return null;
  if (HIBRIDO.test(description))    return "HIBRIDO";
  if (REMOTO.test(description))     return "REMOTO";
  if (PRESENCIAL.test(description)) return "PRESENCIAL";
  return null;
}

// Busca apenas vagas com NAO_INFORMADO (não toca em quem já tem valor)
const rows = (await client.execute(`
  SELECT id, title, company, description
  FROM Job
  WHERE location = 'NAO_INFORMADO'
  ORDER BY createdAt DESC
`)).rows;

console.log(`\nVagas com location = NAO_INFORMADO: ${rows.length}`);

// Monta as atualizações
const updates = [];
for (const row of rows) {
  const inferred = inferLocation(String(row.description ?? ""));
  if (inferred) {
    updates.push({ id: row.id, title: row.title, company: row.company, location: inferred });
  }
}

const noSignal = rows.length - updates.length;

console.log(`\nResumo do que seria alterado:`);
console.log(`  REMOTO:     ${updates.filter(u => u.location === "REMOTO").length}`);
console.log(`  HIBRIDO:    ${updates.filter(u => u.location === "HIBRIDO").length}`);
console.log(`  PRESENCIAL: ${updates.filter(u => u.location === "PRESENCIAL").length}`);
console.log(`  Sem sinal (permanece NAO_INFORMADO): ${noSignal}`);

if (updates.length === 0) {
  console.log("\nNada a alterar.");
  await client.close();
  process.exit(0);
}

console.log("\nSQL que será executado:");
updates.forEach(u => {
  console.log(`  UPDATE Job SET location = '${u.location}' WHERE id = '${u.id}'; -- "${u.title}" @ ${u.company}`);
});

if (!APPLY) {
  console.log("\n⚠️  DRY-RUN — nenhuma alteração feita.");
  console.log("   Para aplicar: node scripts/recover-job-location.mjs --apply\n");
  await client.close();
  process.exit(0);
}

// Pede confirmação interativa
const rl = createInterface({ input: process.stdin, output: process.stdout });
const answer = await new Promise(resolve =>
  rl.question(`\nAplicar ${updates.length} UPDATE(s) no Turso? [s/N] `, resolve)
);
rl.close();

if (answer.trim().toLowerCase() !== "s") {
  console.log("Cancelado.");
  await client.close();
  process.exit(0);
}

// Executa
let ok = 0;
let fail = 0;
for (const u of updates) {
  try {
    await client.execute({
      sql: `UPDATE Job SET location = ? WHERE id = ?`,
      args: [u.location, u.id],
    });
    console.log(`  ✓ ${u.location.padEnd(10)} "${u.title}" @ ${u.company}`);
    ok++;
  } catch (err) {
    console.error(`  ✗ ERRO em "${u.title}": ${err.message}`);
    fail++;
  }
}

console.log(`\n${ok} vaga(s) atualizada(s)${fail ? `, ${fail} com erro` : ""}.`);
await client.close();
