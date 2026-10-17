import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { mapJob } from "@/lib/jobMapper";
import DashboardClient from "@/components/dashboard/DashboardClient";
import UserMenu from "@/components/auth/UserMenu";
import MonitoredLink from "@/components/dashboard/MonitoredLink";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  // Promise.all — profile e jobs buscados em paralelo.
  // Com JWT, auth() nao toca o banco, entao o primeiro roundtrip ao Turso
  // acontece so aqui. As duas queries rodam simultaneamente em vez de
  // sequenciais, cortando o tempo de espera a metade.
  // Vagas MONITORADAS (coletadas pelo n8n) ficam fora do dashboard principal —
  // moram em /monitoradas até o usuário marcar "Tenho interesse". A contagem
  // alimenta o botão de acesso no header. Três queries em paralelo.
  const [profile, jobs, monitoredCount] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId: session.user.id } }),
    prisma.job.findMany({
      where: { userId: session.user.id, status: { not: "MONITORADA" } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.job.count({ where: { userId: session.user.id, status: "MONITORADA" } }),
  ]);

  if (!profile) {
    redirect("/perfil?onboarding=true");
  }

  const jobList = jobs.map(mapJob);

  return (
    <main className="min-h-screen text-[#E4E6EB] px-4 py-10">
      <div className="studio-backdrop">
        <div className="studio-glow" style={{ width: 560, height: 560, top: -220, left: -160, background: "radial-gradient(circle, rgba(55,138,221,0.5), transparent 70%)" }} />
        <div className="studio-glow" style={{ width: 480, height: 480, top: "30%", right: -200, background: "radial-gradient(circle, rgba(133,183,235,0.3), transparent 70%)" }} />
      </div>

      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span
                className="h-[22px] w-[22px] rounded-[7px]"
                style={{
                  background: "linear-gradient(155deg, #85B7EB, #378ADD)",
                  boxShadow: "0 0 12px rgba(55,138,221,0.55), inset 0 1px 1px rgba(255,255,255,0.5)",
                }}
              />
              <span className="text-sm font-semibold" style={{ fontFamily: "var(--font-outfit)" }}>
                VagaSync
              </span>
            </div>
            <h1 className="text-2xl font-semibold" style={{ fontFamily: "var(--font-outfit)" }}>
              Suas candidaturas
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {/* Exportar CSV movido para /perfil — ação pouco usada, fica
                disponível como função extra na página de perfil */}
            <MonitoredLink count={monitoredCount} />
            <Link
              href="/nova-vaga"
              className="inline-block w-fit rounded-xl px-4 py-2 text-sm font-semibold text-[#08131F] transition-shadow"
              style={{
                fontFamily: "var(--font-outfit)",
                background: "linear-gradient(155deg, #85B7EB, #378ADD)",
                boxShadow: "0 0 0 1px rgba(255,255,255,0.25) inset, 0 8px 20px -8px rgba(55,138,221,0.6)",
              }}
            >
              + Nova vaga
            </Link>
            <UserMenu user={session.user} />
          </div>
        </div>

        <DashboardClient jobs={jobList} />
      </div>
    </main>
  );
}
