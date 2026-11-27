import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/services/auth.service";
import { createAndInviteGuest, GuestAlreadyExistsError } from "@/services/guest.service";
import { handleApiError } from "@/lib/api-utils";
import { MealPreference, Prisma, UserRole, UserStatus } from "@prisma/client";

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

export async function GET(req: NextRequest) {
  try {
    await requireAdmin();

    const url = new URL(req.url);
    const search = url.searchParams.get("search")?.trim() || "";
    const statusParam = url.searchParams.get("status");
    const preferenceParam = url.searchParams.get("preference");
    const pageParam = url.searchParams.get("page");
    const pageSizeParam = url.searchParams.get("pageSize");

    const status =
      statusParam && Object.values(UserStatus).includes(statusParam as UserStatus)
        ? (statusParam as UserStatus)
        : undefined;
    const preference =
      preferenceParam &&
      Object.values(MealPreference).includes(preferenceParam as MealPreference)
        ? (preferenceParam as MealPreference)
        : undefined;

    const where: Prisma.UserWhereInput = {
      role: UserRole.GUEST,
      ...(status ? { status } : {}),
      ...(preference ? { mealPreference: preference } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search } },
              { email: { contains: search } },
              { phone: { contains: search } },
            ],
          }
        : {}),
    };

    const guestSelect = {
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
    } satisfies Prisma.UserSelect;

    const formatGuests = (
      rows: Prisma.UserGetPayload<{ select: typeof guestSelect }>[]
    ) =>
      rows.map((g) => {
        const totalBilledPoisha = g.invoices.reduce((s, i) => s + i.totalAmountPoisha, 0);
        const totalPaidPoisha = g.invoices.reduce((s, i) => s + i.paidAmountPoisha, 0);
        return {
          ...g,
          totalBilledPoisha,
          totalPaidPoisha,
          outstandingPoisha: Math.max(0, totalBilledPoisha - totalPaidPoisha),
        };
      });

    if (pageParam !== null) {
      const pageSize = Math.min(100, Math.max(1, parseInt(pageSizeParam ?? "20", 10) || 20));
      const requestedPage = Math.max(1, parseInt(pageParam, 10) || 1);
      const total = await prisma.user.count({ where });
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const page = Math.min(requestedPage, totalPages);

      const guests = await prisma.user.findMany({
        where,
        orderBy: { name: "asc" },
        select: guestSelect,
        skip: (page - 1) * pageSize,
        take: pageSize,
      });

      return NextResponse.json({
        guests: formatGuests(guests),
        pagination: { page, pageSize, total, totalPages },
      });
    }

    const guests = await prisma.user.findMany({
      where,
      orderBy: { name: "asc" },
      select: guestSelect,
    });

    return NextResponse.json({ guests: formatGuests(guests) });
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
