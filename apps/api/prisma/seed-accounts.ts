import { PrismaClient } from '@prisma/client';
import { seedAccountsRulesAndMappings } from './seed-data';

const prisma = new PrismaClient();

// Safe to run against a real deployment: starter chart of accounts,
// classification rules, and FS mappings only. No users, no demo data.
async function main() {
  const counts = await seedAccountsRulesAndMappings(prisma);
  // eslint-disable-next-line no-console
  console.log(`Seeded ${counts.accountCount} accounts, ${counts.ruleCount} rules, ${counts.mappingCount} FS mappings.`);
  // eslint-disable-next-line no-console
  console.log('No users were created. Run `pnpm create-admin` next.');
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
