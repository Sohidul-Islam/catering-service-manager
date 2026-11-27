import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/services/auth.service";
import { adminChangeGuestPassword } from "@/services/password-reset.service";
import { passwordWithConfirmationSchema } from "@/lib/password-validation";
import { handleApiError } from "@/lib/api-utils";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin();
    const { id } = await context.params;
    const body = await req.json();
    const { password } = passwordWithConfirmationSchema.parse(body);

    const updated = await adminChangeGuestPassword({
      guestId: id,
      newPassword: password,
      adminId: admin.id,
    });

    return NextResponse.json({
      success: true,
      message: `Password updated for ${updated.name}.`,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
