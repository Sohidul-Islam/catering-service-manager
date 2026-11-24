-- AlterTable
ALTER TABLE "User" ADD COLUMN "mealStartDate" TEXT;

-- CreateTable
CREATE TABLE "MealRuleHistory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "effectiveFrom" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "scope" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "changedById" TEXT,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MealRuleHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MealRuleHistory_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MealRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "unitPricePoisha" INTEGER NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'DEFAULT',
    "overrideScope" TEXT,
    "isCustomized" BOOLEAN NOT NULL DEFAULT false,
    "isFinalized" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MealRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_MealRecord" ("createdAt", "date", "id", "isCustomized", "isFinalized", "quantity", "unitPricePoisha", "updatedAt", "userId") SELECT "createdAt", "date", "id", "isCustomized", "isFinalized", "quantity", "unitPricePoisha", "updatedAt", "userId" FROM "MealRecord";
DROP TABLE "MealRecord";
ALTER TABLE "new_MealRecord" RENAME TO "MealRecord";
CREATE INDEX "MealRecord_date_idx" ON "MealRecord"("date");
CREATE UNIQUE INDEX "MealRecord_userId_date_key" ON "MealRecord"("userId", "date");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "MealRuleHistory_userId_effectiveFrom_idx" ON "MealRuleHistory"("userId", "effectiveFrom");
