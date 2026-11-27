import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/services/auth.service";
import { createAndSendPasswordReset } from "@/services/password-reset.service";
import { handleApiError } from "@/lib/api-utils";
import { UserRole, UserStatus } from "@prisma/client";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();
    const { id } = await context.params;

    const guest = await prisma.user.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, role: true, status: true },
    });

    if (!guest) {
      return NextResponse.json({ error: "Guest not found." }, { status: 404 });
    }
    if (guest.role !== UserRole.GUEST) {
      return NextResponse.json(
        { error: "Password reset links here are restricted to guest accounts." },
        { status: 400 }
      );
    }
    if (guest.status === UserStatus.INVITED) {
      return NextResponse.json(
        { error: "Guest has not activated their account yet. Use Reinvite instead." },
        { status: 400 }
      );
    }
    if (guest.status !== UserStatus.ACTIVE) {
      return NextResponse.json(
        { error: "Inactive guests cannot reset their password. Activate the guest first." },
        { status: 400 }
      );
    }

    const origin = (
      req.nextUrl.origin ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "http://localhost:3001"
    ).replace(/\/$/, "");

    const result = await createAndSendPasswordReset({
      userId: guest.id,
      origin,
      initiatedByAdminId: admin.id,
    });

    return NextResponse.json({
      success: true,
      emailSent: result.emailSent,
      emailError: result.emailError,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
