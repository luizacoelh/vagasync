#!/usr/bin/env node
// Cria no GitHub a regra que protege a main: só entra por PR com os dois jobs
// do CI verdes, sem force push e sem exclusão. Sem exceções: quem precisar de
// uma emergência ajusta a regra no GitHub (Settings > Rules > Rulesets).
// Não aprova sozinho: exige CI, não revisão humana, para o merge por
// scripts/github-pr.mjs continuar funcionando. Rodar de novo não duplica.
import { api, JOBS_OBRIGATORIOS, lerToken } from "./github-pr.mjs";

const NOME = "Proteger main";

const token = lerToken();
const regras = await api(token, "/rulesets");
const existente = regras.find((regra) => regra.name === NOME);

if (existente) {
  console.log(`regra já existe: #${existente.id} (${existente.enforcement})`);
} else {
  const regra = await api(token, "/rulesets", {
    method: "POST",
    body: {
      name: NOME,
      target: "branch",
      enforcement: "active",
      conditions: { ref_name: { include: ["~DEFAULT_BRANCH"], exclude: [] } },
      rules: [
        { type: "deletion" },
        { type: "non_fast_forward" },
        {
          type: "pull_request",
          parameters: {
            required_approving_review_count: 0,
            dismiss_stale_reviews_on_push: false,
            require_code_owner_review: false,
            require_last_push_approval: false,
            required_review_thread_resolution: false,
          },
        },
        {
          type: "required_status_checks",
          parameters: {
            strict_required_status_checks_policy: true,
            required_status_checks: JOBS_OBRIGATORIOS.map((context) => ({ context })),
          },
        },
      ],
    },
  });
  console.log(`regra criada: #${regra.id} (${regra.enforcement})`);
}
