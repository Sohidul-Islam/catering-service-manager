import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/services/auth.service";
import { getSettings } from "@/services/schedule.service";
import { getNowInTimezone } from "@/lib/timezone";
import { buildCsv, getMonthlyReport } from "@/services/report.service";
import { poishaToBdt } from "@/lib/money";
import { handleApiError } from "@/lib/api-utils";
import { InvoiceStatus } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const settings = await getSettings();
    const now = getNowInTimezone(settings.timezone);

    const url = new URL(req.url);
    const year = Number(url.searchParams.get("year") ?? now.year);
    const month = Number(url.searchParams.get("month") ?? now.month);
    const startDate = url.searchParams.get("startDate") || undefined;
    const endDate = url.searchParams.get("endDate") || undefined;
    const guestId = url.searchParams.get("guestId") || undefined;
    const status = (url.searchParams.get("status") as InvoiceStatus) || undefined;
    const format = url.searchParams.get("format");
    const type = url.searchParams.get("type") ?? "financial";

    const report = await getMonthlyReport({ year, month, startDate, endDate, guestId, status });

    if (format === "csv") {
      let csv = "";
      let filename = `report-${year}-${String(month).padStart(2, "0")}.csv`;

      if (type === "meals") {
        filename = `meal-report-${year}-${String(month).padStart(2, "0")}.csv`;
        csv = buildCsv(
          ["Guest Name", "Email", "Total Meals", "Total Amount (BDT)"],
          report.mealReport.guestBreakdown.map((g) => [
            g.name,
            g.email,
            g.totalMeals,
            poishaToBdt(g.totalAmountPoisha).toFixed(2),
          ])
        );
      } else {
        filename = `financial-report-${year}-${String(month).padStart(2, "0")}.csv`;
        csv = buildCsv(
          [
            "Invoice Number",
            "Guest Name",
            "Email",
            "Total Meals",
            "Total Bill (BDT)",
            "Paid (BDT)",
            "Outstanding (BDT)",
            "Status",
          ],
          report.financialReport.invoices.map((inv) => [
            inv.invoiceNumber,
            inv.user.name,
            inv.user.email,
            inv.totalMeals,
            poishaToBdt(inv.totalAmountPoisha).toFixed(2),
            poishaToBdt(inv.paidAmountPoisha).toFixed(2),
            poishaToBdt(Math.max(0, inv.totalAmountPoisha - inv.paidAmountPoisha)).toFixed(2),
            inv.status,
          ])
        );
      }

      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    return NextResponse.json({ year, month, ...report });
  } catch (error) {
    return handleApiError(error);
  }
}
