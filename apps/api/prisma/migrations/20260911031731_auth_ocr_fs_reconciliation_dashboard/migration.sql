-- CreateEnum
CREATE TYPE "ReviewReason" AS ENUM ('NO_RULE', 'SENSITIVE_ACCOUNT', 'UNUSUAL_AMOUNT');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'STAFF', 'BOOKKEEPER', 'ACCOUNTANT', 'ADMIN');

-- CreateEnum
CREATE TYPE "ExtractionStatus" AS ENUM ('PENDING', 'COMPLETE', 'FAILED', 'UNSUPPORTED');

-- CreateEnum
CREATE TYPE "FsStatement" AS ENUM ('INCOME_STATEMENT', 'BALANCE_SHEET');

-- CreateEnum
CREATE TYPE "CashFlowCategory" AS ENUM ('OPERATING', 'INVESTING', 'FINANCING', 'NONE');

-- CreateEnum
CREATE TYPE "PeriodStatus" AS ENUM ('DRAFT', 'FINAL');

-- CreateEnum
CREATE TYPE "VarianceType" AS ENUM ('UNMAPPED_ACCOUNT', 'CAPITAL_SHORTFALL', 'CUSTOM');

-- CreateEnum
CREATE TYPE "VarianceStatus" AS ENUM ('OPEN', 'EXPLAINED');

-- DropForeignKey
ALTER TABLE "attachments" DROP CONSTRAINT "attachments_captureId_fkey";

-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "isCash" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sensitive" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "attachments" ADD COLUMN     "extractedAmount" DECIMAL(14,2),
ADD COLUMN     "extractedCurrency" TEXT,
ADD COLUMN     "extractedDate" TIMESTAMP(3),
ADD COLUMN     "extractedVendor" TEXT,
ADD COLUMN     "extractionConfidence" JSONB,
ADD COLUMN     "extractionStatus" "ExtractionStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "ocrRawText" TEXT,
ALTER COLUMN "captureId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "captures" ADD COLUMN     "exchangeRate" DECIMAL(14,6) NOT NULL DEFAULT 1,
ADD COLUMN     "reviewReason" "ReviewReason",
ADD COLUMN     "shareholderName" TEXT;

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_fs_mappings" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "statement" "FsStatement" NOT NULL,
    "section" TEXT NOT NULL,
    "noteLabel" TEXT NOT NULL,
    "cashFlowCategory" "CashFlowCategory" NOT NULL DEFAULT 'NONE',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_fs_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fiscal_periods" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "PeriodStatus" NOT NULL DEFAULT 'DRAFT',
    "finalizedBy" TEXT,
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fiscal_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "variance_flags" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "type" "VarianceType" NOT NULL,
    "accountId" TEXT,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2),
    "status" "VarianceStatus" NOT NULL DEFAULT 'OPEN',
    "explanation" TEXT,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "variance_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capital_commitments" (
    "id" TEXT NOT NULL,
    "shareholderName" TEXT NOT NULL,
    "committedAmount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'LKR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "capital_commitments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budgets" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "account_fs_mappings_accountId_isActive_idx" ON "account_fs_mappings"("accountId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "account_fs_mappings_accountId_version_key" ON "account_fs_mappings"("accountId", "version");

-- CreateIndex
CREATE INDEX "variance_flags_periodId_status_idx" ON "variance_flags"("periodId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "budgets_accountId_month_key" ON "budgets"("accountId", "month");

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_captureId_fkey" FOREIGN KEY ("captureId") REFERENCES "captures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_fs_mappings" ADD CONSTRAINT "account_fs_mappings_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variance_flags" ADD CONSTRAINT "variance_flags_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "fiscal_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
