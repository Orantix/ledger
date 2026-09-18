import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { seedAccountsRulesAndMappings } from './seed-data';

const prisma = new PrismaClient();

// Dev-only seed users, one per role, all sharing a throwaway password.
// Never run this against a deployment that holds real data — use
// `pnpm seed:accounts` + `pnpm create-admin` instead (see README).
const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'orantix123';
const USERS: { email: string; name: string; role: Role }[] = [
  { email: 'admin@orantix.local', name: 'Admin', role: Role.ADMIN },
  { email: 'owner@orantix.local', name: 'Owner', role: Role.OWNER },
  { email: 'bookkeeper@orantix.local', name: 'Bookkeeper', role: Role.BOOKKEEPER },
  { email: 'accountant@orantix.local', name: 'Accountant', role: Role.ACCOUNTANT },
  { email: 'staff@orantix.local', name: 'Staff', role: Role.STAFF },
];

async function main() {
  // No NODE_ENV gate here: the Docker demo/dev setup sets NODE_ENV=production
  // for runtime-optimization reasons and still needs to run this seed, so
  // that env var isn't a reliable signal for "this holds real data." The
  // real safeguard is that this is always a manual, deliberate command —
  // real deployments are told to use seed:accounts + create-admin instead
  // (see README).
  const counts = await seedAccountsRulesAndMappings(prisma);

  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);
  for (const user of USERS) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {},
      create: { email: user.email, name: user.name, role: user.role, passwordHash },
    });
  }

  // eslint-disable-next-line no-console
  console.log(
    `Seeded ${counts.accountCount} accounts, ${counts.ruleCount} rules, ${counts.revenueRuleCount} revenue rules, ${counts.mappingCount} FS mappings, ${USERS.length} dev users.`,
  );
  // eslint-disable-next-line no-console
  console.log(`Dev login: any seeded email above, password "${SEED_PASSWORD}".`);
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
