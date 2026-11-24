import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/services/auth.service";
import { logActivity } from "@/services/activity.service";
import { getSettings } from "@/services/schedule.service";
import { getNowInTimezone } from "@/lib/timezone";
import { handleApiError } from "@/lib/api-utils";
import { MealPreference, UserRole, UserStatus } from "@prisma/client";

const createGuestSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  email: z.string().email("Valid email is required"),
  phone: z.string().optional(),
  mealPreference: z.nativeEnum(MealPreference).default(MealPreference.REGULAR),
  defaultMealQty: z.number().int().min(0).default(1),
  mealStartDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid meal start date (YYYY-MM-DD)")
    .optional(),
});

export async function GET() {
  try {
    await requireAdmin();

    const guests = await prisma.user.findMany({
      where: { role: UserRole.GUEST },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        mealPreference: true,
        defaultMealQty: true,
        mealStartDate: true,
        joinedAt: true,
        createdAt: true,
        invitation: {
          select: {
            token: true,
            expiresAt: true,
            acceptedAt: true,
          },
        },
        invoices: {
          select: {
            totalAmountPoisha: true,
            paidAmountPoisha: true,
          },
        },
      },
    });

    const formatted = guests.map((g) => {
      const totalBilledPoisha = g.invoices.reduce((s, i) => s + i.totalAmountPoisha, 0);
      const totalPaidPoisha = g.invoices.reduce((s, i) => s + i.paidAmountPoisha, 0);
      return {
        ...g,
        totalBilledPoisha,
        totalPaidPoisha,
        outstandingPoisha: Math.max(0, totalBilledPoisha - totalPaidPoisha),
      };
    });

    return NextResponse.json({ guests: formatted });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await req.json();
    const data = createGuestSchema.parse(body);
    const email = data.email.toLowerCase().trim();

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "A user with this email already exists." }, { status: 409 });
    }

    const settings = await getSettings();
    const defaultStart = getNowInTimezone(settings.timezone).dateStr;
    const mealStartDate = data.mealStartDate || defaultStart;

    const token = crypto.randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14); // 14 days

    const result = await prisma.$transaction(async (tx) => {
      const guest = await tx.user.create({
        data: {
          name: data.name.trim(),
          email,
          phone: data.phone?.trim() || null,
          role: UserRole.GUEST,
          status: UserStatus.INVITED,
          mealPreference: data.mealPreference,
          defaultMealQty:
            data.mealPreference === MealPreference.OCCASIONAL ? 0 : data.defaultMealQty,
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
        actorId: admin.id,
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

    return NextResponse.json(
      {
        guest: result.guest,
        inviteToken: result.invitation.token,
        invitePath: `/invite/accept?token=${result.invitation.token}`,
      },
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
