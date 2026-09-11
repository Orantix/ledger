import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AccountType } from '@prisma/client';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { JournalModule } from '../src/journal/journal.module';
import { JournalService } from '../src/journal/journal.service';
import { cleanDatabase } from './test-utils';

describe('JournalService', () => {
  let prisma: PrismaService;
  let journal: JournalService;
  let bankId: string;
  let expenseId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [PrismaModule, JournalModule] }).compile();
    prisma = moduleRef.get(PrismaService);
    journal = moduleRef.get(JournalService);
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

  it('posts a balanced entry', async () => {
    const entry = await journal.postEntry({
      date: new Date('2026-01-15'),
      description: 'test',
      createdBy: 'test',
      lines: [
        { accountId: expenseId, debit: 100, credit: 0 },
        { accountId: bankId, debit: 0, credit: 100 },
      ],
    });
    expect(entry.lines).toHaveLength(2);
    expect(entry.status).toBe('POSTED');
  });

  it('rejects an unbalanced entry', async () => {
    await expect(
      journal.postEntry({
        date: new Date('2026-01-15'),
        description: 'test',
        createdBy: 'test',
        lines: [
          { accountId: expenseId, debit: 100, credit: 0 },
          { accountId: bankId, debit: 0, credit: 99 },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects an entry with fewer than two lines', async () => {
    await expect(
      journal.postEntry({
        date: new Date('2026-01-15'),
        description: 'test',
        createdBy: 'test',
        lines: [{ accountId: expenseId, debit: 100, credit: 0 }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('reverses an entry as the exact mirror image and nets to zero', async () => {
    const original = await journal.postEntry({
      date: new Date('2026-01-15'),
      description: 'test',
      createdBy: 'test',
      lines: [
        { accountId: expenseId, debit: 100, credit: 0 },
        { accountId: bankId, debit: 0, credit: 100 },
      ],
    });

    const reversal = await journal.reverse(original.id, 'test');
    expect(reversal.lines.find((l) => l.accountId === expenseId)?.credit.toString()).toBe('100');
    expect(reversal.lines.find((l) => l.accountId === bankId)?.debit.toString()).toBe('100');

    const updatedOriginal = await prisma.journalEntry.findUniqueOrThrow({ where: { id: original.id } });
    expect(updatedOriginal.status).toBe('REVERSED');

    const sums = await prisma.journalLine.groupBy({ by: ['accountId'], _sum: { debit: true, credit: true } });
    for (const s of sums) {
      expect(Number(s._sum.debit ?? 0) - Number(s._sum.credit ?? 0)).toBe(0);
    }
  });

  it('refuses to reverse an already-reversed entry', async () => {
    const original = await journal.postEntry({
      date: new Date('2026-01-15'),
      description: 'test',
      createdBy: 'test',
      lines: [
        { accountId: expenseId, debit: 100, credit: 0 },
        { accountId: bankId, debit: 0, credit: 100 },
      ],
    });
    await journal.reverse(original.id, 'test');
    await expect(journal.reverse(original.id, 'test')).rejects.toThrow(BadRequestException);
  });

  it('blocks a new posting dated inside a finalized period', async () => {
    await prisma.fiscalPeriod.create({
      data: {
        label: 'Jan 2026',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-01-31'),
        status: 'FINAL',
        finalizedBy: 'test',
        finalizedAt: new Date(),
      },
    });

    await expect(
      journal.postEntry({
        date: new Date('2026-01-15'),
        description: 'late entry',
        createdBy: 'test',
        lines: [
          { accountId: expenseId, debit: 50, credit: 0 },
          { accountId: bankId, debit: 0, credit: 50 },
        ],
      }),
    ).rejects.toThrow(BadRequestException);

    // A date outside the finalized period still works.
    const entry = await journal.postEntry({
      date: new Date('2026-02-01'),
      description: 'february entry',
      createdBy: 'test',
      lines: [
        { accountId: expenseId, debit: 50, credit: 0 },
        { accountId: bankId, debit: 0, credit: 50 },
      ],
    });
    expect(entry.status).toBe('POSTED');
  });
});
