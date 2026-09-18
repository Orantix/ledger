-- CreateEnum
CREATE TYPE "CaptureType" AS ENUM ('EXPENSE', 'REVENUE');

-- AlterTable
ALTER TABLE "captures" ADD COLUMN     "appliedRevenueRuleId" TEXT,
ADD COLUMN     "customerName" TEXT,
ADD COLUMN     "type" "CaptureType" NOT NULL DEFAULT 'EXPENSE';

-- CreateTable
CREATE TABLE "revenue_classification_rules" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "revenueAccountId" TEXT NOT NULL,
    "receivingAccountId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revenue_classification_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "revenue_classification_rules_category_paymentMethod_isActiv_idx" ON "revenue_classification_rules"("category", "paymentMethod", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "revenue_classification_rules_category_paymentMethod_version_key" ON "revenue_classification_rules"("category", "paymentMethod", "version");

-- AddForeignKey
ALTER TABLE "revenue_classification_rules" ADD CONSTRAINT "revenue_classification_rules_revenueAccountId_fkey" FOREIGN KEY ("revenueAccountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenue_classification_rules" ADD CONSTRAINT "revenue_classification_rules_receivingAccountId_fkey" FOREIGN KEY ("receivingAccountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "captures" ADD CONSTRAINT "captures_appliedRevenueRuleId_fkey" FOREIGN KEY ("appliedRevenueRuleId") REFERENCES "revenue_classification_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
