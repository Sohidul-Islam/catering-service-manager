import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/services/auth.service";
import { handleApiError } from "@/lib/api-utils";
import { EmailStatus, EmailType, Prisma } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const url = new URL(req.url);
    const emailTypeParam = url.searchParams.get("emailType");
    const statusParam = url.searchParams.get("status");
    const mealDate = url.searchParams.get("mealDate") || undefined;
    const invoiceId = url.searchParams.get("invoiceId") || undefined;
    const search = url.searchParams.get("search")?.trim() || "";
    const pageParam = url.searchParams.get("page");
    const pageSizeParam = url.searchParams.get("pageSize");

    const emailType =
      emailTypeParam && Object.values(EmailType).includes(emailTypeParam as EmailType)
        ? (emailTypeParam as EmailType)
        : undefined;
    const status =
      statusParam && Object.values(EmailStatus).includes(statusParam as EmailStatus)
        ? (statusParam as EmailStatus)
        : undefined;

    const where: Prisma.EmailLogWhereInput = {
      ...(emailType ? { emailType } : {}),
      ...(status ? { status } : {}),
      ...(mealDate ? { mealDate } : {}),
      ...(invoiceId ? { invoiceId } : {}),
      ...(search
        ? {
            OR: [
              { recipientEmail: { contains: search } },
              { subject: { contains: search } },
              { mealDate: { contains: search } },
              { resendMessageId: { contains: search } },
              { errorMessage: { contains: search } },
              { guest: { is: { name: { contains: search } } } },
              { invoice: { is: { invoiceNumber: { contains: search } } } },
            ],
          }
        : {}),
    };

    if (pageParam !== null) {
      const pageSize = Math.min(100, Math.max(1, parseInt(pageSizeParam ?? "20", 10) || 20));
      const requestedPage = Math.max(1, parseInt(pageParam, 10) || 1);
      const total = await prisma.emailLog.count({ where });
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const page = Math.min(requestedPage, totalPages);

      const logs = await prisma.emailLog.findMany({
        where,
        include: {
          guest: { select: { id: true, name: true, email: true } },
          sentBy: { select: { id: true, name: true } },
          invoice: { select: { id: true, invoiceNumber: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      });

      return NextResponse.json({
        logs,
        pagination: { page, pageSize, total, totalPages },
      });
    }

    const limit = Math.min(200, Number(url.searchParams.get("limit") ?? 100));
    const logs = await prisma.emailLog.findMany({
      where,
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
