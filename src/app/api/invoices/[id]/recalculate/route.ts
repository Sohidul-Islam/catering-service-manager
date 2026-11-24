import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/services/auth.service";
import { recalculateInvoiceFromMeals } from "@/services/invoice.service";
import { handleApiError } from "@/lib/api-utils";

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();
    const { id } = await context.params;

    const updated = await recalculateInvoiceFromMeals(id, admin.id);
    if (!updated) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    return NextResponse.json({ invoice: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
