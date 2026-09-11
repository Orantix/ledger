import { BadRequestException, Injectable } from '@nestjs/common';
import { CaptureStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JournalService } from '../journal/journal.service';
import { ClassificationService } from '../classification/classification.service';
import { CreateCaptureDto } from './dto/create-capture.dto';
import { ReviewClassifyDto } from './dto/review-classify.dto';

@Injectable()
export class CapturesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journalService: JournalService,
    private readonly classificationService: ClassificationService,
  ) {}

  // The heart of the pipeline: a plain-language capture either matches a
  // known rule and posts straight to the ledger, or it waits in the review
  // queue for a human to classify it. Nothing posts on a guess.
  async create(dto: CreateCaptureDto, createdBy: string) {
    const resolved = await this.classificationService.resolveRule(dto.category, dto.paymentMethod);

    return this.prisma.$transaction(async (tx) => {
      if (!resolved) {
        return tx.capture.create({
          data: {
            description: dto.description,
            amount: dto.amount,
            date: new Date(dto.date),
            paymentMethod: dto.paymentMethod,
            category: dto.category.trim().toLowerCase(),
            notes: dto.notes,
            createdBy,
            status: CaptureStatus.PENDING_REVIEW,
          },
        });
      }

      const capture = await tx.capture.create({
        data: {
          description: dto.description,
          amount: dto.amount,
          date: new Date(dto.date),
          paymentMethod: dto.paymentMethod,
          category: dto.category.trim().toLowerCase(),
          notes: dto.notes,
          createdBy,
          status: CaptureStatus.DRAFT,
        },
      });

      const entry = await this.journalService.postEntry(
        {
          date: new Date(dto.date),
          description: `${dto.category}: ${dto.description}`,
          createdBy,
          lines: [
            { accountId: resolved.expenseAccountId, debit: dto.amount, credit: 0 },
            { accountId: resolved.paymentAccountId, debit: 0, credit: dto.amount },
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
        appliedRule: true,
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
  // rules engine so the same category/payment-method combo auto-posts next time.
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

    return this.prisma.$transaction(async (tx) => {
      const entry = await this.journalService.postEntry(
        {
          date: capture.date,
          description: `${capture.category}: ${capture.description}`,
          createdBy,
          lines: [
            { accountId: dto.expenseAccountId, debit: amount, credit: 0 },
            { accountId: dto.paymentAccountId, debit: 0, credit: amount },
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
