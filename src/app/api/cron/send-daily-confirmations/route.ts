import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { EmailType, UserRole, UserStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ensureMonthSchedule, getSettings, isWorkingDay } from "@/services/schedule.service";
import { sendMealConfirmationEmails } from "@/services/notification.service";
import { getNowInTimezone, parseDateStr } from "@/lib/timezone";
import { handleApiError } from "@/lib/api-utils";

const cronBodySchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    force: z.boolean().optional(),
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

async function runDailyConfirmations(targetDateStr?: string, force = false) {
  const settings = await getSettings();
  const now = getNowInTimezone(settings.timezone);
  const dateStr = targetDateStr ?? now.dateStr;
  const { year, month } = parseDateStr(dateStr);

  await ensureMonthSchedule(year, month, null, false, settings);

  const holiday = await prisma.holiday.findUnique({ where: { date: dateStr } });
  const holidayMap = new Map(holiday ? [[holiday.date, holiday]] : []);
  const working = isWorkingDay(dateStr, settings, holidayMap);

  if (!working && !force) {
    return {
      success: true,
      skipped: true,
      reason: "Non-working day",
      date: dateStr,
      sentCount: 0,
      failedCount: 0,
    };
  }

  const [records, priorSentLogs] = await Promise.all([
    prisma.mealRecord.findMany({
      where: {
        date: dateStr,
        quantity: { gt: 0 },
        user: { role: UserRole.GUEST, status: UserStatus.ACTIVE },
      },
      select: { userId: true },
    }),
    prisma.emailLog.findMany({
      where: {
        emailType: EmailType.MEAL_CONFIRMATION,
        mealDate: dateStr,
        status: "SENT",
      },
      select: { guestId: true },
    }),
  ]);

  const alreadySentSet = new Set(priorSentLogs.map((l) => l.guestId).filter(Boolean));
  const guestIds = Array.from(new Set(records.map((r) => r.userId))).filter(
    (id) => force || !alreadySentSet.has(id)
  );

  if (guestIds.length === 0) {
    return {
      success: true,
      skipped: false,
      date: dateStr,
      sentCount: 0,
      failedCount: 0,
      alreadySentCount: alreadySentSet.size,
    };
  }

  const results = await sendMealConfirmationEmails({
    guestIds,
    date: dateStr,
    sentById: null,
  });

  const sentCount = results.filter((r) => r.success).length;
  const failedCount = results.length - sentCount;

  return {
    success: true,
    skipped: false,
    date: dateStr,
    sentCount,
    failedCount,
    alreadySentCount: alreadySentSet.size,
    results,
  };
}

export async function GET(req: NextRequest) {
  try {
    const auth = isAuthorizedCron(req);
    if (!auth.ok) return auth.error!;

    const result = await runDailyConfirmations();
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = isAuthorizedCron(req);
    if (!auth.ok) return auth.error!;

    let parsed: { date?: string; force?: boolean } | undefined;
    try {
      const raw = await req.text();
      if (raw.trim()) {
        parsed = cronBodySchema.parse(JSON.parse(raw));
      }
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const result = await runDailyConfirmations(parsed?.date, Boolean(parsed?.force));
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
