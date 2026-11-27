import { NextRequest, NextResponse } from "next/server";
import {
  getPublicVendorMealSummary,
  VendorShareError,
} from "@/services/vendor-share.service";
import { handleApiError } from "@/lib/api-utils";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;
    const summary = await getPublicVendorMealSummary(token);
    return NextResponse.json(summary, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error) {
    if (error instanceof VendorShareError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return handleApiError(error);
  }
}
