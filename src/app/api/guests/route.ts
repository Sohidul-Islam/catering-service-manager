import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/services/auth.service";
import { createAndInviteGuest, GuestAlreadyExistsError } from "@/services/guest.service";
import { handleApiError } from "@/lib/api-utils";
import { MealPreference, UserRole } from "@prisma/client";

const createGuestSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  email: z.string().email("Valid email is required"),
  phone: z.string().optional(),
  mealPreference: z.nativeEnum(MealPreference).default(MealPreference.REGULAR),
  defaultMealQty: z.number().int().min(0).default(1),
  mealStartDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid meal start date (YYYY-MM-DD)")
    .nullable()
    .optional()
    .or(z.literal("")),
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

    const origin =
      req.nextUrl.origin || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";

    const result = await createAndInviteGuest({
      name: data.name,
      email: data.email,
      phone: data.phone,
      mealPreference: data.mealPreference,
      defaultMealQty: data.defaultMealQty,
      mealStartDate: data.mealStartDate || null,
      actorId: admin.id,
      origin,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof GuestAlreadyExistsError) {
      return NextResponse.json({ error: "A user with this email already exists." }, { status: 409 });
    }
    return handleApiError(error);
  }
}
