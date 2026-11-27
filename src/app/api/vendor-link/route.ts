import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/services/auth.service";
import {
  buildVendorShareUrl,
  getOrCreateCurrentVendorToken,
  regenerateCurrentVendorToken,
  VendorShareError,
} from "@/services/vendor-share.service";
import { handleApiError } from "@/lib/api-utils";

export async function GET(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const record = await getOrCreateCurrentVendorToken(admin.id);
    const origin =
      req.nextUrl.origin || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";

    return NextResponse.json({
      token: record.token,
      year: record.year,
      month: record.month,
      url: buildVendorShareUrl(record.token, origin),
    });
  } catch (error) {
    if (error instanceof VendorShareError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return handleApiError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin();
    const record = await regenerateCurrentVendorToken(admin.id);
    const origin =
      req.nextUrl.origin || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3001";

    return NextResponse.json({
      token: record.token,
      year: record.year,
      month: record.month,
      url: buildVendorShareUrl(record.token, origin),
    });
  } catch (error) {
    if (error instanceof VendorShareError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return handleApiError(error);
  }
}
