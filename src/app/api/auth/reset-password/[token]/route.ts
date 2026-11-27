import { NextRequest, NextResponse } from "next/server";
import { verifyPasswordResetToken } from "@/services/password-reset.service";
import { handleApiError } from "@/lib/api-utils";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;
    const result = await verifyPasswordResetToken(token);

    if (!result.valid) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      valid: true,
      maskedEmail: result.maskedEmail,
      expiresAt: result.expiresAt,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
