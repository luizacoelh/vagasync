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

const auth = runData["Fontes"]?.[0]?.data?.main?.[0]?.some((i) => i.json.auth);
console.log(`Token do GitHub nas buscas: ${auth ? "sim" : "não"}`);

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
