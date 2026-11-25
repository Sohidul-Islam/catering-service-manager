import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { ensureMonthSchedule, syncGuestMonthSchedule } from "../src/services/schedule.service";
import {
  updateMealQuantity,
  submitAdjustmentRequest,
  reviewAdjustmentRequest,
  MealServiceError,
} from "../src/services/meal.service";
import { generateMonthlyInvoices, recalculateInvoiceFromMeals } from "../src/services/invoice.service";
import { recordPayment, PaymentServiceError } from "../src/services/payment.service";
import {
  generatePublicInvoiceToken,
  getPublicInvoiceByToken,
  regeneratePublicInvoiceToken,
  revokePublicInvoiceToken,
} from "../src/services/public-invoice.service";
import { previewInvoiceEmail, previewMealConfirmation } from "../src/services/notification.service";
import { isPastMealDeadline } from "../src/lib/timezone";
import { hashPassword } from "../src/services/auth.service";
import {
  HolidayType,
  InvoiceStatus,
  MealPreference,
  MealSource,
  PaymentMethod,
  PaymentType,
  UserRole,
  UserStatus,
} from "@prisma/client";

async function run() {
  console.log("Running Office Meal Management verification suite...");

  // Use an isolated future test month 2028-03 so it never collides with current month seed data
  const TEST_YEAR = 2028;
  const TEST_MONTH = 3;
  // March 2028: Mar 1 (Wed), Mar 2 (Thu), Mar 3 (Fri), Mar 4 (Sat - weekend), Mar 5 (Sun - weekend), Mar 6 (Mon)...

  // Clean up previous test artifacts if any
  await prisma.user.deleteMany({
    where: { email: { in: ["verify-reg@office.com", "verify-occ@office.com", "verify-admin@office.com"] } },
  });
  await prisma.holiday.deleteMany({
    where: { date: { startsWith: "2028-03-" } },
  });
  await prisma.mealPrice.deleteMany({
    where: { date: { startsWith: "2028-03-" } },
  });
  await prisma.monthlyMealSchedule.deleteMany({
    where: { year: TEST_YEAR, month: TEST_MONTH },
  });

  // 1. Admin & Guest creation + invite acceptance
  const admin = await prisma.user.create({
    data: {
      name: "Verify Admin",
      email: "verify-admin@office.com",
      passwordHash: await hashPassword("secret123"),
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    },
  });

  const regGuest = await prisma.user.create({
    data: {
      name: "Verify Regular",
      email: "verify-reg@office.com",
      role: UserRole.GUEST,
      status: UserStatus.INVITED,
      mealPreference: MealPreference.REGULAR,
      defaultMealQty: 1,
    },
  });

  const occGuest = await prisma.user.create({
    data: {
      name: "Verify Occasional",
      email: "verify-occ@office.com",
      passwordHash: await hashPassword("secret123"),
      role: UserRole.GUEST,
      status: UserStatus.ACTIVE,
      mealPreference: MealPreference.OCCASIONAL,
      defaultMealQty: 0,
    },
  });

  // Accept invite for regGuest
  await prisma.user.update({
    where: { id: regGuest.id },
    data: { status: UserStatus.ACTIVE, passwordHash: await hashPassword("secret123") },
  });

  // 2. Configure holiday (2028-03-02 Thu) and special working day (2028-03-04 Sat) and custom price (2028-03-03 = ৳100)
  await prisma.holiday.create({
    data: {
      date: "2028-03-02",
      name: "Test Holiday",
      type: HolidayType.HOLIDAY,
      allowMeals: false,
    },
  });
  await prisma.holiday.create({
    data: {
      date: "2028-03-04",
      name: "Special Saturday",
      type: HolidayType.SPECIAL_WORKING_DAY,
      allowMeals: true,
    },
  });
  await prisma.mealPrice.create({
    data: {
      date: "2028-03-03",
      pricePoisha: 10000, // ৳100
      createdById: admin.id,
    },
  });

  // 3. Monthly schedule generation & idempotency
  const gen1 = await ensureMonthSchedule(TEST_YEAR, TEST_MONTH, admin.id);
  assert.ok(gen1.createdCount > 0, "Should create schedule records");

  // Customize 2028-03-01 to 2 meals for regGuest before re-running generation
  // 2028-02-29 at 20:00 Asia/Dhaka = 14:00 UTC -> before 23:50 deadline!
  const beforeDeadline = new Date("2028-02-29T14:00:00Z");
  assert.equal(
    isPastMealDeadline("2028-03-01", 23, 50, "Asia/Dhaka", beforeDeadline),
    false,
    "20:00 Dhaka on Feb 29 should be before 23:50 deadline for Mar 1"
  );

  await updateMealQuantity({
    actorId: regGuest.id,
    actorRole: UserRole.GUEST,
    targetUserId: regGuest.id,
    date: "2028-03-01",
    quantity: 2,
    now: beforeDeadline,
  });

  // Re-run schedule generation -> must be idempotent and NOT overwrite customized 2 meals
  const gen2 = await ensureMonthSchedule(TEST_YEAR, TEST_MONTH, admin.id);
  assert.equal(gen2.createdCount, 0, "Re-running schedule generation must not create duplicates");

  const mar1Reg = await prisma.mealRecord.findUnique({
    where: { userId_date: { userId: regGuest.id, date: "2028-03-01" } },
  });
  assert.equal(mar1Reg?.quantity, 2, "Customized meal selection must be preserved");

  // Occasional guest starts with 0
  const mar1Occ = await prisma.mealRecord.findUnique({
    where: { userId_date: { userId: occGuest.id, date: "2028-03-01" } },
  });
  assert.equal(mar1Occ?.quantity, 0, "Occasional guest should start with 0 meals");

  // Holiday has 0, Special Saturday has 1 for regular guest
  const mar2Reg = await prisma.mealRecord.findUnique({
    where: { userId_date: { userId: regGuest.id, date: "2028-03-02" } },
  });
  assert.equal(mar2Reg?.quantity, 0, "Holiday must have 0 meals");

  const mar4Reg = await prisma.mealRecord.findUnique({
    where: { userId_date: { userId: regGuest.id, date: "2028-03-04" } },
  });
  assert.equal(mar4Reg?.quantity, 1, "Special working day must schedule default qty for regular guest");

  // 4. Deadline enforcement (2028-02-29 23:55 Asia/Dhaka = 17:55 UTC)
  const afterDeadline = new Date("2028-02-29T17:55:00Z");
  assert.equal(
    isPastMealDeadline("2028-03-01", 23, 50, "Asia/Dhaka", afterDeadline),
    true,
    "23:55 Dhaka on Feb 29 should be past 23:50 deadline for Mar 1"
  );

  await assert.rejects(
    () =>
      updateMealQuantity({
        actorId: regGuest.id,
        actorRole: UserRole.GUEST,
        targetUserId: regGuest.id,
        date: "2028-03-01",
        quantity: 3,
        now: afterDeadline,
      }),
    MealServiceError,
    "Guest must be blocked after 23:50 deadline"
  );

  // Guest cannot modify another guest's meal
  await assert.rejects(
    () =>
      updateMealQuantity({
        actorId: occGuest.id,
        actorRole: UserRole.GUEST,
        targetUserId: regGuest.id,
        date: "2028-03-06",
        quantity: 1,
        now: beforeDeadline,
      }),
    MealServiceError,
    "Guest must never modify another guest's meal"
  );

  // Admin can override locked meal
  await updateMealQuantity({
    actorId: admin.id,
    actorRole: UserRole.ADMIN,
    targetUserId: occGuest.id,
    date: "2028-03-01",
    quantity: 1,
    reason: "Admin override test",
    now: afterDeadline,
  });

  // 5. Late adjustment request submission & approval
  const adj = await submitAdjustmentRequest({
    userId: occGuest.id,
    date: "2028-03-03",
    requestedQuantity: 2,
    reason: "Client visit",
  });
  await reviewAdjustmentRequest({
    requestId: adj.id,
    reviewerId: admin.id,
    decision: "APPROVED",
    reviewNote: "Approved",
  });
  const mar3Occ = await prisma.mealRecord.findUnique({
    where: { userId_date: { userId: occGuest.id, date: "2028-03-03" } },
  });
  assert.equal(mar3Occ?.quantity, 2, "Approved adjustment request must update meal quantity");
  assert.equal(mar3Occ?.unitPricePoisha, 10000, "2028-03-03 should use custom ৳100 price");

  // 6. Monthly invoice generation & historical price immutability
  await generateMonthlyInvoices(TEST_YEAR, TEST_MONTH, admin.id);
  const occInvoice = await prisma.invoice.findUnique({
    where: { userId_year_month: { userId: occGuest.id, year: TEST_YEAR, month: TEST_MONTH } },
    include: { items: { orderBy: { date: "asc" } } },
  });
  assert.ok(occInvoice, "Invoice should be generated for occGuest");
  // occGuest has: Mar 1 (1 * 120 = 120) + Mar 3 (2 * 100 = 200) = 320 BDT (32000 poisha)
  assert.equal(occInvoice.totalMeals, 3);
  assert.equal(occInvoice.totalAmountPoisha, 32000);
  assert.equal(occInvoice.status, InvoiceStatus.UNPAID);

  // 7. Partial & Selected-Date Payments + overpayment / duplicate allocation prevention
  const mar1Item = occInvoice.items.find((i) => i.date === "2028-03-01")!;
  const mar3Item = occInvoice.items.find((i) => i.date === "2028-03-03")!;

  // Selected-date payment for Mar 1 (12000 poisha)
  const selPay = await recordPayment({
    invoiceId: occInvoice.id,
    recordedById: admin.id,
    paymentType: PaymentType.SELECTED_DATES,
    method: PaymentMethod.CASH,
    invoiceItemIds: [mar1Item.id],
  });
  assert.equal(selPay.invoice.paidAmountPoisha, 12000);
  assert.equal(selPay.invoice.status, InvoiceStatus.PARTIALLY_PAID);

  // Duplicate selected-date allocation must fail
  await assert.rejects(
    () =>
      recordPayment({
        invoiceId: occInvoice.id,
        recordedById: admin.id,
        paymentType: PaymentType.SELECTED_DATES,
        method: PaymentMethod.CASH,
        invoiceItemIds: [mar1Item.id],
      }),
    PaymentServiceError,
    "Duplicate selected-date allocation must be prevented"
  );

  // Overpayment must fail
  await assert.rejects(
    () =>
      recordPayment({
        invoiceId: occInvoice.id,
        recordedById: admin.id,
        paymentType: PaymentType.PARTIAL,
        method: PaymentMethod.BANK_TRANSFER,
        amountPoisha: 25000, // remaining is 20000
      }),
    PaymentServiceError,
    "Overpayment beyond outstanding balance must be prevented"
  );

  // Pay remaining Mar 3 date -> invoice becomes PAID
  const finalPay = await recordPayment({
    invoiceId: occInvoice.id,
    recordedById: admin.id,
    paymentType: PaymentType.SELECTED_DATES,
    method: PaymentMethod.BANK_TRANSFER,
    invoiceItemIds: [mar3Item.id],
  });
  assert.equal(finalPay.invoice.paidAmountPoisha, 32000);
  assert.equal(finalPay.invoice.status, InvoiceStatus.PAID);

  // 8. Public Invoice Token generation, sanitization, revocation, regeneration
  const pubTok1 = await generatePublicInvoiceToken(occInvoice.id, admin.id);
  assert.ok(pubTok1.token.length >= 32, "Public token must be cryptographically random");

  const pubView1 = await getPublicInvoiceByToken(pubTok1.token);
  assert.ok(pubView1, "Public invoice should resolve by valid token");
  assert.equal(pubView1.invoiceNumber, occInvoice.invoiceNumber);
  assert.equal(pubView1.paidAmountPoisha, 32000);
  assert.equal("id" in pubView1, false, "Public invoice must not expose internal DB IDs");

  const pubTok2 = await regeneratePublicInvoiceToken(occInvoice.id, admin.id);
  assert.notEqual(pubTok2.token, pubTok1.token, "Regenerated token must differ");
  assert.equal(await getPublicInvoiceByToken(pubTok1.token), null, "Old token must be invalidated");
  assert.ok(await getPublicInvoiceByToken(pubTok2.token), "New token must resolve");

  await revokePublicInvoiceToken(occInvoice.id, admin.id);
  assert.equal(await getPublicInvoiceByToken(pubTok2.token), null, "Revoked token must return null");

  // 9. Controlled invoice recalculation after admin meal adjustment
  const adjRes = await updateMealQuantity({
    actorId: admin.id,
    actorRole: UserRole.ADMIN,
    targetUserId: occGuest.id,
    date: "2028-03-06",
    quantity: 1,
    reason: "Extra meal after invoice",
    now: afterDeadline,
  });
  assert.ok(adjRes.affectedInvoice, "Admin update on invoiced month should report affectedInvoice");
  assert.equal(adjRes.affectedInvoice!.currentTotalPoisha, 32000);
  assert.equal(adjRes.affectedInvoice!.projectedTotalPoisha, 44000);

  // Invoice total must stay 32000 until admin explicitly recalculates
  const unchangedInv = await prisma.invoice.findUnique({ where: { id: occInvoice.id } });
  assert.equal(unchangedInv?.totalAmountPoisha, 32000, "Invoice must not silently mutate");

  const recalcInv = await recalculateInvoiceFromMeals(occInvoice.id, admin.id);
  assert.equal(recalcInv?.totalAmountPoisha, 44000, "Explicit recalculation must update total");
  assert.equal(recalcInv?.paidAmountPoisha, 32000, "Existing payments must be preserved");
  assert.equal(recalcInv?.status, InvoiceStatus.PARTIALLY_PAID);

  // 10. Email template previews
  const mealPrev = await previewMealConfirmation({
    guestId: regGuest.id,
    date: "2028-03-01",
  });
  assert.ok(mealPrev.subject.includes("Meal Confirmation"));
  assert.ok(mealPrev.text.includes("Verify Regular"));

  const invPrev = await previewInvoiceEmail({
    invoiceId: occInvoice.id,
    actorId: admin.id,
    ensurePublicToken: true,
  });
  assert.ok(invPrev.publicUrl?.includes("/invoice/"));
  assert.ok(invPrev.text.includes(occInvoice.invoiceNumber));

  // 11. Guest Meal Start Date & "This meal only" vs "This and following meals" recurrence
  const lateStarter = await prisma.user.create({
    data: {
      name: "Verify Late Starter",
      email: "verify-latestart@office.com",
      passwordHash: await hashPassword("secret123"),
      role: UserRole.GUEST,
      status: UserStatus.ACTIVE,
      mealPreference: MealPreference.REGULAR,
      defaultMealQty: 1,
      mealStartDate: "2028-04-17",
    },
  });

  // Generating March 2028 must create ZERO records for lateStarter (starts April 17)
  await ensureMonthSchedule(2028, 3, admin.id);
  const marchCount = await prisma.mealRecord.count({
    where: { userId: lateStarter.id, date: { startsWith: "2028-03-" } },
  });
  assert.equal(marchCount, 0, "Guest starting next month must have 0 records in current month");

  // Generating April 2028 must create ZERO records before 2028-04-17
  await ensureMonthSchedule(2028, 4, admin.id);
  const aprBeforeStart = await prisma.mealRecord.count({
    where: { userId: lateStarter.id, date: { gte: "2028-04-01", lt: "2028-04-17" } },
  });
  assert.equal(aprBeforeStart, 0, "No meal records allowed before mealStartDate");

  const apr17 = await prisma.mealRecord.findUnique({
    where: { userId_date: { userId: lateStarter.id, date: "2028-04-17" } },
  });
  assert.equal(apr17?.quantity, 1, "Start date working day must have default 1 meal");

  // Change 2028-04-18 to 2 meals (This meal only)
  const beforeApr = new Date("2028-04-10T10:00:00Z");
  await updateMealQuantity({
    actorId: lateStarter.id,
    actorRole: UserRole.GUEST,
    targetUserId: lateStarter.id,
    date: "2028-04-18",
    quantity: 2,
    scope: "SINGLE_DATE",
    now: beforeApr,
  });

  const apr19AfterSingle = await prisma.mealRecord.findUnique({
    where: { userId_date: { userId: lateStarter.id, date: "2028-04-19" } },
  });
  assert.equal(apr19AfterSingle?.quantity, 1, "SINGLE_DATE must not alter following dates");

  // Change 2028-04-20 to 3 meals (This and following meals)
  await updateMealQuantity({
    actorId: lateStarter.id,
    actorRole: UserRole.GUEST,
    targetUserId: lateStarter.id,
    date: "2028-04-20",
    quantity: 3,
    scope: "FOLLOWING_DATES",
    now: beforeApr,
  });

  const [r17, r18, r19, r20, r21, r22, r24] = await Promise.all([
    prisma.mealRecord.findUnique({ where: { userId_date: { userId: lateStarter.id, date: "2028-04-17" } } }),
    prisma.mealRecord.findUnique({ where: { userId_date: { userId: lateStarter.id, date: "2028-04-18" } } }),
    prisma.mealRecord.findUnique({ where: { userId_date: { userId: lateStarter.id, date: "2028-04-19" } } }),
    prisma.mealRecord.findUnique({ where: { userId_date: { userId: lateStarter.id, date: "2028-04-20" } } }),
    prisma.mealRecord.findUnique({ where: { userId_date: { userId: lateStarter.id, date: "2028-04-21" } } }),
    prisma.mealRecord.findUnique({ where: { userId_date: { userId: lateStarter.id, date: "2028-04-22" } } }), // Sat weekend
    prisma.mealRecord.findUnique({ where: { userId_date: { userId: lateStarter.id, date: "2028-04-24" } } }), // Mon
  ]);
  assert.equal(r17?.quantity, 1, "Earlier date stays 1");
  assert.equal(r18?.quantity, 2, "Earlier single override stays 2");
  assert.equal(r19?.quantity, 1, "Earlier date before effectiveFrom stays 1");
  assert.equal(r20?.quantity, 3, "Effective date becomes 3");
  assert.equal(r21?.quantity, 3, "Future working day becomes 3");
  assert.equal(r22?.quantity, 0, "Weekend stays 0");
  assert.equal(r24?.quantity, 3, "Next week working day becomes 3");

  // Generating May 2028 must carry forward the FOLLOWING_DATES rule (3 meals on working days)
  await ensureMonthSchedule(2028, 5, admin.id);
  const may1 = await prisma.mealRecord.findUnique({
    where: { userId_date: { userId: lateStarter.id, date: "2028-05-01" } },
  });
  assert.equal(may1?.quantity, 3, "Next month working day must inherit FOLLOWING_RULE (3 meals)");

  // 12. Admin historical meal overrides before mealStartDate (and guest rejection)
  await assert.rejects(
    () =>
      updateMealQuantity({
        actorId: lateStarter.id,
        actorRole: UserRole.GUEST,
        targetUserId: lateStarter.id,
        date: "2028-04-03",
        quantity: 1,
        now: beforeApr,
      }),
    MealServiceError,
    "Guest must be blocked from modifying meals before mealStartDate"
  );

  await assert.rejects(
    () =>
      submitAdjustmentRequest({
        userId: lateStarter.id,
        date: "2028-04-03",
        requestedQuantity: 1,
        reason: "Historical request should fail for guest",
      }),
    MealServiceError,
    "Guest must be blocked from submitting adjustment requests before mealStartDate"
  );

  await updateMealQuantity({
    actorId: admin.id,
    actorRole: UserRole.ADMIN,
    targetUserId: lateStarter.id,
    date: "2028-04-03",
    quantity: 2,
    scope: "SINGLE_DATE",
    reason: "Admin adding old record",
    now: beforeApr,
  });

  const apr03 = await prisma.mealRecord.findUnique({
    where: { userId_date: { userId: lateStarter.id, date: "2028-04-03" } },
  });
  assert.equal(apr03?.quantity, 2, "Admin should be able to add historical record before mealStartDate");
  assert.equal(apr03?.source, MealSource.ADMIN_OVERRIDE);

  const apr04BeforeSync = await prisma.mealRecord.findUnique({
    where: { userId_date: { userId: lateStarter.id, date: "2028-04-04" } },
  });
  assert.equal(apr04BeforeSync, null, "Other pre-start dates must remain unscheduled");

  await ensureMonthSchedule(2028, 4, admin.id, true);
  const [apr03AfterSync, apr04AfterSync] = await Promise.all([
    prisma.mealRecord.findUnique({
      where: { userId_date: { userId: lateStarter.id, date: "2028-04-03" } },
    }),
    prisma.mealRecord.findUnique({
      where: { userId_date: { userId: lateStarter.id, date: "2028-04-04" } },
    }),
  ]);
  assert.equal(apr03AfterSync?.quantity, 2, "Re-syncing schedule must preserve admin historical record");
  assert.equal(apr04AfterSync, null, "Re-syncing schedule must still not auto-create untouched pre-start dates");

  await updateMealQuantity({
    actorId: admin.id,
    actorRole: UserRole.ADMIN,
    targetUserId: lateStarter.id,
    date: "2028-04-12",
    quantity: 1,
    scope: "FOLLOWING_DATES",
    reason: "Admin historical following rule",
    now: beforeApr,
  });

  const [apr03Final, apr12, apr13, apr15] = await Promise.all([
    prisma.mealRecord.findUnique({ where: { userId_date: { userId: lateStarter.id, date: "2028-04-03" } } }),
    prisma.mealRecord.findUnique({ where: { userId_date: { userId: lateStarter.id, date: "2028-04-12" } } }),
    prisma.mealRecord.findUnique({ where: { userId_date: { userId: lateStarter.id, date: "2028-04-13" } } }),
    prisma.mealRecord.findUnique({ where: { userId_date: { userId: lateStarter.id, date: "2028-04-15" } } }),
  ]);
  assert.equal(apr03Final?.quantity, 2, "Earlier historical record must remain 2");
  assert.equal(apr12?.quantity, 1, "Pre-start target date becomes 1");
  assert.equal(apr13?.quantity, 1, "Pre-start following working day gets created with 1");
  assert.equal(apr15, null, "Pre-start weekend must be skipped by historical FOLLOWING_DATES");

  await generateMonthlyInvoices(2028, 4, admin.id);
  const aprInvoice = await prisma.invoice.findUnique({
    where: { userId_year_month: { userId: lateStarter.id, year: 2028, month: 4 } },
    include: { items: true },
  });
  assert.ok(aprInvoice, "April invoice should be generated for lateStarter");
  const apr03Item = aprInvoice.items.find((i) => i.date === "2028-04-03");
  assert.equal(apr03Item?.quantity, 2, "April invoice must include admin-added historical 2028-04-03 meal record");

  // Clean up test data
  await prisma.emailLog.deleteMany({
    where: { guestId: { in: [regGuest.id, occGuest.id] } },
  });
  await prisma.user.deleteMany({
    where: {
      email: {
        in: [
          "verify-reg@office.com",
          "verify-occ@office.com",
          "verify-admin@office.com",
          "verify-latestart@office.com",
        ],
      },
    },
  });
  await prisma.holiday.deleteMany({ where: { date: { startsWith: "2028-03-" } } });
  await prisma.mealPrice.deleteMany({ where: { date: { startsWith: "2028-03-" } } });
  await prisma.monthlyMealSchedule.deleteMany({
    where: { year: TEST_YEAR, month: { in: [3, 4, 5] } },
  });

  // Also test syncGuestMonthSchedule returns cleanly for non-existent user
  const synced = await syncGuestMonthSchedule("non-existent", TEST_YEAR, TEST_MONTH);
  assert.equal(synced, 0);

  console.log("ALL VERIFICATION CHECKS PASSED!");
}

run()
  .catch((err) => {
    console.error("Verification failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
