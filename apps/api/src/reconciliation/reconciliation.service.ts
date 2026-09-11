import { Injectable } from '@nestjs/common';
import { VarianceStatus, VarianceType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Surfaces exactly the kind of gap that's otherwise invisible until someone
// manually reverse-engineers it after the fact: accounts with real activity
// but no FS mapping, and capital shortfalls against what shareholders
// committed. Every flag must be explained before a period can go Final.
@Injectable()
export class ReconciliationService {
  constructor(private readonly prisma: PrismaService) {}

  async scanPeriod(periodId: string) {
    const period = await this.prisma.fiscalPeriod.findUniqueOrThrow({ where: { id: periodId } });

    const activeAccountIds = (
      await this.prisma.journalLine.groupBy({
        by: ['accountId'],
        where: { journalEntry: { date: { gte: period.startDate, lte: period.endDate } } },
      })
    ).map((r) => r.accountId);

    const mappedAccountIds = new Set(
      (
        await this.prisma.accountFsMapping.findMany({
          where: { isActive: true, accountId: { in: activeAccountIds } },
          select: { accountId: true },
        })
      ).map((m) => m.accountId),
    );

    const unmapped = await this.prisma.account.findMany({
      where: { id: { in: activeAccountIds.filter((id) => !mappedAccountIds.has(id)) } },
    });

    for (const account of unmapped) {
      await this.upsertFlag(periodId, VarianceType.UNMAPPED_ACCOUNT, account.id, {
        description: `Account ${account.code} · ${account.name} has activity this period but no FS mapping`,
        amount: null,
      });
    }
    await this.closeStaleFlags(periodId, VarianceType.UNMAPPED_ACCOUNT, unmapped.map((a) => a.id));

    const commitments = await this.prisma.capitalCommitment.findMany();
    const totalCommitted = commitments.reduce((sum, c) => sum + Number(c.committedAmount), 0);

    const shareCapitalAccounts = await this.prisma.account.findMany({
      where: { name: 'Share Capital' },
    });
    let totalPaidIn = 0;
    if (shareCapitalAccounts.length) {
      const sums = await this.prisma.journalLine.groupBy({
        by: ['accountId'],
        where: {
          accountId: { in: shareCapitalAccounts.map((a) => a.id) },
          journalEntry: { date: { lte: period.endDate } },
        },
        _sum: { credit: true, debit: true },
      });
      totalPaidIn = sums.reduce((sum, s) => sum + Number(s._sum.credit ?? 0) - Number(s._sum.debit ?? 0), 0);
    }

    const shortfall = Math.round((totalCommitted - totalPaidIn) * 100) / 100;
    if (totalCommitted > 0 && shortfall > 0) {
      await this.upsertFlag(periodId, VarianceType.CAPITAL_SHORTFALL, null, {
        description: `Committed capital exceeds paid-in capital by ${shortfall}`,
        amount: shortfall,
      });
    } else {
      await this.closeStaleFlags(periodId, VarianceType.CAPITAL_SHORTFALL, []);
    }

    return this.listFlags(periodId);
  }

  private async upsertFlag(
    periodId: string,
    type: VarianceType,
    accountId: string | null,
    data: { description: string; amount: number | null },
  ) {
    const existing = await this.prisma.varianceFlag.findFirst({
      where: { periodId, type, accountId, status: VarianceStatus.OPEN },
    });
    if (existing) {
      await this.prisma.varianceFlag.update({
        where: { id: existing.id },
        data: { description: data.description, amount: data.amount },
      });
      return;
    }
    await this.prisma.varianceFlag.create({
      data: { periodId, type, accountId: accountId ?? undefined, description: data.description, amount: data.amount },
    });
  }

  // Flags for conditions that no longer hold (e.g. an account got mapped)
  // auto-resolve rather than lingering as noise.
  private async closeStaleFlags(periodId: string, type: VarianceType, stillOpenAccountIds: string[]) {
    await this.prisma.varianceFlag.updateMany({
      where: {
        periodId,
        type,
        status: VarianceStatus.OPEN,
        accountId: stillOpenAccountIds.length ? { notIn: stillOpenAccountIds } : undefined,
      },
      data: { status: VarianceStatus.EXPLAINED, explanation: 'Auto-resolved: condition no longer applies' },
    });
  }

  listFlags(periodId: string) {
    return this.prisma.varianceFlag.findMany({ where: { periodId }, orderBy: { createdAt: 'desc' } });
  }

  async explainFlag(flagId: string, explanation: string, userEmail: string) {
    return this.prisma.varianceFlag.update({
      where: { id: flagId },
      data: { status: VarianceStatus.EXPLAINED, explanation, resolvedBy: userEmail, resolvedAt: new Date() },
    });
  }

  listCapitalCommitments() {
    return this.prisma.capitalCommitment.findMany({ orderBy: { shareholderName: 'asc' } });
  }

  createCapitalCommitment(data: { shareholderName: string; committedAmount: number; currency?: string }) {
    return this.prisma.capitalCommitment.create({
      data: {
        shareholderName: data.shareholderName,
        committedAmount: data.committedAmount,
        currency: data.currency ?? 'LKR',
      },
    });
  }
}
