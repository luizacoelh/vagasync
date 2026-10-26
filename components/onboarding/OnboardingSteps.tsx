import GlassPanel from "@/components/ui/Glass";

const OUTFIT = { fontFamily: "var(--font-outfit)" } as const;

const ICON = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

const STEPS = [
  {
    title: "Cole a vaga",
    text: "Copie o texto da vaga do LinkedIn, da Gupy ou de onde for e cole aqui.",
    icon: (
      <svg {...ICON}>
        <rect x="8" y="2" width="8" height="4" rx="1" />
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
        <path d="M9 12h6M9 16h4" />
      </svg>
    ),
  },
  {
    title: "A IA analisa",
    text: "Resumo, tecnologias, requisitos, perguntas de entrevista e o que estudar, comparado com as suas skills.",
    icon: (
      <svg {...ICON}>
        <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
        <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
      </svg>
    ),
  },
  {
    title: "Acompanhe",
    text: "Mude o status de aplicada até a oferta e veja todas as candidaturas num lugar só.",
    icon: (
      <svg {...ICON}>
        <path d="M3 3v18h18" />
        <path d="M7 15l4-4 3 3 5-6" />
      </svg>
    ),
  },
];

// Os três passos do VagaSync ("Cole a vaga → IA analisa → Acompanhe"). Aparece
// para o visitante no topo do dashboard e para quem acabou de criar a conta
// enquanto o dashboard ainda está vazio (components/ui/EmptyState.tsx).
export default function OnboardingSteps() {
  return (
    <ol className="grid gap-3 sm:grid-cols-3">
      {STEPS.map((step, i) => (
        <li key={step.title} className="relative">
          <GlassPanel className="h-full" plateClassName="h-full p-5" hotspots={false}>
            <div className="flex items-center gap-3">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[#85B7EB]"
                style={{
                  background: "linear-gradient(155deg, rgba(133,183,235,0.18), rgba(55,138,221,0.08))",
                  boxShadow: "inset 0 0 0 1px rgba(133,183,235,0.25)",
                }}
              >
                {step.icon}
              </span>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-[#7C8494]" style={OUTFIT}>
                  Passo {i + 1}
                </p>
                <h3 className="text-base font-semibold text-[#E4E6EB]" style={OUTFIT}>
                  {step.title}
                </h3>
              </div>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-[#A9B2C0]">{step.text}</p>
          </GlassPanel>

          {/* Seta para o próximo passo: para baixo no celular, para o lado no desktop */}
          {i < STEPS.length - 1 && (
            <span
              aria-hidden="true"
              className="absolute -bottom-1.5 left-1/2 z-10 -translate-x-1/2 translate-y-1/2 text-[#378ADD] sm:-right-1.5 sm:bottom-auto sm:left-auto sm:top-1/2 sm:translate-x-1/2 sm:-translate-y-1/2"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="rotate-90 sm:rotate-0">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
