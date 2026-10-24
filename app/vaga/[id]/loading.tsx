// Skeleton próprio do detalhe da vaga. Sem ele, o app/loading.tsx da raiz
// (com o formato do dashboard, max-w-5xl) aparecia aqui e a página "pulava"
// para a coluna estreita quando os dados chegavam. Espelha o layout de
// app/vaga/[id]/page.tsx + VagaContent.
export default function Loading() {
  return (
    <main className="min-h-screen text-[#E4E6EB] px-4 py-16">
      <div className="studio-backdrop">
        <div className="studio-glow" style={{ width: 480, height: 480, top: -140, left: -120, background: "radial-gradient(circle, rgba(55,138,221,0.5), transparent 70%)" }} />
        <div className="studio-glow" style={{ width: 420, height: 420, bottom: -160, right: -100, background: "radial-gradient(circle, rgba(133,183,235,0.3), transparent 70%)" }} />
      </div>

      <div className="mx-auto max-w-2xl animate-pulse">
        {/* BackButton */}
        <div className="h-7 w-24 rounded-xl bg-white/6" />

        {/* Empresa, título, localização + StatusSelect */}
        <div className="mt-6 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-4 w-28 rounded-lg bg-white/8" />
            <div className="h-7 w-3/4 rounded-lg bg-white/8" />
            <div className="h-3 w-32 rounded-lg bg-white/6" />
          </div>
          <div className="h-9 w-32 shrink-0 rounded-xl bg-white/6" />
        </div>

        {/* DeleteJobButton */}
        <div className="mt-4 flex justify-end">
          <div className="h-3 w-20 rounded-lg bg-white/6" />
        </div>

        {/* Painel de detalhes */}
        <div
          className="mt-6 space-y-6 rounded-[22px] p-6"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-2">
              <div className="h-3 w-24 rounded-lg bg-white/8" />
              <div className="h-4 w-full rounded-lg bg-white/6" />
              <div className="h-4 w-5/6 rounded-lg bg-white/6" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
