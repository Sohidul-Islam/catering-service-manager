import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireAuth } from "@/services/auth.service";
import { recordPayment } from "@/services/payment.service";
import { bdtToPoisha } from "@/lib/money";
import { handleApiError } from "@/lib/api-utils";
import { PaymentMethod, PaymentType, UserRole } from "@prisma/client";

const createPaymentSchema = z.object({
  invoiceId: z.string().min(1),
  paymentType: z.nativeEnum(PaymentType),
  method: z.nativeEnum(PaymentMethod).default(PaymentMethod.CASH),
  amountBdt: z.number().positive().optional(),
  invoiceItemIds: z.array(z.string()).optional(),
  reference: z.string().max(120).optional(),
  note: z.string().max(300).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth();
    const url = new URL(req.url);
    const guestIdParam = url.searchParams.get("guestId");

    const payments = await prisma.payment.findMany({
      where:
        user.role === UserRole.GUEST
          ? { userId: user.id }
          : guestIdParam
          ? { userId: guestIdParam }
          : {},
      include: {
        user: { select: { id: true, name: true, email: true } },
        invoice: { select: { id: true, invoiceNumber: true, year: true, month: true } },
        recordedBy: { select: { id: true, name: true } },
        allocations: {
          include: {
            invoiceItem: { select: { id: true, date: true, totalAmountPoisha: true } },
          },
        },
      },
      orderBy: { paidAt: "desc" },
    });

    return NextResponse.json({ payments });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await req.json();
    const data = createPaymentSchema.parse(body);

    const result = await recordPayment({
      invoiceId: data.invoiceId,
      recordedById: admin.id,
      paymentType: data.paymentType,
      method: data.method,
      amountPoisha: data.amountBdt !== undefined ? bdtToPoisha(data.amountBdt) : undefined,
      invoiceItemIds: data.invoiceItemIds,
      reference: data.reference,
      note: data.note,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}
