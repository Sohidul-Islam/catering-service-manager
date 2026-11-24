import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireAuth } from "@/services/auth.service";
import { generateMonthlyInvoices } from "@/services/invoice.service";
import { handleApiError } from "@/lib/api-utils";
import { InvoiceStatus, UserRole } from "@prisma/client";

const generateSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
});

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();
    const url = new URL(req.url);
    const yearParam = url.searchParams.get("year");
    const monthParam = url.searchParams.get("month");
    const statusParam = url.searchParams.get("status") as InvoiceStatus | null;
    const guestIdParam = url.searchParams.get("guestId");

    const invoices = await prisma.invoice.findMany({
      where: {
        ...(user.role === UserRole.GUEST
          ? { userId: user.id }
          : guestIdParam
          ? { userId: guestIdParam }
          : {}),
        ...(yearParam ? { year: Number(yearParam) } : {}),
        ...(monthParam ? { month: Number(monthParam) } : {}),
        ...(statusParam ? { status: statusParam } : {}),
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        items: {
          orderBy: { date: "asc" },
        },
        payments: {
          orderBy: { paidAt: "desc" },
        },
        ...(user.role === UserRole.ADMIN
          ? {
              publicTokens: {
                where: { revokedAt: null },
                orderBy: { createdAt: "desc" },
                take: 1,
                select: { token: true, createdAt: true },
              },
              emailLogs: {
                where: { emailType: "INVOICE", status: "SENT" },
                orderBy: { sentAt: "desc" },
                take: 1,
                select: { sentAt: true, recipientEmail: true },
              },
            }
          : {}),
      },
      orderBy: [{ year: "desc" }, { month: "desc" }, { user: { name: "asc" } }],
    });

    return NextResponse.json({ invoices });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await req.json();
    const { year, month } = generateSchema.parse(body);

    const invoices = await generateMonthlyInvoices(year, month, admin.id);
    return NextResponse.json({ count: invoices.length, invoices });
  } catch (error) {
    return handleApiError(error);
  }
}
