-- CreateTable
CREATE TABLE "org_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "baseCurrency" TEXT NOT NULL DEFAULT 'LKR',
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_settings_pkey" PRIMARY KEY ("id")
);
