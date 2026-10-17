import Link from "next/link";

// Atalho no header do dashboard para a aba de vagas monitoradas (coletadas
// automaticamente pelo n8n). O contador só aparece se houver vagas esperando.
export default function MonitoredLink({ count }: { count: number }) {
  return (
    <Link
      href="/monitoradas"
      className="glass-btn inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium text-[#C4C7D0] hover:text-[#E4E6EB]"
      style={{ fontFamily: "var(--font-outfit)" }}
      aria-label={
        count > 0 ? `Vagas monitoradas, ${count} aguardando avaliação` : "Vagas monitoradas"
      }
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="shrink-0 opacity-80"
      >
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      <span className="hidden sm:inline">Monitoradas</span>
      {count > 0 && (
        <span className="min-w-[20px] rounded-full border border-[#8B5CF6]/40 bg-[#8B5CF6]/15 px-1.5 text-center text-xs text-[#B9A2FF]">
          {count}
        </span>
      )}
    </Link>
  );
}
