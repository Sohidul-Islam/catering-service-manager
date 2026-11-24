import { MealPreference, PrismaClient, UserRole, UserStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminEmail = (process.env.INITIAL_ADMIN_EMAIL || "admin@office.com")
    .toLowerCase()
    .trim();
  const adminPassword = process.env.INITIAL_ADMIN_PASSWORD || "admin123";
  const adminName = process.env.INITIAL_ADMIN_NAME || "System Admin";

  console.log("Resetting database to fresh state (admin-only)...");

  await prisma.$transaction(async (tx) => {
    await tx.emailLog.deleteMany({});
    await tx.publicInvoiceToken.deleteMany({});
    await tx.paymentAllocation.deleteMany({});
    await tx.payment.deleteMany({});
    await tx.invoiceItem.deleteMany({});
    await tx.invoice.deleteMany({});
    await tx.mealAdjustmentRequest.deleteMany({});
    await tx.mealRuleHistory.deleteMany({});
    await tx.mealRecord.deleteMany({});
    await tx.monthlyMealSchedule.deleteMany({});
    await tx.mealPrice.deleteMany({});
    await tx.holiday.deleteMany({});
    await tx.activityLog.deleteMany({});
    await tx.invitation.deleteMany({});
    await tx.user.deleteMany({});

    await tx.organizationSettings.upsert({
      where: { id: "default" },
      update: {
        organizationName: "Office Meal Management",
        timezone: "Asia/Dhaka",
        defaultMealPricePoisha: 12000,
        deadlineHour: 23,
        deadlineMinute: 50,
        maxMealQty: null,
        weekendDays: "6,0",
      },
      create: {
        id: "default",
        organizationName: "Office Meal Management",
        timezone: "Asia/Dhaka",
        defaultMealPricePoisha: 12000,
        deadlineHour: 23,
        deadlineMinute: 50,
        weekendDays: "6,0",
      },
    });

    const passwordHash = await bcrypt.hash(adminPassword, 10);
    await tx.user.create({
      data: {
        name: adminName,
        email: adminEmail,
        passwordHash,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        mealPreference: MealPreference.REGULAR,
        defaultMealQty: 0,
      },
    });
  });

  console.log(`Fresh reset complete.`);
  console.log(`Initial Admin Email: ${adminEmail}`);
  console.log(`Initial Admin Password: ${adminPassword}`);
  console.log(`Please sign in and change these credentials in Admin -> Settings.`);
}

main()
  .catch((err) => {
    console.error("Fresh reset failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
