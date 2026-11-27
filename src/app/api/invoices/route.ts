import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireAuth } from "@/services/auth.service";
import { generateMonthlyInvoices } from "@/services/invoice.service";
import { handleApiError } from "@/lib/api-utils";
import { InvoiceStatus, Prisma, UserRole } from "@prisma/client";

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
    const statusParam = url.searchParams.get("status");
    const guestIdParam = url.searchParams.get("guestId");
    const search = url.searchParams.get("search")?.trim() || "";
    const pageParam = url.searchParams.get("page");
    const pageSizeParam = url.searchParams.get("pageSize");

    const status =
      statusParam && Object.values(InvoiceStatus).includes(statusParam as InvoiceStatus)
        ? (statusParam as InvoiceStatus)
        : undefined;

    const where: Prisma.InvoiceWhereInput = {
      ...(user.role === UserRole.GUEST
        ? { userId: user.id }
        : guestIdParam
        ? { userId: guestIdParam }
        : {}),
      ...(yearParam ? { year: Number(yearParam) } : {}),
      ...(monthParam ? { month: Number(monthParam) } : {}),
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { invoiceNumber: { contains: search } },
              { user: { name: { contains: search } } },
              { user: { email: { contains: search } } },
            ],
          }
        : {}),
    };

    const include = {
      user: { select: { id: true, name: true, email: true } },
      items: {
        orderBy: { date: "asc" as const },
      },
      payments: {
        orderBy: { paidAt: "desc" as const },
      },
      ...(user.role === UserRole.ADMIN
        ? {
            publicTokens: {
              where: { revokedAt: null },
              orderBy: { createdAt: "desc" as const },
              take: 1,
              select: { token: true, createdAt: true },
            },
            emailLogs: {
              where: { emailType: "INVOICE" as const, status: "SENT" as const },
              orderBy: { sentAt: "desc" as const },
              take: 1,
              select: { sentAt: true, recipientEmail: true },
            },
          }
        : {}),
    };

    if (pageParam !== null) {
      const pageSize = Math.min(100, Math.max(1, parseInt(pageSizeParam ?? "20", 10) || 20));
      const requestedPage = Math.max(1, parseInt(pageParam, 10) || 1);
      const total = await prisma.invoice.count({ where });
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const page = Math.min(requestedPage, totalPages);

      const invoices = await prisma.invoice.findMany({
        where,
        include,
        orderBy: [{ year: "desc" }, { month: "desc" }, { user: { name: "asc" } }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      });

      return NextResponse.json({
        invoices,
        pagination: { page, pageSize, total, totalPages },
      });
    }

    const invoices = await prisma.invoice.findMany({
      where,
      include,
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
