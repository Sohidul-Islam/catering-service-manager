import { PrismaClient, MealPreference, UserRole, UserStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminEmail = (process.env.INITIAL_ADMIN_EMAIL || "admin@office.com")
    .toLowerCase()
    .trim();
  const adminPassword = process.env.INITIAL_ADMIN_PASSWORD || "admin123";
  const adminName = process.env.INITIAL_ADMIN_NAME || "System Admin";

  await prisma.organizationSettings.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      organizationName: "Office Meal Management",
      timezone: "Asia/Dhaka",
      defaultMealPricePoisha: 12000, // ৳120
      deadlineHour: 23,
      deadlineMinute: 50,
      weekendDays: "6,0",
    },
  });

  const adminPasswordHash = await bcrypt.hash(adminPassword, 10);

  const existingAdmin = await prisma.user.findFirst({
    where: { role: UserRole.ADMIN },
  });

  if (!existingAdmin) {
    await prisma.user.create({
      data: {
        name: adminName,
        email: adminEmail,
        passwordHash: adminPasswordHash,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        mealPreference: MealPreference.REGULAR,
        defaultMealQty: 0,
      },
    });
  }

  console.log(`Seed completed. Admin ready: ${existingAdmin?.email ?? adminEmail}`);
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
