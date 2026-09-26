import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AccountType } from '@prisma/client';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JournalModule } from '../src/journal/journal.module';
import { JournalService } from '../src/journal/journal.service';
import { TrialBalanceModule } from '../src/trial-balance/trial-balance.module';
import { TrialBalanceService } from '../src/trial-balance/trial-balance.service';
import { cleanDatabase } from './test-utils';

describe('TrialBalanceService account ledger', () => {
  let prisma: PrismaService;
  let journal: JournalService;
  let trialBalance: TrialBalanceService;
  let bankId: string;
  let expenseId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, JournalModule, TrialBalanceModule],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    journal = moduleRef.get(JournalService);
    trialBalance = moduleRef.get(TrialBalanceService);
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    const bank = await prisma.account.create({ data: { code: '1000', name: 'Bank', type: AccountType.ASSET } });
    const expense = await prisma.account.create({ data: { code: '5000', name: 'Expense', type: AccountType.EXPENSE } });
    bankId = bank.id;
    expenseId = expense.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('lists every line for an account oldest-first with a running balance that matches the trial balance row', async () => {
    const later = await journal.postEntry({
      date: new Date('2026-02-10'),
      description: 'second',
      createdBy: 'test',
      lines: [
        { accountId: expenseId, debit: 40, credit: 0 },
        { accountId: bankId, debit: 0, credit: 40 },
      ],
    });
    await journal.postEntry({
      date: new Date('2026-01-05'),
      description: 'first',
      createdBy: 'test',
      lines: [
        { accountId: expenseId, debit: 100, credit: 0 },
        { accountId: bankId, debit: 0, credit: 100 },
      ],
    });
    await journal.reverse(later.id, 'test');

    const ledger = await trialBalance.getAccountLedger(expenseId);
    expect(ledger.lines.map((l) => l.description)).toEqual([
      'first',
      'second',
      'Reversal of: second',
    ]);
    expect(ledger.lines.map((l) => l.runningBalance)).toEqual([100, 140, 100]);
    expect(ledger.lines[1].entryStatus).toBe('REVERSED');
    expect(ledger.lines[2].isReversal).toBe(true);

    const tb = await trialBalance.getTrialBalance();
    const row = tb.rows.find((r) => r.accountId === expenseId)!;
    expect(ledger.balance).toBe(row.balance);
    expect(ledger.totalDebit).toBe(row.totalDebit);
    expect(ledger.totalCredit).toBe(row.totalCredit);
  });

  it('404s for an unknown account', async () => {
    await expect(trialBalance.getAccountLedger('nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});
