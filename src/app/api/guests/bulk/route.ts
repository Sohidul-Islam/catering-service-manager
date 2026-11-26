import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/services/auth.service";
import { createAndInviteGuest, GuestAlreadyExistsError } from "@/services/guest.service";
import { parseBulkGuestInput, type InvalidBulkGuest } from "@/lib/guest-bulk-parser";
import { handleApiError } from "@/lib/api-utils";
import { MealPreference } from "@prisma/client";

const bulkCreateGuestsSchema = z.object({
  rawInput: z.string().min(1, "Please enter at least one guest email."),
  mealPreference: z.nativeEnum(MealPreference).default(MealPreference.REGULAR),
  defaultMealQty: z.number().int().min(0).default(1),
  mealStartDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid meal start date (YYYY-MM-DD)")
    .nullable()
    .optional()
    .or(z.literal("")),
});

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await req.json();
    const data = bulkCreateGuestsSchema.parse(body);

    const parsed = parseBulkGuestInput(data.rawInput);
    if (parsed.valid.length === 0 && parsed.invalid.length === 0) {
      return NextResponse.json(
        { error: "Please enter at least one guest email." },
        { status: 400 }
      );
    }

    const origin =
      req.nextUrl.origin || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";
    const mealStartDate = data.mealStartDate ? data.mealStartDate.trim() || null : null;

    const created: {
      id: string;
      name: string;
      email: string;
      invitePath: string;
      emailSent: boolean;
      emailError?: string;
    }[] = [];

    const failed: InvalidBulkGuest[] = [...parsed.invalid];

    for (const entry of parsed.valid) {
      try {
        const res = await createAndInviteGuest({
          name: entry.name,
          email: entry.email,
          mealPreference: data.mealPreference,
          defaultMealQty: data.defaultMealQty,
          mealStartDate,
          actorId: admin.id,
          origin,
        });

        created.push({
          id: res.guest.id,
          name: res.guest.name,
          email: res.guest.email,
          invitePath: res.invitePath,
          emailSent: res.emailSent,
          emailError: res.emailError,
        });
      } catch (err) {
        failed.push({
          raw: entry.raw,
          email: entry.email,
          reason:
            err instanceof GuestAlreadyExistsError
              ? "A user with this email already exists"
              : err instanceof Error
              ? err.message
              : "Failed to create guest",
        });
      }
    }

    return NextResponse.json(
      {
        created,
        failed,
      },
      { status: created.length > 0 ? 201 : 200 }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
