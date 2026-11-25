import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/services/auth.service";
import { getMealSummary } from "@/services/report.service";
import { handleApiError } from "@/lib/api-utils";

const querySchema = z.object({
  period: z.enum(["today", "tomorrow", "weekly", "monthly", "custom"]).default("today"),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)")
    .optional(),
  year: z.coerce.number().int().min(2020).max(2100).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid startDate format (YYYY-MM-DD)")
    .optional(),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid endDate format (YYYY-MM-DD)")
    .optional(),
});

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const url = new URL(req.url);

    const parsed = querySchema.parse({
      period: url.searchParams.get("period") ?? "today",
      date: url.searchParams.get("date") || undefined,
      year: url.searchParams.get("year") || undefined,
      month: url.searchParams.get("month") || undefined,
      startDate: url.searchParams.get("startDate") || undefined,
      endDate: url.searchParams.get("endDate") || undefined,
    });

    if (parsed.startDate && parsed.endDate && parsed.startDate > parsed.endDate) {
      return NextResponse.json(
        { error: "startDate must be on or before endDate." },
        { status: 400 }
      );
    }

    const summary = await getMealSummary(parsed);
    return NextResponse.json(summary);
  } catch (error) {
    return handleApiError(error);
  }
}
