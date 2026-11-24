import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createSessionToken, hashPassword, setSessionCookie } from "@/services/auth.service";
import { syncGuestMonthSchedule, getSettings } from "@/services/schedule.service";
import { getNowInTimezone } from "@/lib/timezone";
import { logActivity } from "@/services/activity.service";
import { handleApiError } from "@/lib/api-utils";
import { UserStatus } from "@prisma/client";

const acceptSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(6, "Password must be at least 6 characters"),
  phone: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, password, phone } = acceptSchema.parse(body);

    const invitation = await prisma.invitation.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!invitation) {
      return NextResponse.json({ error: "Invalid invitation link." }, { status: 404 });
    }
    if (invitation.acceptedAt) {
      return NextResponse.json({ error: "Invitation already accepted." }, { status: 409 });
    }
    if (invitation.expiresAt < new Date()) {
      return NextResponse.json({ error: "Invitation link has expired." }, { status: 410 });
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.$transaction(async (tx) => {
      await tx.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });

      const updatedUser = await tx.user.update({
        where: { id: invitation.userId },
        data: {
          passwordHash,
          status: UserStatus.ACTIVE,
          ...(phone !== undefined ? { phone } : {}),
        },
      });

      await logActivity({
        tx,
        actorId: updatedUser.id,
        targetUserId: updatedUser.id,
        action: "ACCEPT_INVITATION",
        entityType: "User",
        entityId: updatedUser.id,
        newValue: "ACTIVE",
      });

      return updatedUser;
    });

    // Generate schedule records for current month for this newly activated guest
    const settings = await getSettings();
    const now = getNowInTimezone(settings.timezone);
    await syncGuestMonthSchedule(user.id, now.year, now.month);

    const sessionToken = await createSessionToken({
      userId: user.id,
      role: user.role,
      email: user.email,
    });
    await setSessionCookie(sessionToken);

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
