import { LoginButton } from "@/components/auth/LoginGate";

// Aviso do modo visitante no topo das listas e da página da vaga: deixa claro
// que aquilo é exemplo e oferece o login ali mesmo.
export default function DemoBanner({ text }: { text: string }) {
  return (
    <div className="mb-6 flex flex-col gap-3 rounded-xl border border-[#378ADD]/30 bg-[#378ADD]/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-[#B5D3F2]">{text}</p>
      <div className="shrink-0">
        <LoginButton label="Entrar para usar" />
      </div>
    </div>
  );
}
