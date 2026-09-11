import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface JournalLineInput {
  accountId: string;
  debit: number;
  credit: number;
}

export interface CreateJournalEntryInput {
  date: Date;
  description: string;
  createdBy: string;
  lines: JournalLineInput[];
}

@Injectable()
export class JournalService {
  constructor(private readonly prisma: PrismaService) {}

  // Journal entries are immutable once posted. This is the only way a
  // balanced entry comes into existence — callers (classification engine,
  // manual review) never write journal_lines directly.
  async postEntry(input: CreateJournalEntryInput, tx: Prisma.TransactionClient = this.prisma) {
    this.assertBalanced(input.lines);
    await this.assertPeriodOpen(input.date, tx);

    return tx.journalEntry.create({
      data: {
        date: input.date,
        description: input.description,
        createdBy: input.createdBy,
        lines: {
          create: input.lines.map((line) => ({
            accountId: line.accountId,
            debit: line.debit,
            credit: line.credit,
          })),
        },
      },
      include: { lines: true },
    });
  }

  // Finalized periods are locked against new postings. Reversals bypass
  // this (they're always dated "now" via reverse() below) — a correction
  // must always be possible, even for a closed period.
  private async assertPeriodOpen(date: Date, tx: Prisma.TransactionClient) {
    const finalPeriod = await tx.fiscalPeriod.findFirst({
      where: { status: 'FINAL', startDate: { lte: date }, endDate: { gte: date } },
    });
    if (finalPeriod) {
      throw new BadRequestException(
        `Cannot post to ${date.toISOString().slice(0, 10)} — period "${finalPeriod.label}" is already finalized`,
      );
    }
  }

  private assertBalanced(lines: JournalLineInput[]) {
    if (lines.length < 2) {
      throw new BadRequestException('A journal entry needs at least two lines');
    }
    const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0);
    const totalCredit = lines.reduce((sum, l) => sum + l.credit, 0);
    if (Math.round((totalDebit - totalCredit) * 100) !== 0) {
      throw new BadRequestException(
        `Journal entry does not balance: debits ${totalDebit} vs credits ${totalCredit}`,
      );
    }
  }

  findAll() {
    return this.prisma.journalEntry.findMany({
      include: { lines: { include: { account: true } }, capture: true },
      orderBy: { date: 'desc' },
    });
  }

  findOne(id: string) {
    return this.prisma.journalEntry.findUniqueOrThrow({
      where: { id },
      include: { lines: { include: { account: true } }, capture: true },
    });
  }

  // Corrections never edit a posted entry. This posts an equal-and-opposite
  // entry and links both directions so the audit trail stays intact.
  async reverse(id: string, createdBy: string) {
    const original = await this.prisma.journalEntry.findUnique({
      where: { id },
      include: { lines: true, reversedBy: true },
    });
    if (!original) {
      throw new NotFoundException(`Journal entry ${id} not found`);
    }
    if (original.reversedBy) {
      throw new BadRequestException(`Journal entry ${id} was already reversed`);
    }

    return this.prisma.$transaction(async (tx) => {
      const reversal = await tx.journalEntry.create({
        data: {
          date: new Date(),
          description: `Reversal of: ${original.description}`,
          createdBy,
          reversalOfId: original.id,
          lines: {
            create: original.lines.map((line) => ({
              accountId: line.accountId,
              debit: line.credit,
              credit: line.debit,
            })),
          },
        },
        include: { lines: true },
      });

      await tx.journalEntry.update({
        where: { id: original.id },
        data: { status: 'REVERSED' },
      });

      return reversal;
    });
  }
}
