import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/services/activity.service";
import { sendGuestInvitationEmail } from "@/services/notification.service";
import { MealPreference, UserRole, UserStatus } from "@prisma/client";

export interface CreateAndInviteGuestInput {
  name: string;
  email: string;
  phone?: string;
  mealPreference: MealPreference;
  defaultMealQty: number;
  mealStartDate?: string | null;
  actorId: string;
  origin: string;
}

export class GuestAlreadyExistsError extends Error {
  constructor(email: string) {
    super(`A user with this email already exists (${email}).`);
    this.name = "GuestAlreadyExistsError";
  }
}

export async function createAndInviteGuest(input: CreateAndInviteGuestInput) {
  const email = input.email.toLowerCase().trim();
  const mealStartDate = input.mealStartDate ? input.mealStartDate.trim() || null : null;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new GuestAlreadyExistsError(email);
  }

  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14); // 14 days

  const result = await prisma.$transaction(async (tx) => {
    const guest = await tx.user.create({
      data: {
        name: input.name.trim(),
        email,
        phone: input.phone?.trim() || null,
        role: UserRole.GUEST,
        status: UserStatus.INVITED,
        mealPreference: input.mealPreference,
        defaultMealQty:
          input.mealPreference === MealPreference.OCCASIONAL ? 0 : input.defaultMealQty,
        mealStartDate,
      },
    });

    const invitation = await tx.invitation.create({
      data: {
        userId: guest.id,
        token,
        expiresAt,
      },
    });

    await logActivity({
      tx,
      actorId: input.actorId,
      targetUserId: guest.id,
      action: "INVITE_GUEST",
      entityType: "User",
      entityId: guest.id,
      newValue: JSON.stringify({
        email: guest.email,
        mealPreference: guest.mealPreference,
        defaultMealQty: guest.defaultMealQty,
      }),
    });

    return { guest, invitation };
  });

  const invitePath = `/invite/accept?token=${result.invitation.token}`;
  const baseOrigin = input.origin.replace(/\/$/, "");
  const inviteUrl = `${baseOrigin}${invitePath}`;

  const emailResult = await sendGuestInvitationEmail({
    guestId: result.guest.id,
    guestName: result.guest.name,
    guestEmail: result.guest.email,
    inviteUrl,
    sentById: input.actorId,
  });

  return {
    guest: result.guest,
    inviteToken: result.invitation.token,
    invitePath,
    emailSent: emailResult.success,
    emailError: emailResult.success ? undefined : emailResult.error,
  };
}
