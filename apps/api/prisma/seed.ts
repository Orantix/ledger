import { AccountType, CashFlowCategory, FsStatement, PaymentMethod, PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const ACCOUNTS: {
  code: string;
  name: string;
  type: AccountType;
  sensitive?: boolean;
  isCash?: boolean;
}[] = [
  { code: '1000', name: 'Bank', type: AccountType.ASSET, isCash: true },
  { code: '1100', name: 'Accounts Receivable', type: AccountType.ASSET },
  { code: '2000', name: 'Creditors (Accounts Payable)', type: AccountType.LIABILITY },
  { code: '2100', name: "Director's Current Account", type: AccountType.LIABILITY, sensitive: true },
  { code: '3000', name: 'Share Capital', type: AccountType.EQUITY, sensitive: true },
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

// FS presentation mapping per account. cashFlowCategory only matters for
// accounts that appear as the *counter*-account to a cash movement.
const FS_MAPPINGS: {
  code: string;
  statement: FsStatement;
  section: string;
  noteLabel: string;
  cashFlowCategory?: CashFlowCategory;
  sortOrder: number;
}[] = [
  { code: '1000', statement: 'BALANCE_SHEET', section: 'Current Assets', noteLabel: 'Bank', sortOrder: 1 },
  {
    code: '1100',
    statement: 'BALANCE_SHEET',
    section: 'Current Assets',
    noteLabel: 'Accounts Receivable',
    sortOrder: 2,
  },
  {
    code: '2000',
    statement: 'BALANCE_SHEET',
    section: 'Current Liabilities',
    noteLabel: 'Creditors',
    cashFlowCategory: 'OPERATING',
    sortOrder: 1,
  },
  {
    code: '2100',
    statement: 'BALANCE_SHEET',
    section: 'Current Liabilities',
    noteLabel: "Director's Current Account",
    cashFlowCategory: 'FINANCING',
    sortOrder: 2,
  },
  {
    code: '3000',
    statement: 'BALANCE_SHEET',
    section: 'Equity',
    noteLabel: 'Share Capital',
    cashFlowCategory: 'FINANCING',
    sortOrder: 1,
  },
  {
    code: '4000',
    statement: 'INCOME_STATEMENT',
    section: 'Revenue',
    noteLabel: 'Service Revenue',
    cashFlowCategory: 'OPERATING',
    sortOrder: 1,
  },
  {
    code: '5000',
    statement: 'INCOME_STATEMENT',
    section: 'Operating Expenses',
    noteLabel: 'Hosting & Subscriptions',
    cashFlowCategory: 'OPERATING',
    sortOrder: 1,
  },
  {
    code: '5100',
    statement: 'INCOME_STATEMENT',
    section: 'Operating Expenses',
    noteLabel: 'Legal & Professional Fees',
    cashFlowCategory: 'OPERATING',
    sortOrder: 2,
  },
  {
    code: '5200',
    statement: 'INCOME_STATEMENT',
    section: 'Operating Expenses',
    noteLabel: 'Office Supplies',
    cashFlowCategory: 'OPERATING',
    sortOrder: 3,
  },
  {
    code: '5300',
    statement: 'INCOME_STATEMENT',
    section: 'Operating Expenses',
    noteLabel: 'Software & Tools',
    cashFlowCategory: 'OPERATING',
    sortOrder: 4,
  },
  {
    code: '5400',
    statement: 'INCOME_STATEMENT',
    section: 'Operating Expenses',
    noteLabel: 'Travel & Entertainment',
    cashFlowCategory: 'OPERATING',
    sortOrder: 5,
  },
  {
    code: '5900',
    statement: 'INCOME_STATEMENT',
    section: 'Operating Expenses',
    noteLabel: 'General Expenses',
    cashFlowCategory: 'OPERATING',
    sortOrder: 6,
  },
];

// Dev-only seed users, one per role, all sharing a throwaway password.
// Change or remove before this ever sees production data.
const SEED_PASSWORD = process.env.SEED_PASSWORD ?? 'orantix123';
const USERS: { email: string; name: string; role: Role }[] = [
  { email: 'admin@orantix.local', name: 'Admin', role: Role.ADMIN },
  { email: 'owner@orantix.local', name: 'Owner', role: Role.OWNER },
  { email: 'bookkeeper@orantix.local', name: 'Bookkeeper', role: Role.BOOKKEEPER },
  { email: 'accountant@orantix.local', name: 'Accountant', role: Role.ACCOUNTANT },
  { email: 'staff@orantix.local', name: 'Staff', role: Role.STAFF },
];

async function main() {
  const accountByCode = new Map<string, string>();
  for (const account of ACCOUNTS) {
    const created = await prisma.account.upsert({
      where: { code: account.code },
      update: { name: account.name, type: account.type, sensitive: account.sensitive ?? false, isCash: account.isCash ?? false },
      create: { ...account, sensitive: account.sensitive ?? false, isCash: account.isCash ?? false },
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
      data: { category: rule.category, paymentMethod: rule.paymentMethod, expenseAccountId, paymentAccountId, version: 1 },
    });
  }

  for (const mapping of FS_MAPPINGS) {
    const accountId = accountByCode.get(mapping.code);
    if (!accountId) throw new Error(`Missing account for FS mapping ${mapping.code}`);
    const existing = await prisma.accountFsMapping.findFirst({ where: { accountId } });
    if (existing) continue;
    await prisma.accountFsMapping.create({
      data: {
        accountId,
        statement: mapping.statement,
        section: mapping.section,
        noteLabel: mapping.noteLabel,
        cashFlowCategory: mapping.cashFlowCategory ?? 'NONE',
        sortOrder: mapping.sortOrder,
        version: 1,
      },
    });
  }

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
    `Seeded ${ACCOUNTS.length} accounts, ${RULES.length} rules, ${FS_MAPPINGS.length} FS mappings, ${USERS.length} users.`,
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
