-- CreateTable
CREATE TABLE "VendorShareToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "createdById" TEXT,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE UNIQUE INDEX "VendorShareToken_token_key" ON "VendorShareToken"("token");

-- CreateIndex
CREATE INDEX "VendorShareToken_year_month_idx" ON "VendorShareToken"("year", "month");
