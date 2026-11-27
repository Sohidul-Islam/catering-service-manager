import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { clearSessionCookie } from "@/services/auth.service";
import { completePasswordReset } from "@/services/password-reset.service";
import { passwordWithConfirmationSchema } from "@/lib/password-validation";
import { handleApiError } from "@/lib/api-utils";

const resetPasswordSchema = passwordWithConfirmationSchema.and(
  z.object({
    token: z.string().min(1, "Reset token is required"),
  })
);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, password } = resetPasswordSchema.parse(body);

    await completePasswordReset({
      rawToken: token,
      newPassword: password,
    });

    await clearSessionCookie();

    return NextResponse.json({
      success: true,
      message:
        "Your password has been reset successfully. You can now sign in with your new password.",
    });
  } catch (error) {
    return handleApiError(error);
  }
}
