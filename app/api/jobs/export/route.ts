import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { mapJob } from "@/lib/jobMapper";
import { STATUS_LABELS } from "@/lib/jobStatus";
import { requireUser } from "@/lib/apiAuth";

export const runtime = "nodejs";

// Escapa um valor pro formato CSV (RFC 4180): envolve em aspas se tiver
// vírgula, aspas ou quebra de linha, e duplica aspas internas.
function csvEscape(value: string): string {
  if (/^[\s]*[=+@-]|^[\t\r\n]/.test(value)) value = "'" + value;
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export async function GET() {
  const { user, response } = await requireUser();
  if (!user) return response;

  const jobs = await prisma.job.findMany({
    // DESCARTADA só existe para a deduplicação do webhook; não é vaga do usuário.
    where: { userId: user.id, status: { not: "DESCARTADA" } },
    orderBy: { createdAt: "desc" },
  });

  const rows = jobs.map(mapJob).map((job) => [
    job.company,
    job.title,
    STATUS_LABELS[job.status],
    job.technologies.join("; "),
    new Intl.DateTimeFormat("pt-BR").format(job.createdAt),
  ]);

  const header = ["Empresa", "Cargo", "Status", "Tecnologias", "Data de criação"];
  const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n");

  // BOM UTF-8 no início — sem isso, o Excel abre acentos/ç quebrados.
  const csvWithBom = "\uFEFF" + csv;

  return new NextResponse(csvWithBom, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="vagasync-vagas.csv"`,
    },
  });
}
