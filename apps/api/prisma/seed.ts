import { AccountType, PaymentMethod, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ACCOUNTS: { code: string; name: string; type: AccountType }[] = [
  { code: '1000', name: 'Bank', type: AccountType.ASSET },
  { code: '1100', name: 'Accounts Receivable', type: AccountType.ASSET },
  { code: '2000', name: 'Creditors (Accounts Payable)', type: AccountType.LIABILITY },
  { code: '2100', name: "Director's Current Account", type: AccountType.LIABILITY },
  { code: '3000', name: 'Share Capital', type: AccountType.EQUITY },
  { code: '3900', name: 'Retained Earnings', type: AccountType.EQUITY },
  { code: '4000', name: 'Service Revenue', type: AccountType.REVENUE },
  { code: '5000', name: 'Hosting & Subscriptions', type: AccountType.EXPENSE },
  { code: '5100', name: 'Legal & Professional Fees', type: AccountType.EXPENSE },
  { code: '5200', name: 'Office Supplies', type: AccountType.EXPENSE },
  { code: '5300', name: 'Software & Tools', type: AccountType.EXPENSE },
  { code: '5400', name: 'Travel & Entertainment', type: AccountType.EXPENSE },
  { code: '5900', name: 'General Expenses', type: AccountType.EXPENSE },
];

// Starter rules for Orantix's own books — the single real entity this
// pipeline is being validated against before it's generalized further.
const RULES: { category: string; paymentMethod: PaymentMethod; expenseCode: string; paymentCode: string }[] = [
  { category: 'hosting', paymentMethod: PaymentMethod.BANK, expenseCode: '5000', paymentCode: '1000' },
  { category: 'hosting', paymentMethod: PaymentMethod.PERSONAL, expenseCode: '5000', paymentCode: '2100' },
  { category: 'hosting', paymentMethod: PaymentMethod.CREDIT, expenseCode: '5000', paymentCode: '2000' },
  { category: 'subscriptions', paymentMethod: PaymentMethod.BANK, expenseCode: '5000', paymentCode: '1000' },
  { category: 'legal fees', paymentMethod: PaymentMethod.BANK, expenseCode: '5100', paymentCode: '1000' },
  { category: 'legal fees', paymentMethod: PaymentMethod.PERSONAL, expenseCode: '5100', paymentCode: '2100' },
  { category: 'office supplies', paymentMethod: PaymentMethod.BANK, expenseCode: '5200', paymentCode: '1000' },
  { category: 'office supplies', paymentMethod: PaymentMethod.PERSONAL, expenseCode: '5200', paymentCode: '2100' },
  { category: 'software', paymentMethod: PaymentMethod.BANK, expenseCode: '5300', paymentCode: '1000' },
  { category: 'travel', paymentMethod: PaymentMethod.BANK, expenseCode: '5400', paymentCode: '1000' },
  { category: 'travel', paymentMethod: PaymentMethod.PERSONAL, expenseCode: '5400', paymentCode: '2100' },
];

async function main() {
  const accountByCode = new Map<string, string>();
  for (const account of ACCOUNTS) {
    const created = await prisma.account.upsert({
      where: { code: account.code },
      update: { name: account.name, type: account.type },
      create: account,
    });
    accountByCode.set(account.code, created.id);
  }

  for (const rule of RULES) {
    const expenseAccountId = accountByCode.get(rule.expenseCode);
    const paymentAccountId = accountByCode.get(rule.paymentCode);
    if (!expenseAccountId || !paymentAccountId) {
      throw new Error(`Missing account for rule ${rule.category}/${rule.paymentMethod}`);
    }
    const existing = await prisma.classificationRule.findFirst({
      where: { category: rule.category, paymentMethod: rule.paymentMethod },
    });
    if (existing) continue;
    await prisma.classificationRule.create({
      data: {
        category: rule.category,
        paymentMethod: rule.paymentMethod,
        expenseAccountId,
        paymentAccountId,
        version: 1,
      },
    });
  }

  // eslint-disable-next-line no-console
  console.log(`Seeded ${ACCOUNTS.length} accounts and ${RULES.length} classification rules.`);
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
