import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ensureMonthSchedule, getSettings } from "@/services/schedule.service";
import { getNowInTimezone } from "@/lib/timezone";
import { handleApiError } from "@/lib/api-utils";

const cronBodySchema = z
  .object({
    year: z.number().int().min(2020).max(2100).optional(),
    month: z.number().int().min(1).max(12).optional(),
  })
  .optional();

function isAuthorizedCron(req: NextRequest): { ok: boolean; error?: NextResponse } {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return {
      ok: false,
      error: NextResponse.json(
        { error: "CRON_SECRET is not configured on the server." },
        { status: 500 }
      ),
    };
  }

  const authHeader = req.headers.get("authorization");
  const headerSecret = req.headers.get("x-cron-secret");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

  if (bearerToken !== cronSecret && headerSecret !== cronSecret) {
    return {
      ok: false,
      error: NextResponse.json({ error: "Unauthorized cron request" }, { status: 401 }),
    };
  }

  return { ok: true };
}

export async function GET(req: NextRequest) {
  try {
    const auth = isAuthorizedCron(req);
    if (!auth.ok) return auth.error!;

    const settings = await getSettings();
    const now = getNowInTimezone(settings.timezone);
    const { schedule, createdCount } = await ensureMonthSchedule(
      now.year,
      now.month,
      null,
      true
    );

    return NextResponse.json({
      success: true,
      year: now.year,
      month: now.month,
      scheduleId: schedule.id,
      createdCount,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = isAuthorizedCron(req);
    if (!auth.ok) return auth.error!;

    let parsed: { year?: number; month?: number } | undefined;
    try {
      const raw = await req.text();
      if (raw.trim()) {
        parsed = cronBodySchema.parse(JSON.parse(raw));
      }
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const settings = await getSettings();
    const now = getNowInTimezone(settings.timezone);
    const year = parsed?.year ?? now.year;
    const month = parsed?.month ?? now.month;

    const { schedule, createdCount } = await ensureMonthSchedule(year, month, null, true);

    return NextResponse.json({
      success: true,
      year,
      month,
      scheduleId: schedule.id,
      createdCount,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
