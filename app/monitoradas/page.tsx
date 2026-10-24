import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { JOB_SUMMARY_SELECT, mapJobSummary } from "@/lib/jobMapper";
import BackButton from "@/components/ui/BackButton";
import MonitoredJobList, { type JobGroup } from "@/components/monitoradas/MonitoredJobList";

// Fuso usado só para agrupar por dia e escrever "Hoje"/"Ontem". Fixo em
// Brasília por enquanto; se o app ganhar usuários em outros fusos, o ideal é
// guardar o fuso no perfil.
const DISPLAY_TZ = "America/Sao_Paulo";

function dayKey(date: Date): string {
  // "en-CA" formata como YYYY-MM-DD, que ordena e compara como texto.
  return new Intl.DateTimeFormat("en-CA", { timeZone: DISPLAY_TZ }).format(date);
}

function dayLabel(key: string, todayKey: string, yesterdayKey: string): string {
  if (key === todayKey) return "Hoje";
  if (key === yesterdayKey) return "Ontem";
  const [year, month, day] = key.split("-");
  return `${day}/${month}/${year}`;
}

// Chaves de "hoje" e "ontem" no fuso de exibição. Fica numa função à parte
// (e não direto no componente) porque ler o relógio durante a renderização é
// impuro para a regra react-hooks/purity do lint.
function getTodayAndYesterdayKeys(): { todayKey: string; yesterdayKey: string } {
  const now = Date.now();
  return {
    todayKey: dayKey(new Date(now)),
    yesterdayKey: dayKey(new Date(now - 24 * 60 * 60 * 1000)),
  };
}

export default async function MonitoradasPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  // createdAt só serve para agrupar por dia aqui no servidor; não vai para o cliente.
  const rows = await prisma.job.findMany({
    where: { userId: session.user.id, status: "MONITORADA" },
    orderBy: { createdAt: "desc" },
    select: { ...JOB_SUMMARY_SELECT, createdAt: true },
  });

  const { todayKey, yesterdayKey } = getTodayAndYesterdayKeys();

  // A lista já vem da mais nova para a mais antiga, então basta agrupar
  // vagas consecutivas do mesmo dia.
  const groups: JobGroup[] = [];
  for (const { createdAt, ...row } of rows) {
    const job = mapJobSummary(row);
    const key = dayKey(createdAt);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.jobs.push(job);
    } else {
      groups.push({ key, label: dayLabel(key, todayKey, yesterdayKey), jobs: [job] });
    }
  }

  return (
    <main className="min-h-screen text-[#E4E6EB] px-4 py-16">
      <div className="studio-backdrop">
        <div className="studio-glow" style={{ width: 480, height: 480, top: -140, left: -120, background: "radial-gradient(circle, rgba(139,92,246,0.35), transparent 70%)" }} />
        <div className="studio-glow" style={{ width: 420, height: 420, bottom: -160, right: -100, background: "radial-gradient(circle, rgba(55,138,221,0.3), transparent 70%)" }} />
      </div>

      <div className="mx-auto max-w-2xl">
        <BackButton href="/" />

        <div className="mt-4 mb-6 flex items-center gap-2">
          <span
            className="h-[18px] w-[18px] shrink-0 rounded-[6px]"
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

        <h1 className="mb-2 text-2xl font-semibold" style={{ fontFamily: "var(--font-outfit)" }}>
          Vagas monitoradas
        </h1>
        <p className="mb-8 text-sm text-[#7C8494]">
          Vagas encontradas automaticamente. Marque as que te interessam para levá-las ao seu
          dashboard e descarte o resto.
          {rows.length > 0 &&
            ` ${rows.length} ${rows.length === 1 ? "vaga aguardando" : "vagas aguardando"} sua avaliação.`}
        </p>

        <MonitoredJobList groups={groups} />
      </div>
    </main>
  );
}
