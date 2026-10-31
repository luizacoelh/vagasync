import { readJobJson, object } from "@/lib/jobInput";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/adminAuth";
import { getAppSettings, updateAppSettings, type AppSettings } from "@/lib/appSettings";

export const runtime = "nodejs";

const SETTING_KEYS = [
  "dailyAiLimit",
  "ipHourlyLimit",
  "maxDescriptionLength",
  "newAccountsPerDay",
  "globalManualJobsPerDay",
  "globalAiPerDay",
] as const;

export async function GET() {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  const settings = await getAppSettings();
  return NextResponse.json(settings);
}

export async function PUT(req: NextRequest) {
  const { user, response } = await requireAdmin();
  if (!user) return response;

  let body: Record<string, unknown>;
  try { body = object(await readJobJson(req)); }
  catch { return NextResponse.json({ error: "Corpo inv\u00e1lido ou muito grande." }, { status: 400 }); }
  const patch: Partial<AppSettings> = {};

  for (const key of SETTING_KEYS) {
    const value = body[key];
    if (value !== undefined && (typeof value !== "number" || value <= 0 || !Number.isSafeInteger(value) || (typeof value === "number" && value > 2147483647))) {
      return NextResponse.json({ error: `Valor inválido para ${key} — precisa ser um inteiro positivo.` }, { status: 400 });
    }
    if (value !== undefined) patch[key] = value as number;
  }

  const settings = await updateAppSettings(patch);
  return NextResponse.json(settings);
}
