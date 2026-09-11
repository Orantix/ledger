import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

const prisma = new PrismaClient();

// The real first-run setup for a production deployment: one admin
// account, either with a password you provide or a randomly generated one
// printed once. Safe to re-run — it upserts by email rather than failing.
async function main() {
  const email = process.env.ADMIN_EMAIL;
  const name = process.env.ADMIN_NAME ?? 'Admin';
  let password = process.env.ADMIN_PASSWORD;

  if (!email) {
    throw new Error('Set ADMIN_EMAIL (and optionally ADMIN_PASSWORD, ADMIN_NAME) before running this.');
  }

  let generated = false;
  if (!password) {
    password = randomBytes(9).toString('base64url');
    generated = true;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.upsert({
    where: { email },
    update: { passwordHash, role: Role.ADMIN, isActive: true, name },
    create: { email, name, role: Role.ADMIN, passwordHash },
  });

  // eslint-disable-next-line no-console
  console.log(`Admin account ready: ${email}`);
  if (generated) {
    // eslint-disable-next-line no-console
    console.log(`Generated password (shown once — save it now): ${password}`);
  }
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
