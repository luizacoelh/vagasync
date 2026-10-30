import { NextRequest, NextResponse } from "next/server";
import { authorizeN8n } from "@/lib/n8nWebhook";
import { loadVolumeReport } from "@/lib/volumeReport";

export const runtime = "nodejs";

// Contagens para o alerta de volume. Usa o segredo do webhook porque ele já
// existe no GitHub Actions; não grava nada e não devolve dados de usuários.
export async function GET(req: NextRequest) {
  const auth = await authorizeN8n(req);
  if (auth.response) return auth.response;
  return NextResponse.json(await loadVolumeReport());
}
