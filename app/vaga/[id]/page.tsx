import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { mapJob } from "@/lib/jobMapper";
import { parseArray } from "@/lib/json";
import BackButton from "@/components/ui/BackButton";
import VagaContent from "@/components/job/VagaContent";

// Busca a vaga completa e as skills do perfil em paralelo.
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

  // Com o Prisma connection cache e JWT ativo, isso é uma única conexão
  // reutilizada + 1 roundtrip paralelo. Enquanto resolve, aparece o
  // app/vaga/[id]/loading.tsx.
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
            href={data.job.status === "MONITORADA" || data.job.status === "DESCARTADA" ? "/monitoradas" : "/"}
            label={data.job.status === "MONITORADA" || data.job.status === "DESCARTADA" ? "Monitoradas" : "Dashboard"}
          />
        </div>

        {created === "true" && (
          <div className="mt-4 rounded-xl border border-[#4ADE80]/40 bg-[#4ADE80]/10 px-4 py-3 text-sm text-[#4ADE80]">
            ✔ Vaga salva com sucesso.
          </div>
        )}

        <VagaContent
          serverJob={data.job}
          serverUserSkills={data.userSkills}
        />
      </div>
    </main>
  );
}
