import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AccountType } from '@prisma/client';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JournalModule } from '../src/journal/journal.module';
import { JournalService } from '../src/journal/journal.service';
import { FinancialStatementsModule } from '../src/financial-statements/financial-statements.module';
import { FinancialStatementsService } from '../src/financial-statements/financial-statements.service';
import { ReconciliationModule } from '../src/reconciliation/reconciliation.module';
import { ReconciliationService } from '../src/reconciliation/reconciliation.service';
import { cleanDatabase } from './test-utils';

describe('FinancialStatementsService', () => {
  let prisma: PrismaService;
  let journal: JournalService;
  let fs: FinancialStatementsService;
  let reconciliation: ReconciliationService;
  let bankId: string;
  let expenseId: string;
  let revenueId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, JournalModule, FinancialStatementsModule, ReconciliationModule],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    journal = moduleRef.get(JournalService);
    fs = moduleRef.get(FinancialStatementsService);
    reconciliation = moduleRef.get(ReconciliationService);
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    const bank = await prisma.account.create({
      data: { code: '1000', name: 'Bank', type: AccountType.ASSET, isCash: true },
    });
    const expense = await prisma.account.create({ data: { code: '5000', name: 'Expense', type: AccountType.EXPENSE } });
    const revenue = await prisma.account.create({ data: { code: '4000', name: 'Revenue', type: AccountType.REVENUE } });
    bankId = bank.id;
    expenseId = expense.id;
    revenueId = revenue.id;

    await prisma.accountFsMapping.create({
      data: { accountId: bankId, statement: 'BALANCE_SHEET', section: 'Current Assets', noteLabel: 'Bank' },
    });
    await prisma.accountFsMapping.create({
      data: { accountId: expenseId, statement: 'INCOME_STATEMENT', section: 'Operating Expenses', noteLabel: 'Expense', cashFlowCategory: 'OPERATING' },
    });
    await prisma.accountFsMapping.create({
      data: { accountId: revenueId, statement: 'INCOME_STATEMENT', section: 'Revenue', noteLabel: 'Revenue', cashFlowCategory: 'OPERATING' },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function makePeriod() {
    return prisma.fiscalPeriod.create({
      data: { label: 'Jan 2026', startDate: new Date('2026-01-01'), endDate: new Date('2026-01-31') },
    });
  }

  it('keeps the balance sheet balanced after revenue and expense postings', async () => {
    await journal.postEntry({
      date: new Date('2026-01-10'),
      description: 'sale',
      createdBy: 'test',
      lines: [
        { accountId: bankId, debit: 500, credit: 0 },
        { accountId: revenueId, debit: 0, credit: 500 },
      ],
    });
    await journal.postEntry({
      date: new Date('2026-01-15'),
      description: 'expense',
      createdBy: 'test',
      lines: [
        { accountId: expenseId, debit: 200, credit: 0 },
        { accountId: bankId, debit: 0, credit: 200 },
      ],
    });

    const period = await makePeriod();
    const balanceSheet = await fs.generateBalanceSheet(period.id);
    expect(balanceSheet.asOf.balances).toBe(true);
    expect(balanceSheet.asOf.totalAssets).toBe(300);
    expect(balanceSheet.asOf.retainedEarnings).toBe(300);

    const incomeStatement = await fs.generateIncomeStatement(period.id);
    expect(incomeStatement.current.netIncome).toBe(300);
  });

  it('finalizes cleanly when everything is mapped, and then blocks new postings', async () => {
    await journal.postEntry({
      date: new Date('2026-01-10'),
      description: 'sale',
      createdBy: 'test',
      lines: [
        { accountId: bankId, debit: 500, credit: 0 },
        { accountId: revenueId, debit: 0, credit: 500 },
      ],
    });

    const period = await makePeriod();
    const finalized = await fs.finalizePeriod(period.id, 'test@orantix.local');
    expect(finalized.status).toBe('FINAL');

    await expect(
      journal.postEntry({
        date: new Date('2026-01-20'),
        description: 'late entry',
        createdBy: 'test',
        lines: [
          { accountId: expenseId, debit: 10, credit: 0 },
          { accountId: bankId, debit: 0, credit: 10 },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('refuses to finalize while an account with activity has no FS mapping', async () => {
    const unmapped = await prisma.account.create({ data: { code: '5900', name: 'Unmapped Expense', type: AccountType.EXPENSE } });
    await journal.postEntry({
      date: new Date('2026-01-10'),
      description: 'unmapped spend',
      createdBy: 'test',
      lines: [
        { accountId: unmapped.id, debit: 50, credit: 0 },
        { accountId: bankId, debit: 0, credit: 50 },
      ],
    });

    const period = await makePeriod();
    await expect(fs.finalizePeriod(period.id, 'test@orantix.local')).rejects.toThrow(BadRequestException);

    const flags = await reconciliation.listFlags(period.id);
    const unmappedFlag = flags.find((f) => f.type === 'UNMAPPED_ACCOUNT' && f.accountId === unmapped.id);
    expect(unmappedFlag?.status).toBe('OPEN');

    await reconciliation.explainFlag(unmappedFlag!.id, 'One-off, mapping it next period', 'test@orantix.local');
    const finalized = await fs.finalizePeriod(period.id, 'test@orantix.local');
    expect(finalized.status).toBe('FINAL');
  });
});
