// node --test tests/ — roda scripts/n8n-execution-summary.mjs sobre uma saída
// falsa de `n8n execute`, com as URLs reais do nó "Fontes".
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const workflow = JSON.parse(readFileSync(new URL("../n8n-workflows/vagas-br.json", import.meta.url), "utf8"));
const fontesCode = workflow.nodes.find((n) => n.name === "Fontes").parameters.jsCode;
const fontes = new Function("$env", `return (() => {${fontesCode}})();`)({});
const script = fileURLToPath(new URL("../scripts/n8n-execution-summary.mjs", import.meta.url));

const url = (prefix) => fontes.findIndex((f) => f.json.url.startsWith(prefix));
const run = (items) => [{ data: { main: [items] } }];

function summarize(runData) {
  const dir = mkdtempSync(join(tmpdir(), "n8n-summary-"));
  try {
    const file = join(dir, "saida.txt");
    writeFileSync(file, `log do n8n\n${JSON.stringify({ data: { resultData: { runData } } })}`);
    return execFileSync(process.execPath, [script, file], { encoding: "utf8" });
  } catch (error) {
    return error.stdout;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("resumo mostra itens e aprovadas por busca", () => {
  const remotar = url("https://api.remotar.com.br");
  const github = url("https://api.github.com/repos/soujava");
  const gupy = url("https://portal.gupy.io");
  const respostas = fontes.map(() => ({ json: { data: "" } }));
  respostas[remotar] = { json: { data: JSON.stringify({ meta: {}, data: [{}, {}, {}] }) } };
  respostas[github] = { json: { data: JSON.stringify([{}, {}]) } };
  respostas[gupy] = {
    json: { data: `<script id="__NEXT_DATA__">${JSON.stringify({ props: { pageProps: { initialJobList: { data: [{}] } } } })}</script>` },
  };

  const out = summarize({
    Fontes: run(fontes),
    "Buscar vagas": run(respostas),
    "Montar vagas": run([{ json: { buscas: [remotar, gupy] } }, { json: { buscas: [remotar] } }]),
  });

  assert.match(out, /Por busca \(itens \/ aprovadas\):/);
  assert.match(out, /^ {2}remotar estágio: 3 \/ 2$/m);
  assert.match(out, /^ {2}github soujava\/vagas-java: 2 \/ 0$/m);
  assert.match(out, /^ {2}gupy term=estágio&workplaceTypes=remote: 1 \/ 1$/m);
  assert.match(out, /^ {2}himalayas q=desenvolvedor: sem resposta \/ 0$/m);
  // uma linha por busca de "Fontes"
  assert.equal(out.match(/^ {2}\S.*: (\d+|sem resposta) \/ \d+$/gm).length, fontes.length);
});
