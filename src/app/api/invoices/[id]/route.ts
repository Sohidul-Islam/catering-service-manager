import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireAuth } from "@/services/auth.service";
import { deleteInvoice } from "@/services/invoice.service";
import { handleApiError } from "@/lib/api-utils";
import { UserRole } from "@prisma/client";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { id } = await context.params;

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        items: { orderBy: { date: "asc" } },
        payments: {
          orderBy: { paidAt: "desc" },
          include: {
            recordedBy: { select: { name: true } },
            allocations: {
              include: {
                invoiceItem: { select: { date: true } },
              },
            },
          },
        },
      },
    });

    if (!invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    if (user.role === UserRole.GUEST && invoice.userId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ invoice });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();
    const { id } = await context.params;

    const deleted = await deleteInvoice(id, admin.id);
    if (!deleted) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    return NextResponse.json({
      deleted: true,
      invoiceNumber: deleted.invoiceNumber,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
