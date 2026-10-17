import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { mapJob } from "@/lib/jobMapper";
import { parseArray } from "@/lib/json";
import BackButton from "@/components/ui/BackButton";
import VagaContent from "@/components/job/VagaContent";

// Busca os dados da vaga no servidor — usada como fallback caso o contexto
// client-side não tenha os dados (ex: acesso direto via URL, reload da página)
async function getVagaData(id: string, userId: string) {
  const [rawJob, profile] = await Promise.all([
    prisma.job.findUnique({ where: { id } }),
    prisma.userProfile.findUnique({
      where: { userId },
      select: { skills: true },
    }),
  ]);

  if (!rawJob || rawJob.userId !== userId) return null;

  return {
    job: mapJob(rawJob),
    userSkills: parseArray(profile?.skills),
  };
}

export default async function VagaDetalhesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await params;
  const { created } = await searchParams;

  // Busca os dados no servidor. Com o Prisma connection cache corrigido
  // e JWT ativo, isso é agora uma única conexão reutilizada + 1 roundtrip
  // paralelo. Em navegações vindas do dashboard, VagaContent já mostra
  // os dados do contexto client-side antes desta promise resolver.
  const data = await getVagaData(id, session.user.id);

  if (!data) {
    // notFound() não funciona bem dentro de async Server Components com
    // Suspense — redirect para 404 explícito é mais confiável
    redirect("/not-found");
  }

  return (
    <main className="min-h-screen text-[#E4E6EB] px-4 py-16">
      <div className="studio-backdrop">
        <div className="studio-glow" style={{ width: 480, height: 480, top: -140, left: -120, background: "radial-gradient(circle, rgba(55,138,221,0.5), transparent 70%)" }} />
        <div className="studio-glow" style={{ width: 420, height: 420, bottom: -160, right: -100, background: "radial-gradient(circle, rgba(133,183,235,0.3), transparent 70%)" }} />
      </div>

      <div className="mx-auto max-w-2xl">
        <div className="flex items-center justify-between">
          <BackButton
            href={data.job.status === "MONITORADA" ? "/monitoradas" : "/"}
            label={data.job.status === "MONITORADA" ? "Monitoradas" : "Dashboard"}
          />
        </div>

        {created === "true" && (
          <div className="mt-4 rounded-xl border border-[#4ADE80]/40 bg-[#4ADE80]/10 px-4 py-3 text-sm text-[#4ADE80]">
            ✔ Vaga salva com sucesso.
          </div>
        )}

        {/*
          VagaContent é um Client Component que:
          1. Tenta ler do JobsContext (dados já em memória do dashboard) — instantâneo
          2. Se não tiver no contexto (acesso direto, reload), usa os dados do servidor
          O resultado: transições do dashboard para vaga não mostram skeleton nunca.
        */}
        <VagaContent
          jobId={id}
          serverJob={data.job}
          serverUserSkills={data.userSkills}
        />
      </div>
    </main>
  );
}
