import { Test } from '@nestjs/testing';
import { AccountType, PaymentMethod } from '@prisma/client';
import { PrismaModule } from '../src/prisma/prisma.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { CapturesModule } from '../src/captures/captures.module';
import { CapturesService } from '../src/captures/captures.service';
import { cleanDatabase } from './test-utils';

describe('CapturesService', () => {
  let prisma: PrismaService;
  let captures: CapturesService;
  let bankId: string;
  let expenseId: string;
  let sensitiveAccountId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [PrismaModule, CapturesModule] }).compile();
    prisma = moduleRef.get(PrismaService);
    captures = moduleRef.get(CapturesService);
  });

  beforeEach(async () => {
    await cleanDatabase(prisma);
    const bank = await prisma.account.create({
      data: { code: '1000', name: 'Bank', type: AccountType.ASSET, isCash: true },
    });
    const expense = await prisma.account.create({ data: { code: '5000', name: 'Hosting', type: AccountType.EXPENSE } });
    const sensitive = await prisma.account.create({
      data: { code: '2100', name: "Director's Current Account", type: AccountType.LIABILITY, sensitive: true },
    });
    bankId = bank.id;
    expenseId = expense.id;
    sensitiveAccountId = sensitive.id;

    await prisma.classificationRule.create({
      data: { category: 'hosting', paymentMethod: PaymentMethod.BANK, expenseAccountId: expenseId, paymentAccountId: bankId },
    });
    await prisma.classificationRule.create({
      data: {
        category: 'hosting',
        paymentMethod: PaymentMethod.PERSONAL,
        expenseAccountId: expenseId,
        paymentAccountId: sensitiveAccountId,
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('auto-posts when a rule matches and no accounts are sensitive', async () => {
    const capture = await captures.create(
      { description: 'AWS', amount: 42.5, date: '2026-01-10', paymentMethod: PaymentMethod.BANK, category: 'hosting' },
      'test',
    );
    expect(capture.status).toBe('POSTED');
    expect((capture as any).journalEntryId).toBeTruthy();
  });

  it('holds for review when the matched rule touches a sensitive account', async () => {
    const capture = await captures.create(
      { description: 'Personal AWS', amount: 42.5, date: '2026-01-10', paymentMethod: PaymentMethod.PERSONAL, category: 'hosting' },
      'test',
    );
    expect(capture.status).toBe('PENDING_REVIEW');
    expect((capture as any).reviewReason).toBe('SENSITIVE_ACCOUNT');
    expect((capture as any).appliedRuleId).toBeTruthy();
  });

  it('holds for review when no rule matches', async () => {
    const capture = await captures.create(
      { description: 'Mystery expense', amount: 10, date: '2026-01-10', paymentMethod: PaymentMethod.BANK, category: 'unknown-category' },
      'test',
    );
    expect(capture.status).toBe('PENDING_REVIEW');
    expect((capture as any).reviewReason).toBe('NO_RULE');
  });

  it('holds for review when the amount is anomalous for its category history', async () => {
    for (let i = 0; i < 3; i++) {
      await captures.create(
        { description: `Hosting ${i}`, amount: 10, date: '2026-01-10', paymentMethod: PaymentMethod.BANK, category: 'hosting' },
        'test',
      );
    }
    const anomalous = await captures.create(
      { description: 'Huge hosting bill', amount: 1000, date: '2026-01-10', paymentMethod: PaymentMethod.BANK, category: 'hosting' },
      'test',
    );
    expect(anomalous.status).toBe('PENDING_REVIEW');
    expect((anomalous as any).reviewReason).toBe('UNUSUAL_AMOUNT');
  });

  it('posts a reviewed capture and can save a new rule', async () => {
    const capture = await captures.create(
      { description: 'Mystery', amount: 10, date: '2026-01-10', paymentMethod: PaymentMethod.CREDIT, category: 'brand-new-category' },
      'test',
    );
    expect(capture.status).toBe('PENDING_REVIEW');

    const posted = await captures.classifyForReview(
      capture.id,
      { expenseAccountId: expenseId, paymentAccountId: bankId, saveAsRule: true },
      'test',
    );
    expect(posted.status).toBe('POSTED');

    const rule = await prisma.classificationRule.findFirst({
      where: { category: 'brand-new-category', paymentMethod: PaymentMethod.CREDIT },
    });
    expect(rule).not.toBeNull();
  });
});
