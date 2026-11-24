import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  createSessionToken,
  hashPassword,
  requireAuth,
  setSessionCookie,
  verifyPassword,
} from "@/services/auth.service";
import { handleApiError } from "@/lib/api-utils";

const profileSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  email: z.string().email("Valid email is required").optional(),
  phone: z.string().max(40).nullable().optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(6, "New password must be at least 6 characters").optional(),
});

export async function PATCH(req: NextRequest) {
  try {
    const current = await requireAuth();
    const body = await req.json();
    const data = profileSchema.parse(body);

    const user = await prisma.user.findUnique({ where: { id: current.id } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    let nextEmail: string | undefined;
    if (data.email !== undefined) {
      const normalized = data.email.toLowerCase().trim();
      if (normalized !== user.email) {
        const conflict = await prisma.user.findUnique({ where: { email: normalized } });
        if (conflict) {
          return NextResponse.json(
            { error: "This email address is already in use." },
            { status: 409 }
          );
        }
        nextEmail = normalized;
      }
    }

    let passwordHash: string | undefined;
    if (data.newPassword) {
      if (!data.currentPassword || !user.passwordHash) {
        return NextResponse.json(
          { error: "Current password is required to set a new password." },
          { status: 400 }
        );
      }
      const valid = await verifyPassword(data.currentPassword, user.passwordHash);
      if (!valid) {
        return NextResponse.json({ error: "Current password is incorrect." }, { status: 400 });
      }
      passwordHash = await hashPassword(data.newPassword);
    }

    const updated = await prisma.user.update({
      where: { id: current.id },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(nextEmail !== undefined ? { email: nextEmail } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(passwordHash ? { passwordHash } : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        mealPreference: true,
        defaultMealQty: true,
      },
    });

    if (nextEmail !== undefined) {
      const token = await createSessionToken({
        userId: updated.id,
        role: updated.role,
        email: updated.email,
      });
      await setSessionCookie(token);
    }

    return NextResponse.json({ user: updated });
  } catch (error) {
    return handleApiError(error);
  }
}
