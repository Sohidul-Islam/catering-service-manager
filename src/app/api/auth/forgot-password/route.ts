import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createAndSendPasswordReset } from "@/services/password-reset.service";
import { handleApiError } from "@/lib/api-utils";
import { UserStatus } from "@prisma/client";

const forgotPasswordSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email } = forgotPasswordSchema.parse(body);
    const normalizedEmail = email.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: { id: true, status: true },
    });

    if (user && user.status === UserStatus.ACTIVE) {
      const origin = (
        req.nextUrl.origin ||
        process.env.NEXT_PUBLIC_APP_URL ||
        "http://localhost:3001"
      ).replace(/\/$/, "");

      await createAndSendPasswordReset({
        userId: user.id,
        origin,
      });
    }

    return NextResponse.json({
      message:
        "If an active account exists for that email, a password reset link has been sent.",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
