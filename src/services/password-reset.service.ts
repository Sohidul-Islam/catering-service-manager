import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { AuthError, hashPassword } from "@/services/auth.service";
import { logActivity } from "@/services/activity.service";
import { sendPasswordResetEmail } from "@/services/notification.service";
import { UserRole, UserStatus } from "@prisma/client";

export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 60 minutes

export function hashResetToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${visible}***@${domain}`;
}

export async function createAndSendPasswordReset(params: {
  userId: string;
  origin: string;
  initiatedByAdminId?: string | null;
}) {
  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { id: true, name: true, email: true, status: true },
  });

  if (!user) {
    throw new AuthError("User not found.", 404);
  }
  if (user.status !== UserStatus.ACTIVE) {
    throw new AuthError("Only active accounts can reset their password.", 403);
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashResetToken(rawToken);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + PASSWORD_RESET_TTL_MS);

  await prisma.$transaction(async (tx) => {
    await tx.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: now },
    });

    const created = await tx.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
        createdById: params.initiatedByAdminId ?? null,
      },
    });

    await logActivity({
      tx,
      actorId: params.initiatedByAdminId ?? user.id,
      targetUserId: user.id,
      action: params.initiatedByAdminId
        ? "ADMIN_SEND_PASSWORD_RESET"
        : "PASSWORD_RESET_REQUESTED",
      entityType: "PasswordResetToken",
      entityId: created.id,
    });
  });

  const baseOrigin = params.origin.replace(/\/$/, "");
  const resetUrl = `${baseOrigin}/reset-password?token=${rawToken}`;

  const emailResult = await sendPasswordResetEmail({
    guestId: user.id,
    guestName: user.name,
    guestEmail: user.email,
    resetUrl,
    sentById: params.initiatedByAdminId ?? user.id,
    initiatedByAdmin: Boolean(params.initiatedByAdminId),
  });

  return {
    emailSent: emailResult.success,
    emailError: emailResult.success ? undefined : emailResult.error,
  };
}

export async function verifyPasswordResetToken(rawToken: string): Promise<
  | { valid: true; maskedEmail: string; expiresAt: string }
  | { valid: false; error: string; status: number }
> {
  const trimmed = rawToken.trim();
  if (!trimmed) {
    return { valid: false, error: "Invalid password reset link.", status: 400 };
  }

  const tokenHash = hashResetToken(trimmed);
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: {
      user: { select: { id: true, email: true, status: true } },
    },
  });

  if (!record) {
    return { valid: false, error: "Invalid or unknown password reset link.", status: 404 };
  }
  if (record.usedAt) {
    return {
      valid: false,
      error: "This password reset link has already been used.",
      status: 410,
    };
  }
  if (record.expiresAt <= new Date()) {
    return {
      valid: false,
      error: "This password reset link has expired. Please request a new one.",
      status: 410,
    };
  }
  if (record.user.status !== UserStatus.ACTIVE) {
    return {
      valid: false,
      error: "This account is not active. Please contact your administrator.",
      status: 403,
    };
  }

  return {
    valid: true,
    maskedEmail: maskEmail(record.user.email),
    expiresAt: record.expiresAt.toISOString(),
  };
}

export async function completePasswordReset(params: {
  rawToken: string;
  newPassword: string;
}) {
  const trimmed = params.rawToken.trim();
  if (!trimmed) {
    throw new AuthError("Invalid password reset link.", 400);
  }

  const tokenHash = hashResetToken(trimmed);
  const passwordHash = await hashPassword(params.newPassword);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const record = await tx.passwordResetToken.findUnique({
      where: { tokenHash },
      include: {
        user: { select: { id: true, status: true } },
      },
    });

    if (!record) {
      throw new AuthError("Invalid or unknown password reset link.", 404);
    }
    if (record.usedAt) {
      throw new AuthError("This password reset link has already been used.", 410);
    }
    if (record.expiresAt <= now) {
      throw new AuthError(
        "This password reset link has expired. Please request a new one.",
        410
      );
    }
    if (record.user.status !== UserStatus.ACTIVE) {
      throw new AuthError(
        "This account is not active. Please contact your administrator.",
        403
      );
    }

    const consumed = await tx.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });

    if (consumed.count !== 1) {
      throw new AuthError("This password reset link has already been used.", 410);
    }

    await tx.passwordResetToken.updateMany({
      where: { userId: record.userId, usedAt: null },
      data: { usedAt: now },
    });

    await tx.user.update({
      where: { id: record.userId },
      data: { passwordHash },
    });

    await logActivity({
      tx,
      actorId: record.userId,
      targetUserId: record.userId,
      action: "PASSWORD_RESET_COMPLETED",
      entityType: "User",
      entityId: record.userId,
    });
  });
}

export async function adminChangeGuestPassword(params: {
  guestId: string;
  newPassword: string;
  adminId: string;
}) {
  const guest = await prisma.user.findUnique({
    where: { id: params.guestId },
    select: { id: true, name: true, email: true, role: true, status: true },
  });

  if (!guest) {
    throw new AuthError("Guest not found.", 404);
  }
  if (guest.role !== UserRole.GUEST) {
    throw new AuthError("Password management here is restricted to guest accounts.", 400);
  }
  if (guest.status === UserStatus.INVITED) {
    throw new AuthError(
      "Guest has not activated their account yet. Use Reinvite instead.",
      400
    );
  }

  const passwordHash = await hashPassword(params.newPassword);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: guest.id },
      data: { passwordHash },
    });

    await tx.passwordResetToken.updateMany({
      where: { userId: guest.id, usedAt: null },
      data: { usedAt: now },
    });

    await logActivity({
      tx,
      actorId: params.adminId,
      targetUserId: guest.id,
      action: "ADMIN_CHANGE_GUEST_PASSWORD",
      entityType: "User",
      entityId: guest.id,
    });
  });

  return {
    id: guest.id,
    name: guest.name,
    email: guest.email,
  };
}
