import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/services/auth.service";
import { handleApiError } from "@/lib/api-utils";
import { EmailStatus, EmailType } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const emailType = url.searchParams.get("emailType") as EmailType | null;
    const status = url.searchParams.get("status") as EmailStatus | null;
    const mealDate = url.searchParams.get("mealDate") || undefined;
    const invoiceId = url.searchParams.get("invoiceId") || undefined;
    const limit = Math.min(200, Number(url.searchParams.get("limit") ?? 100));

    const logs = await prisma.emailLog.findMany({
      where: {
        ...(emailType ? { emailType } : {}),
        ...(status ? { status } : {}),
        ...(mealDate ? { mealDate } : {}),
        ...(invoiceId ? { invoiceId } : {}),
      },
      include: {
        guest: { select: { id: true, name: true, email: true } },
        sentBy: { select: { id: true, name: true } },
        invoice: { select: { id: true, invoiceNumber: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json({ logs });
  } catch (error) {
    return handleApiError(error);
  }
}
