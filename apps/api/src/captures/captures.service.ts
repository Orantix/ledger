import { BadRequestException, Injectable } from '@nestjs/common';
import { CaptureStatus, Prisma, ReviewReason } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../journal/journal.service';
import { ClassificationService } from '../classification/classification.service';
import { SettingsService } from '../settings/settings.service';
import { CreateCaptureDto } from './dto/create-capture.dto';
import { UpdateCaptureDto } from './dto/update-capture.dto';
import { ReviewClassifyDto } from './dto/review-classify.dto';

// A capture posts on its own only when it's both a known category/payment
// mapping AND an unremarkable amount for that category. Anything else waits
// for a human, however confident the rule match was.
const ANOMALY_MULTIPLIER = 3;
const ANOMALY_MIN_HISTORY = 3;

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

  private async decideReviewReason(
    normalizedCategory: string,
    amount: number,
    resolved: { expenseAccountId: string; paymentAccountId: string },
  ): Promise<ReviewReason | null> {
    const accounts = await this.prisma.account.findMany({
      where: { id: { in: [resolved.expenseAccountId, resolved.paymentAccountId] } },
    });
    if (accounts.some((a) => a.sensitive)) {
      return ReviewReason.SENSITIVE_ACCOUNT;
    }

    const history = await this.prisma.capture.aggregate({
      where: { category: normalizedCategory, status: CaptureStatus.POSTED },
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

  // The heart of the pipeline: a plain-language capture either matches a
  // known rule and clears every confidence check (posts straight to the
  // ledger), or it waits in the review queue for a human. Nothing posts on
  // a guess, and sensitive accounts / unusual amounts never skip review
  // even with a deterministic rule match.
  async create(dto: CreateCaptureDto, createdBy: string) {
    const normalizedCategory = dto.category.trim().toLowerCase();
    const resolved = await this.classificationService.resolveRule(normalizedCategory, dto.paymentMethod);
    const reviewReason = resolved
      ? await this.decideReviewReason(normalizedCategory, dto.amount, resolved)
      : ReviewReason.NO_RULE;

    const baseCurrency = await this.settingsService.getBaseCurrency();
    const currency = dto.currency ?? baseCurrency;
    const exchangeRate = this.resolveExchangeRate(currency, dto.exchangeRate, baseCurrency);

    const baseData = {
      description: dto.description,
      amount: dto.amount,
      currency,
      exchangeRate,
      date: new Date(dto.date),
      paymentMethod: dto.paymentMethod,
      category: normalizedCategory,
      notes: dto.notes,
      shareholderName: dto.shareholderName,
      createdBy,
    };

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
        if (dto.attachmentIds?.length) {
          await tx.attachment.updateMany({
            where: { id: { in: dto.attachmentIds } },
            data: { captureId: capture.id },
          });
        }
        return capture;
      }

      const capture = await tx.capture.create({ data: { ...baseData, status: CaptureStatus.DRAFT } });
      if (dto.attachmentIds?.length) {
        await tx.attachment.updateMany({
          where: { id: { in: dto.attachmentIds } },
          data: { captureId: capture.id },
        });
      }

      const baseAmount = round2(dto.amount * exchangeRate);
      const entry = await this.journalService.postEntry(
        {
          date: baseData.date,
          description: `${normalizedCategory}: ${dto.description}`,
          createdBy,
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
      },
      include: {
        attachments: true,
        appliedRule: { include: { expenseAccount: true, paymentAccount: true } },
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
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
