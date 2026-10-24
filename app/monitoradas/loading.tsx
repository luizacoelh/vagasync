// Skeleton próprio de /monitoradas. Sem ele, o app/loading.tsx da raiz (com o
// formato do dashboard, max-w-5xl) aparecia aqui. Espelha o layout de
// app/monitoradas/page.tsx.
export default function Loading() {
  return (
    <main className="min-h-screen text-[#E4E6EB] px-4 py-16">
      <div className="studio-backdrop">
        <div className="studio-glow" style={{ width: 480, height: 480, top: -140, left: -120, background: "radial-gradient(circle, rgba(139,92,246,0.35), transparent 70%)" }} />
        <div className="studio-glow" style={{ width: 420, height: 420, bottom: -160, right: -100, background: "radial-gradient(circle, rgba(55,138,221,0.3), transparent 70%)" }} />
      </div>

      <div className="mx-auto max-w-2xl animate-pulse">
        {/* BackButton */}
        <div className="h-7 w-24 rounded-xl bg-white/6" />

        {/* Wordmark */}
        <div className="mt-4 mb-6 flex items-center gap-2">
          <div
            className="h-[18px] w-[18px] shrink-0 rounded-[6px]"
            style={{ background: "linear-gradient(155deg, rgba(133,183,235,0.25), rgba(55,138,221,0.25))" }}
          />
          <div className="h-4 w-20 rounded-lg bg-white/8" />
        </div>

        {/* Título + descrição */}
        <div className="mb-2 h-7 w-52 rounded-lg bg-white/8" />
        <div className="mb-8 space-y-2">
          <div className="h-4 w-full rounded-lg bg-white/6" />
          <div className="h-4 w-2/3 rounded-lg bg-white/6" />
        </div>

        {/* Grupo do dia */}
        <div className="mb-2 h-3 w-20 rounded-lg bg-white/6" />
        <div
          className="divide-y divide-white/8 rounded-[22px]"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-2 px-5 py-4">
              <div className="h-3 w-24 rounded-lg bg-white/6" />
              <div className="h-5 w-2/3 rounded-lg bg-white/8" />
              <div className="h-4 w-full rounded-lg bg-white/6" />
              <div className="mt-2 h-9 w-36 rounded-xl bg-white/6" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
