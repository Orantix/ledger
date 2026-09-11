import { PrismaService } from '../src/prisma/prisma.service';

// Delete in FK-safe order. Called before each test so every test starts
// from a known-empty database rather than depending on execution order.
export async function cleanDatabase(prisma: PrismaService) {
  await prisma.varianceFlag.deleteMany();
  await prisma.journalLine.deleteMany();
  await prisma.journalEntry.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.capture.deleteMany();
  await prisma.classificationRule.deleteMany();
  await prisma.accountFsMapping.deleteMany();
  await prisma.account.deleteMany();
  await prisma.fiscalPeriod.deleteMany();
  await prisma.capitalCommitment.deleteMany();
  await prisma.budget.deleteMany();
  await prisma.user.deleteMany();
}
