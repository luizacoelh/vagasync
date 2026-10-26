import Link from "next/link";
import GlassPanel from "@/components/ui/Glass";
import OnboardingSteps from "@/components/onboarding/OnboardingSteps";

// Com showCta (dashboard sem nenhuma vaga, ou seja, conta recém-criada) vira o
// onboarding: os três passos + o botão para a primeira vaga. Some sozinho
// quando a primeira vaga é salva, então não precisa de flag no banco.
export default function EmptyState({
  title = "Nenhuma vaga adicionada ainda.",
  subtitle = "Cole a descrição de uma vaga para começar a organizar suas candidaturas.",
  showCta = true,
}: {
  title?: string;
  subtitle?: string;
  showCta?: boolean;
}) {
  if (!showCta) {
    return (
      <GlassPanel plateClassName="p-12 text-center" hotspots={false}>
        <p className="text-[#C4C7D0]">{title}</p>
        <p className="mt-1 text-sm text-[#7C8494]">{subtitle}</p>
      </GlassPanel>
    );
  }

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[#E4E6EB]" style={{ fontFamily: "var(--font-outfit)" }}>
          Como funciona
        </h2>
        <p className="mt-1 text-sm text-[#7C8494]">{subtitle}</p>
      </div>
      <OnboardingSteps />
      <div className="text-center">
        <Link
          href="/nova-vaga"
          className="inline-block rounded-xl px-5 py-2.5 text-sm font-semibold text-[#08131F] transition-shadow"
          style={{
            fontFamily: "var(--font-outfit)",
            background: "linear-gradient(155deg, #85B7EB, #378ADD)",
            boxShadow: "0 0 0 1px rgba(255,255,255,0.25) inset, 0 8px 20px -8px rgba(55,138,221,0.6)",
          }}
        >
          Adicionar minha primeira vaga
        </Link>
      </div>
    </section>
  );
}
