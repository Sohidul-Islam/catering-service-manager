import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/services/auth.service";
import {
  buildPublicInvoiceUrl,
  generatePublicInvoiceToken,
  regeneratePublicInvoiceToken,
  revokePublicInvoiceToken,
} from "@/services/public-invoice.service";
import { handleApiError } from "@/lib/api-utils";

const actionSchema = z.object({
  action: z.enum(["generate", "revoke", "regenerate"]),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();
    const { id } = await context.params;
    const body = await req.json();
    const { action } = actionSchema.parse(body);

    const invoice = await prisma.invoice.findUnique({ where: { id } });
    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const origin = new URL(req.url).origin;

    if (action === "revoke") {
      await revokePublicInvoiceToken(id, admin.id);
      return NextResponse.json({ revoked: true, token: null, publicUrl: null });
    }

    const tokenRecord =
      action === "regenerate"
        ? await regeneratePublicInvoiceToken(id, admin.id)
        : await generatePublicInvoiceToken(id, admin.id);

    return NextResponse.json({
      token: tokenRecord.token,
      publicUrl: buildPublicInvoiceUrl(tokenRecord.token, origin),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
