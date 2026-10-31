import { redirect, notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getAppSettings } from "@/lib/appSettings";
import { getAiUsageStats } from "@/lib/aiUsageStats";
import AppSettingsForm from "@/components/admin/AppSettingsForm";
import UsersTable from "@/components/admin/UsersTable";
import AiUsagePanel from "@/components/admin/AiUsagePanel";
import BackButton from "@/components/ui/BackButton";

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  // Re-valida no banco: com sessão JWT o isAdmin do cookie pode estar velho
  // (admin revogado continua com isAdmin: true no cookie por até 30 dias).
  // A API já faz isso em requireAdmin(); a página também precisa fazer, senão
  // um admin revogado ainda enxergaria a lista de usuários e o consumo de IA.
  const freshAdmin = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isAdmin: true },
  });
  if (!freshAdmin?.isAdmin) {
    notFound();
  }

  const [settings, users, aiStats] = await Promise.all([
    getAppSettings(),
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        isAdmin: true,
        isOwner: true,
        dailyAiLimitOverride: true,
        geminiCallCount: true,
        createdAt: true,
        _count: { select: { jobs: true, aiUsage: true } },
      },
    }),
    getAiUsageStats(),
  ]);

  return (
    <main className="min-h-screen text-[#E4E6EB] px-4 py-16">
      <div className="studio-backdrop">
        <div className="studio-glow" style={{ width: 500, height: 500, top: -160, left: -140, background: "radial-gradient(circle, rgba(55,138,221,0.45), transparent 70%)" }} />
        <div className="studio-glow" style={{ width: 400, height: 400, bottom: -140, right: -100, background: "radial-gradient(circle, rgba(133,183,235,0.25), transparent 70%)" }} />
      </div>

      <div className="mx-auto max-w-4xl">
        <BackButton href="/" />

        {/* Wordmark */}
        <div className="flex items-center gap-2 mt-4 mb-6">
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
            Admin
          </span>
        </div>

        <h1 className="text-2xl font-semibold mb-8" style={{ fontFamily: "var(--font-outfit)" }}>
          Configurações e usuários
        </h1>

        <div className="space-y-6">
          <AppSettingsForm initialSettings={settings} />
          <UsersTable initialUsers={users} currentUserId={session.user.id} />
          <AiUsagePanel
            byUser={aiStats.byUser}
            byDay={aiStats.byDay}
            totalCalls={aiStats.totalCalls}
            totalTokens={aiStats.totalTokens}
          />
        </div>
      </div>
    </main>
  );
}
