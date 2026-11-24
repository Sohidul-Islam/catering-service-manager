import { NextRequest, NextResponse } from "next/server";
import { getPublicInvoiceByToken } from "@/services/public-invoice.service";

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  const { token } = await context.params;
  if (!token || token.length < 16) {
    return NextResponse.json({ error: "Invalid public invoice link." }, { status: 404 });
  }

  const invoice = await getPublicInvoiceByToken(token);
  if (!invoice) {
    return NextResponse.json(
      { error: "This public invoice link is invalid or has been revoked." },
      { status: 404 }
    );
  }

  return NextResponse.json({ invoice });
}
