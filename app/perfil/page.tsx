import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { parseArray } from "@/lib/json";
import ProfileForm from "@/components/profile/ProfileForm";
import DeleteAccount from "@/components/profile/DeleteAccount";
import BackButton from "@/components/ui/BackButton";
import { getAppSettings } from "@/lib/appSettings";
import { UserProfile } from "@/types/profile";

export default async function PerfilPage({
  searchParams,
}: {
  searchParams: Promise<{ onboarding?: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { onboarding } = await searchParams;
  const isOnboarding = onboarding === "true";

  const [rawProfile, aiUser, settings] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId: session.user.id } }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { geminiCallCount: true, dailyAiLimitOverride: true, isOwner: true },
    }),
    getAppSettings(),
  ]);

  const dailyLimit = aiUser?.dailyAiLimitOverride ?? settings.dailyAiLimit;
  const usedToday = aiUser?.geminiCallCount ?? 0;
  const profile: UserProfile | null = rawProfile
    ? {
        goal: rawProfile.goal,
        interestArea: rawProfile.interestArea,
        experience: rawProfile.experience,
        skills: parseArray(rawProfile.skills),
      }
    : null;

  return (
    <main className="min-h-screen text-[#E4E6EB] px-4 py-16">
      <div className="studio-backdrop">
        <div className="studio-glow" style={{ width: 480, height: 480, top: -140, left: -120, background: "radial-gradient(circle, rgba(55,138,221,0.5), transparent 70%)" }} />
        <div className="studio-glow" style={{ width: 380, height: 380, bottom: -160, right: -80, background: "radial-gradient(circle, rgba(133,183,235,0.3), transparent 70%)" }} />
      </div>

      <div className="mx-auto max-w-xl">
        {!isOnboarding && <BackButton href="/" />}

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
            VagaSync
          </span>
        </div>

        <h1 className="text-2xl font-semibold mb-2" style={{ fontFamily: "var(--font-outfit)" }}>
          {isOnboarding ? "Complete seu perfil pra começar" : "Perfil"}
        </h1>
        <p className="text-sm text-[#7C8494] mb-8">
          {isOnboarding
            ? "Suas skills são usadas para comparar automaticamente com o que cada vaga pede — nada aqui é obrigatório, mas quanto mais completo, melhor a comparação."
            : "Suas informações são usadas para comparar suas skills com as tecnologias de cada vaga."}
        </p>

        <ProfileForm initialProfile={profile} isOnboarding={isOnboarding} usedToday={usedToday} dailyLimit={dailyLimit} />
        {!isOnboarding && !aiUser?.isOwner && (
          <div className="mt-4">
            <DeleteAccount />
          </div>
        )}
      </div>
    </main>
  );
}
