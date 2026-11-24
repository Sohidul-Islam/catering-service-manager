import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleApiError } from "@/lib/api-utils";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;
    const invitation = await prisma.invitation.findUnique({
      where: { token },
      include: {
        user: {
          select: { id: true, name: true, email: true, phone: true, status: true },
        },
      },
    });

    if (!invitation) {
      return NextResponse.json({ error: "Invalid invitation link." }, { status: 404 });
    }
    if (invitation.acceptedAt) {
      return NextResponse.json({ error: "This invitation has already been accepted." }, { status: 409 });
    }
    if (invitation.expiresAt < new Date()) {
      return NextResponse.json({ error: "This invitation link has expired." }, { status: 410 });
    }

    return NextResponse.json({
      invitation: {
        name: invitation.user.name,
        email: invitation.user.email,
        phone: invitation.user.phone,
        expiresAt: invitation.expiresAt,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
