import { Test } from '@nestjs/testing';
import { AccountType, CaptureType, PaymentMethod } from '@prisma/client';
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
  let revenueId: string;
  let receivableId: string;

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
    const receivable = await prisma.account.create({
      data: { code: '1100', name: 'Accounts Receivable', type: AccountType.ASSET },
    });
    const expense = await prisma.account.create({ data: { code: '5000', name: 'Hosting', type: AccountType.EXPENSE } });
    const revenue = await prisma.account.create({
      data: { code: '4000', name: 'Service Revenue', type: AccountType.REVENUE },
    });
    const sensitive = await prisma.account.create({
      data: { code: '2100', name: "Director's Current Account", type: AccountType.LIABILITY, sensitive: true },
    });
    bankId = bank.id;
    receivableId = receivable.id;
    expenseId = expense.id;
    revenueId = revenue.id;
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
    await prisma.revenueClassificationRule.create({
      data: {
        category: 'consulting',
        paymentMethod: PaymentMethod.BANK,
        revenueAccountId: revenueId,
        receivingAccountId: bankId,
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

  it('rejects a non-base-currency capture with no exchange rate instead of silently defaulting to 1', async () => {
    await expect(
      captures.create(
        {
          description: 'AWS (USD invoice)',
          amount: 42.5,
          date: '2026-01-10',
          paymentMethod: PaymentMethod.BANK,
          category: 'hosting',
          currency: 'USD',
        },
        'test',
      ),
    ).rejects.toThrow(/exchange rate/i);
  });

  it('forces exchangeRate to 1 for base-currency captures regardless of what was sent', async () => {
    const capture = await captures.create(
      {
        description: 'AWS',
        amount: 42.5,
        date: '2026-01-10',
        paymentMethod: PaymentMethod.BANK,
        category: 'hosting',
        currency: 'LKR',
        exchangeRate: 300,
      },
      'test',
    );
    expect(Number((capture as any).exchangeRate)).toBe(1);
  });

  it('lets a bookkeeper correct a wrong exchange rate on a PENDING_REVIEW capture', async () => {
    const capture = await captures.create(
      {
        description: 'Mystery USD expense',
        amount: 100,
        date: '2026-01-10',
        paymentMethod: PaymentMethod.BANK,
        category: 'unknown-category',
        currency: 'USD',
        exchangeRate: 300,
      },
      'test',
    );
    expect(capture.status).toBe('PENDING_REVIEW');

    const updated = await captures.update(capture.id, { exchangeRate: 310.25 }, 'test');
    expect(Number((updated as any).exchangeRate)).toBe(310.25);
  });

  it('refuses to edit a capture that has already been posted', async () => {
    const capture = await captures.create(
      { description: 'AWS', amount: 42.5, date: '2026-01-10', paymentMethod: PaymentMethod.BANK, category: 'hosting' },
      'test',
    );
    expect(capture.status).toBe('POSTED');

    await expect(captures.update(capture.id, { description: 'AWS (edited)' }, 'test')).rejects.toThrow(/already been posted/i);
  });

  it('auto-posts a revenue capture debit-received/credit-revenue, the reverse of an expense', async () => {
    const capture = await captures.create(
      {
        type: CaptureType.REVENUE,
        description: 'Consulting invoice paid',
        amount: 500,
        date: '2026-01-10',
        paymentMethod: PaymentMethod.BANK,
        category: 'consulting',
      },
      'test',
    );
    expect(capture.status).toBe('POSTED');
    const entry = await prisma.journalEntry.findUniqueOrThrow({
      where: { id: (capture as any).journalEntryId },
      include: { lines: true },
    });
    const bankLine = entry.lines.find((l) => l.accountId === bankId)!;
    const revenueLine = entry.lines.find((l) => l.accountId === revenueId)!;
    expect(Number(bankLine.debit)).toBe(500);
    expect(Number(bankLine.credit)).toBe(0);
    expect(Number(revenueLine.credit)).toBe(500);
    expect(Number(revenueLine.debit)).toBe(0);
  });

  it('rejects PERSONAL payment method on a revenue capture', async () => {
    await expect(
      captures.create(
        {
          type: CaptureType.REVENUE,
          description: 'Nonsense',
          amount: 100,
          date: '2026-01-10',
          paymentMethod: PaymentMethod.PERSONAL,
          category: 'consulting',
        },
        'test',
      ),
    ).rejects.toThrow(/personal/i);
  });

  it('holds a revenue capture for review when no revenue rule matches, and posts it via classify-revenue', async () => {
    const capture = await captures.create(
      {
        type: CaptureType.REVENUE,
        description: 'Unmapped sale',
        amount: 250,
        date: '2026-01-10',
        paymentMethod: PaymentMethod.CREDIT,
        category: 'product sales',
        customerName: 'Acme Co',
      },
      'test',
    );
    expect(capture.status).toBe('PENDING_REVIEW');
    expect((capture as any).reviewReason).toBe('NO_RULE');
    expect((capture as any).customerName).toBe('Acme Co');

    const posted = await captures.classifyRevenueForReview(
      capture.id,
      { revenueAccountId: revenueId, receivingAccountId: receivableId, saveAsRule: true },
      'test',
    );
    expect(posted.status).toBe('POSTED');

    const rule = await prisma.revenueClassificationRule.findFirst({
      where: { category: 'product sales', paymentMethod: PaymentMethod.CREDIT },
    });
    expect(rule).not.toBeNull();
  });

  it('keeps expense and revenue anomaly history separate even when categories share a name', async () => {
    await prisma.revenueClassificationRule.create({
      data: {
        category: 'hosting',
        paymentMethod: PaymentMethod.BANK,
        revenueAccountId: revenueId,
        receivingAccountId: bankId,
      },
    });
    // Three ordinary hosting *expenses* establish an expense-side average of 10.
    for (let i = 0; i < 3; i++) {
      await captures.create(
        { description: `Hosting ${i}`, amount: 10, date: '2026-01-10', paymentMethod: PaymentMethod.BANK, category: 'hosting' },
        'test',
      );
    }
    // A much larger hosting *revenue* capture must not be judged against
    // that expense-side average — it has no revenue-side history yet, so
    // it should auto-post rather than land in review as "unusual".
    const revenueCapture = await captures.create(
      {
        type: CaptureType.REVENUE,
        description: 'Big hosting resale',
        amount: 1000,
        date: '2026-01-10',
        paymentMethod: PaymentMethod.BANK,
        category: 'hosting',
      },
      'test',
    );
    expect(revenueCapture.status).toBe('POSTED');
  });

  it('keeps classify and classify-revenue from posting the wrong capture type', async () => {
    const expenseCapture = await captures.create(
      { description: 'Mystery', amount: 10, date: '2026-01-10', paymentMethod: PaymentMethod.CREDIT, category: 'brand-new-category' },
      'test',
    );
    await expect(
      captures.classifyRevenueForReview(expenseCapture.id, { revenueAccountId: revenueId, receivingAccountId: bankId }, 'test'),
    ).rejects.toThrow(/expense capture/i);

    const revenueCapture = await captures.create(
      {
        type: CaptureType.REVENUE,
        description: 'Unmapped sale',
        amount: 10,
        date: '2026-01-10',
        paymentMethod: PaymentMethod.CREDIT,
        category: 'brand-new-revenue-category',
      },
      'test',
    );
    await expect(
      captures.classifyForReview(revenueCapture.id, { expenseAccountId: expenseId, paymentAccountId: bankId }, 'test'),
    ).rejects.toThrow(/revenue capture/i);
  });
});
