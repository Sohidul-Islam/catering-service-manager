import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/services/auth.service";
import { handleApiError } from "@/lib/api-utils";
import { logActivity } from "@/services/activity.service";

export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();
    const { id } = await context.params;

    const guest = await prisma.user.findUnique({ where: { id } });
    if (!guest) {
      return NextResponse.json({ error: "Guest not found" }, { status: 404 });
    }

    const token = crypto.randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14);

    const invitation = await prisma.invitation.upsert({
      where: { userId: id },
      update: { token, expiresAt, acceptedAt: null },
      create: { userId: id, token, expiresAt },
    });

    await logActivity({
      actorId: admin.id,
      targetUserId: id,
      action: "REINVITE_GUEST",
      entityType: "Invitation",
      entityId: invitation.id,
    });

    return NextResponse.json({
      inviteToken: invitation.token,
      invitePath: `/invite/accept?token=${invitation.token}`,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
