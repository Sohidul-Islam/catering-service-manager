import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthError } from "@/services/auth.service";
import { MealServiceError } from "@/services/meal.service";
import { PaymentServiceError } from "@/services/payment.service";
import { NotificationError } from "@/services/notification.service";

export function handleApiError(error: unknown) {
  if (
    error instanceof AuthError ||
    error instanceof MealServiceError ||
    error instanceof PaymentServiceError ||
    error instanceof NotificationError
  ) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: error.issues[0]?.message ?? "Validation failed", issues: error.issues },
      { status: 400 }
    );
  }
  console.error("API Error:", error);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
