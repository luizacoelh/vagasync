import Link from "next/link";
import { CONTACT_EMAIL } from "@/lib/site";

export default function TermsPage() {
  return (
    <main className="min-h-screen text-[#E4E6EB] px-4 py-16">
      <div className="studio-backdrop">
        <div className="studio-glow" style={{ width: 400, height: 400, top: -120, left: -100, background: "radial-gradient(circle, rgba(55,138,221,0.35), transparent 70%)" }} />
        <div className="studio-glow" style={{ width: 320, height: 320, bottom: -120, right: -80, background: "radial-gradient(circle, rgba(133,183,235,0.2), transparent 70%)" }} />
      </div>

      <div className="mx-auto max-w-2xl">
        <Link
          href="/login"
          className="text-sm text-[#85B7EB] hover:text-[#378ADD]"
          style={{ fontFamily: "var(--font-outfit)" }}
        >
          ← Voltar
        </Link>

        {/* Wordmark */}
        <div className="flex items-center gap-2 mt-6 mb-4">
          <span
            className="h-[18px] w-[18px] rounded-[6px] shrink-0"
            style={{
              background: "linear-gradient(155deg, #85B7EB, #378ADD)",
              boxShadow: "0 0 10px rgba(55,138,221,0.5), inset 0 1px 1px rgba(255,255,255,0.45)",
            }}
          />
          <span
            className="text-sm font-semibold text-[#85B7EB]"
            style={{ fontFamily: "var(--font-outfit)" }}
          >
            VagaSync
          </span>
        </div>

        <h1 className="text-2xl font-semibold mb-1" style={{ fontFamily: "var(--font-outfit)" }}>
          Termos de Uso
        </h1>
        <p className="text-xs text-[#7C8494] mb-10">Última atualização: novembro de 2026</p>

        <div className="space-y-8 text-sm leading-relaxed text-[#C4C7D0]">
          <section>
            <h2
              className="mb-3 text-xs font-medium uppercase tracking-wide text-[#7C8494]"
              style={{ fontFamily: "var(--font-outfit)" }}
            >
              O que é o VagaSync
            </h2>
            <p>
              O VagaSync é uma ferramenta para organizar candidaturas de emprego, usando IA para
              analisar descrições de vagas. É oferecido &quot;como está&quot;, sem garantias de
              disponibilidade contínua.
            </p>
          </section>

          <section>
            <h2
              className="mb-3 text-xs font-medium uppercase tracking-wide text-[#7C8494]"
              style={{ fontFamily: "var(--font-outfit)" }}
            >
              Uso aceitável
            </h2>
            <p>
              Não use o VagaSync para enviar conteúdo ilegal, malicioso ou abusivo à API de
              análise por IA, nem para tentar contornar os limites de uso configurados. Contas que
              abusarem do serviço podem ter o acesso suspenso.
            </p>
          </section>

          <section>
            <h2
              className="mb-3 text-xs font-medium uppercase tracking-wide text-[#7C8494]"
              style={{ fontFamily: "var(--font-outfit)" }}
            >
              Limites da análise por IA
            </h2>
            <p>
              As informações extraídas pela IA (resumo, tecnologias, requisitos, perguntas,
              checklist) são geradas automaticamente e podem conter imprecisões. Sempre confira os
              dados importantes (como requisitos e prazos) na fonte original da vaga.
            </p>
          </section>

          <section>
            <h2
              className="mb-3 text-xs font-medium uppercase tracking-wide text-[#7C8494]"
              style={{ fontFamily: "var(--font-outfit)" }}
            >
              Sem garantias
            </h2>
            <p>
              O serviço é fornecido sem garantias de qualquer tipo. Não nos responsabilizamos por
              decisões tomadas com base nas informações geradas pela IA, nem por perda de dados.
            </p>
          </section>

          <section>
            <h2
              className="mb-3 text-xs font-medium uppercase tracking-wide text-[#7C8494]"
              style={{ fontFamily: "var(--font-outfit)" }}
            >
              Alterações
            </h2>
            <p>
              Este documento pode ser atualizado conforme o projeto evolui. O uso contínuo do
              serviço após uma alteração implica concordância com os novos termos.
            </p>
          </section>

          <section>
            <h2
              className="mb-3 text-xs font-medium uppercase tracking-wide text-[#7C8494]"
              style={{ fontFamily: "var(--font-outfit)" }}
            >
              Contato
            </h2>
            <p>
              Dúvidas, problemas ou pedidos sobre a sua conta:{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-[#85B7EB] underline underline-offset-2">
                {CONTACT_EMAIL}
              </a>.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
