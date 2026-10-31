#!/usr/bin/env node
// Abre PR e faz merge pela API do GitHub com a credencial do Git (o gh não está
// instalado). O token fica só na memória deste processo e nunca é impresso.
//
//   node scripts/github-pr.mjs abrir "<título>" <arquivo-com-a-descrição>
//   node scripts/github-pr.mjs status <número> <sha>
//   node scripts/github-pr.mjs merge <número> <sha> [--turso-aplicado]
//
// O merge só acontece com o PR aberto no SHA informado e com todo o CI verde.
// PR com migration exige --turso-aplicado: a Vercel publica a main sozinha,
// então a migration precisa chegar ao Turso antes (ver CLAUDE.md).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const REPO = "luizacoelh/vagasync";
const API = `https://api.github.com/repos/${REPO}`;
const CI_OBRIGATORIO = "Lint + TypeScript + Build";
const CONCLUSOES_OK = new Set(["success", "neutral", "skipped"]);

// Decide sem rede, para poder ser testado. Devolve os motivos que impedem o merge.
export function motivosParaNaoFazerMerge({ pr, sha, checkRuns, combinedStatus, arquivos, tursoAplicado }) {
  const motivos = [];
  if (!/^[0-9a-f]{40}$/.test(sha)) motivos.push("informe o SHA completo");
  if (pr.state !== "open") motivos.push("PR não está aberto");
  if (pr.draft) motivos.push("PR é rascunho");
  if (pr.base?.ref !== "main") motivos.push("base do PR não é a main");
  if (pr.head?.sha !== sha) motivos.push("o SHA do PR mudou");

  if (!checkRuns.some((run) => run.name === CI_OBRIGATORIO)) {
    motivos.push(`CI "${CI_OBRIGATORIO}" não encontrado`);
  }
  for (const run of checkRuns) {
    if (run.status !== "completed") motivos.push(`CI em andamento: ${run.name}`);
    else if (!CONCLUSOES_OK.has(run.conclusion)) motivos.push(`CI falhou: ${run.name}`);
  }
  // Sem status externo o GitHub responde "pending" com a lista vazia.
  if (combinedStatus.statuses.length > 0 && combinedStatus.state !== "success") {
    motivos.push(`status externo: ${combinedStatus.state}`);
  }
  if (!tursoAplicado && arquivos.some((nome) => nome.startsWith("prisma/migrations/"))) {
    motivos.push("PR tem migration: aplicar no Turso antes e usar --turso-aplicado");
  }
  return motivos;
}

function lerToken() {
  const saida = execFileSync("git", ["credential", "fill"], {
    input: "protocol=https\nhost=github.com\n\n",
    encoding: "utf8",
    stdio: ["pipe", "pipe", "ignore"],
  });
  const token = saida.match(/^password=(.*)$/m)?.[1];
  if (!token) throw new Error("credencial do GitHub não encontrada");
  return token;
}

async function api(token, caminho, { method = "GET", body } = {}) {
  const res = await fetch(`${API}${caminho}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "vagasync-github-pr",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const dados = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${dados.message ?? "erro"}`);
  return dados;
}

async function coletarEstado(token, numero, sha) {
  const [pr, checks, combinedStatus, arquivos] = await Promise.all([
    api(token, `/pulls/${numero}`),
    api(token, `/commits/${sha}/check-runs?per_page=100`),
    api(token, `/commits/${sha}/status`),
    api(token, `/pulls/${numero}/files?per_page=100`),
  ]);
  return {
    pr,
    sha,
    checkRuns: checks.check_runs,
    combinedStatus,
    arquivos: arquivos.map((arquivo) => arquivo.filename),
  };
}

async function main([comando, ...args]) {
  const token = lerToken();

  if (comando === "abrir") {
    const [titulo, arquivoDescricao] = args;
    if (!titulo || !arquivoDescricao) throw new Error("uso: abrir <título> <arquivo>");
    const head = execFileSync("git", ["branch", "--show-current"], { encoding: "utf8" }).trim();
    if (head === "main") throw new Error("abra o PR a partir de uma branch");
    const pr = await api(token, "/pulls", {
      method: "POST",
      body: { title: titulo, head, base: "main", body: readFileSync(arquivoDescricao, "utf8") },
    });
    console.log(`PR #${pr.number} ${pr.html_url} ${pr.head.sha}`);
    return;
  }

  if (comando === "status" || comando === "merge") {
    const [numero, sha, flag] = args;
    if (!/^\d+$/.test(numero ?? "") || !sha) throw new Error(`uso: ${comando} <número> <sha>`);
    const estado = await coletarEstado(token, numero, sha);
    const motivos = motivosParaNaoFazerMerge({ ...estado, tursoAplicado: flag === "--turso-aplicado" });
    if (comando === "status") {
      console.log(motivos.length === 0 ? "pronto para merge" : motivos.join("\n"));
      return;
    }
    if (motivos.length > 0) throw new Error(`merge recusado:\n${motivos.join("\n")}`);
    const merge = await api(token, `/pulls/${numero}/merge`, {
      method: "PUT",
      body: { sha, merge_method: "merge" },
    });
    console.log(`merge feito: ${merge.sha}`);
    return;
  }

  throw new Error("comandos: abrir, status, merge");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((erro) => {
    console.error(erro.message);
    process.exit(1);
  });
}
