import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/services/auth.service";
import { ensureMonthSchedule } from "@/services/schedule.service";
import { handleApiError } from "@/lib/api-utils";

const generateSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
});

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await req.json();
    const { year, month } = generateSchema.parse(body);

    const result = await ensureMonthSchedule(year, month, admin.id, true);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
