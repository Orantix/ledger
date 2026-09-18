import { BadRequestException, Injectable } from '@nestjs/common';
import { CaptureStatus, CaptureType, PaymentMethod, Prisma, ReviewReason } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../journal/journal.service';
import { ClassificationService } from '../classification/classification.service';
import { SettingsService } from '../settings/settings.service';
import { CreateCaptureDto } from './dto/create-capture.dto';
import { UpdateCaptureDto } from './dto/update-capture.dto';
import { ReviewClassifyDto } from './dto/review-classify.dto';
import { ReviewClassifyRevenueDto } from './dto/review-classify-revenue.dto';

// A capture posts on its own only when it's both a known category/payment
// mapping AND an unremarkable amount for that category. Anything else waits
// for a human, however confident the rule match was.
const ANOMALY_MULTIPLIER = 3;
const ANOMALY_MIN_HISTORY = 3;

interface CaptureBaseData {
  type: CaptureType;
  description: string;
  amount: number;
  currency: string;
  exchangeRate: number;
  date: Date;
  paymentMethod: PaymentMethod;
  category: string;
  notes?: string;
  shareholderName?: string;
  customerName?: string;
  createdBy: string;
}

@Injectable()
export class CapturesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journalService: JournalService,
    private readonly classificationService: ClassificationService,
    private readonly settingsService: SettingsService,
  ) {}

  // Never let a non-base currency silently post at rate 1 — that's the
  // exact bug that got a USD invoice recorded as if it were LKR. Callers
  // pass the fully-resolved currency/exchangeRate pair (after merging any
  // partial update onto the existing capture), so this is one shared check
  // for both create and edit.
  private resolveExchangeRate(currency: string, exchangeRate: number | undefined, baseCurrency: string): number {
    if (currency === baseCurrency) {
      return 1;
    }
    if (exchangeRate === undefined) {
      throw new BadRequestException(
        `An exchange rate to ${baseCurrency} is required because this capture's currency (${currency}) differs from the base currency.`,
      );
    }
    return exchangeRate;
  }

  // Shared by both directions: any account either side resolves to can
  // force review, and the amount-anomaly check compares against history of
  // the same category AND direction (an expense category and a revenue
  // category can otherwise share a name without polluting each other's
  // average).
  private async decideReviewReason(
    normalizedCategory: string,
    amount: number,
    type: CaptureType,
    accountIds: string[],
  ): Promise<ReviewReason | null> {
    const accounts = await this.prisma.account.findMany({
      where: { id: { in: accountIds } },
    });
    if (accounts.some((a) => a.sensitive)) {
      return ReviewReason.SENSITIVE_ACCOUNT;
    }

    const history = await this.prisma.capture.aggregate({
      where: { category: normalizedCategory, type, status: CaptureStatus.POSTED },
      _avg: { amount: true },
      _count: true,
    });
    if (history._count >= ANOMALY_MIN_HISTORY && history._avg.amount) {
      const avg = Number(history._avg.amount);
      if (amount > avg * ANOMALY_MULTIPLIER) {
        return ReviewReason.UNUSUAL_AMOUNT;
      }
    }

    return null;
  }

  private async linkAttachments(tx: Prisma.TransactionClient, captureId: string, attachmentIds?: string[]) {
    if (!attachmentIds?.length) return;
    await tx.attachment.updateMany({
      where: { id: { in: attachmentIds } },
      data: { captureId },
    });
  }

  // The heart of the pipeline: a plain-language capture either matches a
  // known rule and clears every confidence check (posts straight to the
  // ledger), or it waits in the review queue for a human. Nothing posts on
  // a guess, and sensitive accounts / unusual amounts never skip review
  // even with a deterministic rule match. Dispatches on `type` — EXPENSE
  // (the default, for backward compatibility) and REVENUE post in opposite
  // debit/credit directions against entirely separate rule tables.
  async create(dto: CreateCaptureDto, createdBy: string) {
    const type = dto.type ?? CaptureType.EXPENSE;
    if (type === CaptureType.REVENUE && dto.paymentMethod === PaymentMethod.PERSONAL) {
      throw new BadRequestException(
        'Revenue can only be received via bank or on credit — PERSONAL doesn’t apply to money coming in.',
      );
    }

    const normalizedCategory = dto.category.trim().toLowerCase();
    const baseCurrency = await this.settingsService.getBaseCurrency();
    const currency = dto.currency ?? baseCurrency;
    const exchangeRate = this.resolveExchangeRate(currency, dto.exchangeRate, baseCurrency);

    const baseData: CaptureBaseData = {
      type,
      description: dto.description,
      amount: dto.amount,
      currency,
      exchangeRate,
      date: new Date(dto.date),
      paymentMethod: dto.paymentMethod,
      category: normalizedCategory,
      notes: dto.notes,
      shareholderName: dto.shareholderName,
      customerName: dto.customerName,
      createdBy,
    };

    return type === CaptureType.REVENUE
      ? this.createRevenue(dto, normalizedCategory, baseData)
      : this.createExpense(dto, normalizedCategory, baseData);
  }

  private async createExpense(dto: CreateCaptureDto, normalizedCategory: string, baseData: CaptureBaseData) {
    const resolved = await this.classificationService.resolveRule(normalizedCategory, dto.paymentMethod);
    const reviewReason = resolved
      ? await this.decideReviewReason(normalizedCategory, dto.amount, CaptureType.EXPENSE, [
          resolved.expenseAccountId,
          resolved.paymentAccountId,
        ])
      : ReviewReason.NO_RULE;

    return this.prisma.$transaction(async (tx) => {
      if (!resolved || reviewReason) {
        const capture = await tx.capture.create({
          data: {
            ...baseData,
            status: CaptureStatus.PENDING_REVIEW,
            reviewReason,
            appliedRuleId: resolved?.ruleId,
          },
        });
        await this.linkAttachments(tx, capture.id, dto.attachmentIds);
        return capture;
      }

      const capture = await tx.capture.create({ data: { ...baseData, status: CaptureStatus.DRAFT } });
      await this.linkAttachments(tx, capture.id, dto.attachmentIds);

      const baseAmount = round2(dto.amount * baseData.exchangeRate);
      const entry = await this.journalService.postEntry(
        {
          date: baseData.date,
          description: `${normalizedCategory}: ${dto.description}`,
          createdBy: baseData.createdBy,
          lines: [
            { accountId: resolved.expenseAccountId, debit: baseAmount, credit: 0 },
            { accountId: resolved.paymentAccountId, debit: 0, credit: baseAmount },
          ],
        },
        tx,
      );

      return tx.capture.update({
        where: { id: capture.id },
        data: {
          status: CaptureStatus.POSTED,
          journalEntryId: entry.id,
          appliedRuleId: resolved.ruleId,
        },
        include: { journalEntry: { include: { lines: { include: { account: true } } } }, appliedRule: true },
      });
    });
  }

  private async createRevenue(dto: CreateCaptureDto, normalizedCategory: string, baseData: CaptureBaseData) {
    const resolved = await this.classificationService.resolveRevenueRule(normalizedCategory, dto.paymentMethod);
    const reviewReason = resolved
      ? await this.decideReviewReason(normalizedCategory, dto.amount, CaptureType.REVENUE, [
          resolved.revenueAccountId,
          resolved.receivingAccountId,
        ])
      : ReviewReason.NO_RULE;

    return this.prisma.$transaction(async (tx) => {
      if (!resolved || reviewReason) {
        const capture = await tx.capture.create({
          data: {
            ...baseData,
            status: CaptureStatus.PENDING_REVIEW,
            reviewReason,
            appliedRevenueRuleId: resolved?.ruleId,
          },
        });
        await this.linkAttachments(tx, capture.id, dto.attachmentIds);
        return capture;
      }

      const capture = await tx.capture.create({ data: { ...baseData, status: CaptureStatus.DRAFT } });
      await this.linkAttachments(tx, capture.id, dto.attachmentIds);

      const baseAmount = round2(dto.amount * baseData.exchangeRate);
      const entry = await this.journalService.postEntry(
        {
          date: baseData.date,
          description: `${normalizedCategory}: ${dto.description}`,
          createdBy: baseData.createdBy,
          lines: [
            // Reverse of the expense direction: debit however it was
            // received (cash or a receivable), credit the revenue account.
            { accountId: resolved.receivingAccountId, debit: baseAmount, credit: 0 },
            { accountId: resolved.revenueAccountId, debit: 0, credit: baseAmount },
          ],
        },
        tx,
      );

      return tx.capture.update({
        where: { id: capture.id },
        data: {
          status: CaptureStatus.POSTED,
          journalEntryId: entry.id,
          appliedRevenueRuleId: resolved.ruleId,
        },
        include: {
          journalEntry: { include: { lines: { include: { account: true } } } },
          appliedRevenueRule: true,
        },
      });
    });
  }

  findAll(status?: CaptureStatus) {
    return this.prisma.capture.findMany({
      where: status ? { status } : undefined,
      include: { attachments: true, journalEntry: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  findOne(id: string) {
    return this.prisma.capture.findUniqueOrThrow({
      where: { id },
      include: {
        attachments: true,
        appliedRule: { include: { expenseAccount: true, paymentAccount: true } },
        appliedRevenueRule: { include: { revenueAccount: true, receivingAccount: true } },
        journalEntry: { include: { lines: { include: { account: true } } } },
      },
    });
  }

  // A capture is only ever an intake record until it's POSTED — no journal
  // lines exist for it yet, so correcting it here isn't an audit-trail
  // violation. Once POSTED, the JournalEntry is what's immutable; fixing a
  // mistake from there means reversing that entry, not editing the capture.
  async update(id: string, dto: UpdateCaptureDto, updatedBy: string) {
    const capture = await this.prisma.capture.findUniqueOrThrow({ where: { id } });
    if (capture.status === CaptureStatus.POSTED) {
      throw new BadRequestException(
        'This capture has already been posted to the ledger and can no longer be edited — reverse the journal entry instead.',
      );
    }
    if (capture.type === CaptureType.REVENUE && dto.paymentMethod === PaymentMethod.PERSONAL) {
      throw new BadRequestException(
        'Revenue can only be received via bank or on credit — PERSONAL doesn’t apply to money coming in.',
      );
    }

    const baseCurrency = await this.settingsService.getBaseCurrency();
    const currency = dto.currency ?? capture.currency;
    const exchangeRate = this.resolveExchangeRate(
      currency,
      dto.exchangeRate ?? (currency === capture.currency ? Number(capture.exchangeRate) : undefined),
      baseCurrency,
    );

    return this.prisma.capture.update({
      where: { id },
      data: {
        description: dto.description ?? capture.description,
        amount: dto.amount ?? capture.amount,
        currency,
        exchangeRate,
        date: dto.date ? new Date(dto.date) : capture.date,
        paymentMethod: dto.paymentMethod ?? capture.paymentMethod,
        category: dto.category ? dto.category.trim().toLowerCase() : capture.category,
        notes: dto.notes ?? capture.notes,
        shareholderName: dto.shareholderName ?? capture.shareholderName,
        customerName: dto.customerName ?? capture.customerName,
      },
      include: {
        attachments: true,
        appliedRule: { include: { expenseAccount: true, paymentAccount: true } },
        appliedRevenueRule: { include: { revenueAccount: true, receivingAccount: true } },
        journalEntry: { include: { lines: { include: { account: true } } } },
      },
    });
  }

  async addAttachment(
    captureId: string,
    file: { filename: string; mimetype: string; size: number; path: string },
  ) {
    await this.prisma.capture.findUniqueOrThrow({ where: { id: captureId } });
    return this.prisma.attachment.create({
      data: {
        captureId,
        filename: file.filename,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storagePath: file.path,
      },
    });
  }

  // Bookkeeper resolves a review-queue item by hand. Optionally teaches the
  // rules engine so the same category/payment-method combo auto-posts next
  // time (still subject to the same sensitive-account / anomaly checks).
  async classifyForReview(captureId: string, dto: ReviewClassifyDto, createdBy: string) {
    const capture = await this.prisma.capture.findUniqueOrThrow({ where: { id: captureId } });
    if (capture.status !== CaptureStatus.PENDING_REVIEW) {
      throw new BadRequestException(`Capture ${captureId} is not pending review`);
    }
    if (capture.type !== CaptureType.EXPENSE) {
      throw new BadRequestException(`Capture ${captureId} is a revenue capture — use /classify-revenue instead`);
    }

    let ruleId: string | undefined;
    if (dto.saveAsRule) {
      const rule = await this.classificationService.upsertRule({
        category: capture.category,
        paymentMethod: capture.paymentMethod,
        expenseAccountId: dto.expenseAccountId,
        paymentAccountId: dto.paymentAccountId,
      });
      ruleId = rule.id;
    }

    const amount = new Prisma.Decimal(capture.amount).toNumber();
    const exchangeRate = new Prisma.Decimal(capture.exchangeRate).toNumber();
    const baseAmount = round2(amount * exchangeRate);

    return this.prisma.$transaction(async (tx) => {
      const entry = await this.journalService.postEntry(
        {
          date: capture.date,
          description: `${capture.category}: ${capture.description}`,
          createdBy,
          lines: [
            { accountId: dto.expenseAccountId, debit: baseAmount, credit: 0 },
            { accountId: dto.paymentAccountId, debit: 0, credit: baseAmount },
          ],
        },
        tx,
      );

      return tx.capture.update({
        where: { id: captureId },
        data: { status: CaptureStatus.POSTED, journalEntryId: entry.id, appliedRuleId: ruleId },
        include: { journalEntry: { include: { lines: { include: { account: true } } } } },
      });
    });
  }

  // Revenue-side mirror of classifyForReview: debit/credit direction is
  // reversed and it teaches RevenueClassificationRule instead.
  async classifyRevenueForReview(captureId: string, dto: ReviewClassifyRevenueDto, createdBy: string) {
    const capture = await this.prisma.capture.findUniqueOrThrow({ where: { id: captureId } });
    if (capture.status !== CaptureStatus.PENDING_REVIEW) {
      throw new BadRequestException(`Capture ${captureId} is not pending review`);
    }
    if (capture.type !== CaptureType.REVENUE) {
      throw new BadRequestException(`Capture ${captureId} is an expense capture — use /classify instead`);
    }

    let ruleId: string | undefined;
    if (dto.saveAsRule) {
      const rule = await this.classificationService.upsertRevenueRule({
        category: capture.category,
        paymentMethod: capture.paymentMethod,
        revenueAccountId: dto.revenueAccountId,
        receivingAccountId: dto.receivingAccountId,
      });
      ruleId = rule.id;
    }

    const amount = new Prisma.Decimal(capture.amount).toNumber();
    const exchangeRate = new Prisma.Decimal(capture.exchangeRate).toNumber();
    const baseAmount = round2(amount * exchangeRate);

    return this.prisma.$transaction(async (tx) => {
      const entry = await this.journalService.postEntry(
        {
          date: capture.date,
          description: `${capture.category}: ${capture.description}`,
          createdBy,
          lines: [
            { accountId: dto.receivingAccountId, debit: baseAmount, credit: 0 },
            { accountId: dto.revenueAccountId, debit: 0, credit: baseAmount },
          ],
        },
        tx,
      );

      return tx.capture.update({
        where: { id: captureId },
        data: { status: CaptureStatus.POSTED, journalEntryId: entry.id, appliedRevenueRuleId: ruleId },
        include: { journalEntry: { include: { lines: { include: { account: true } } } } },
      });
    });
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
