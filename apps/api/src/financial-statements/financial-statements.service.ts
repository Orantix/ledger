import { BadRequestException, Injectable } from '@nestjs/common';
import { AccountType, FiscalPeriod, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReconciliationService } from '../reconciliation/reconciliation.service';

export interface StatementRow {
  accountId: string;
  code: string;
  name: string;
  section: string;
  noteLabel: string;
  sortOrder: number;
  amount: number;
}

function dayBefore(date: Date): Date {
  return new Date(date.getTime() - 1);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function groupBySection(rows: StatementRow[]) {
  const sections = new Map<string, { section: string; rows: StatementRow[]; total: number }>();
  for (const row of [...rows].sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (!sections.has(row.section)) sections.set(row.section, { section: row.section, rows: [], total: 0 });
    const bucket = sections.get(row.section)!;
    bucket.rows.push(row);
    bucket.total = round2(bucket.total + row.amount);
  }
  return [...sections.values()];
}

// Every statement here is derived directly from journal_lines — there is no
// separate "FS system" to reconcile against the book, by construction.
@Injectable()
export class FinancialStatementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reconciliationService: ReconciliationService,
  ) {}

  async getPeriod(periodId: string): Promise<FiscalPeriod> {
    return this.prisma.fiscalPeriod.findUniqueOrThrow({ where: { id: periodId } });
  }

  private async sumLinesInRange(start: Date | undefined, end: Date | undefined) {
    const journalEntry: Prisma.JournalEntryWhereInput = {};
    if (start || end) {
      journalEntry.date = { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) };
    }
    return this.prisma.journalLine.groupBy({
      by: ['accountId'],
      where: Object.keys(journalEntry).length ? { journalEntry } : undefined,
      _sum: { debit: true, credit: true },
    });
  }

  private async accountsWithMappings(types: AccountType[]) {
    return this.prisma.account.findMany({
      where: { type: { in: types } },
      include: { fsMappings: { where: { isActive: true } } },
    });
  }

  private async computeCumulativeNetIncome(asOf: Date): Promise<number> {
    const sums = await this.sumLinesInRange(undefined, asOf);
    const sumByAccount = new Map(sums.map((s) => [s.accountId, s._sum]));
    const accounts = await this.prisma.account.findMany({ where: { type: { in: ['REVENUE', 'EXPENSE'] } } });
    let net = 0;
    for (const a of accounts) {
      const sum = sumByAccount.get(a.id);
      const debit = Number(sum?.debit ?? 0);
      const credit = Number(sum?.credit ?? 0);
      net += a.type === 'REVENUE' ? credit - debit : -(debit - credit);
    }
    return round2(net);
  }

  private async computeIncomeStatementForRange(start: Date, end: Date) {
    const sums = await this.sumLinesInRange(start, end);
    const sumByAccount = new Map(sums.map((s) => [s.accountId, s._sum]));
    const accounts = await this.accountsWithMappings(['REVENUE', 'EXPENSE']);

    const rows: StatementRow[] = [];
    const unmapped: { accountId: string; code: string; name: string }[] = [];
    let totalRevenue = 0;
    let totalExpense = 0;

    for (const a of accounts) {
      const sum = sumByAccount.get(a.id);
      const debit = Number(sum?.debit ?? 0);
      const credit = Number(sum?.credit ?? 0);
      const amount = a.type === 'REVENUE' ? round2(credit - debit) : round2(debit - credit);
      if (amount === 0) continue;

      const mapping = a.fsMappings[0];
      if (!mapping) unmapped.push({ accountId: a.id, code: a.code, name: a.name });

      rows.push({
        accountId: a.id,
        code: a.code,
        name: a.name,
        section: mapping?.section ?? 'Unmapped',
        noteLabel: mapping?.noteLabel ?? a.name,
        sortOrder: mapping?.sortOrder ?? 999,
        amount,
      });
      if (a.type === 'REVENUE') totalRevenue = round2(totalRevenue + amount);
      else totalExpense = round2(totalExpense + amount);
    }

    return {
      rows,
      bySection: groupBySection(rows),
      totalRevenue,
      totalExpense,
      netIncome: round2(totalRevenue - totalExpense),
      unmapped,
    };
  }

  async generateIncomeStatement(periodId: string, comparativePeriodId?: string) {
    const period = await this.getPeriod(periodId);
    const current = await this.computeIncomeStatementForRange(period.startDate, period.endDate);
    let comparative: Awaited<ReturnType<typeof this.computeIncomeStatementForRange>> | undefined;
    if (comparativePeriodId) {
      const cp = await this.getPeriod(comparativePeriodId);
      comparative = await this.computeIncomeStatementForRange(cp.startDate, cp.endDate);
    }
    return { period, current, comparative };
  }

  private async computeBalanceSheetAsOf(asOf: Date) {
    const sums = await this.sumLinesInRange(undefined, asOf);
    const sumByAccount = new Map(sums.map((s) => [s.accountId, s._sum]));
    const accounts = await this.accountsWithMappings(['ASSET', 'LIABILITY', 'EQUITY']);

    const rows: StatementRow[] = [];
    const unmapped: { accountId: string; code: string; name: string }[] = [];
    let totalAssets = 0;
    let totalLiabilities = 0;
    let totalEquityAccounts = 0;

    for (const a of accounts) {
      const sum = sumByAccount.get(a.id);
      const debit = Number(sum?.debit ?? 0);
      const credit = Number(sum?.credit ?? 0);
      const amount = a.type === 'ASSET' ? round2(debit - credit) : round2(credit - debit);
      if (amount === 0) continue;

      const mapping = a.fsMappings[0];
      if (!mapping) unmapped.push({ accountId: a.id, code: a.code, name: a.name });

      rows.push({
        accountId: a.id,
        code: a.code,
        name: a.name,
        section: mapping?.section ?? 'Unmapped',
        noteLabel: mapping?.noteLabel ?? a.name,
        sortOrder: mapping?.sortOrder ?? 999,
        amount,
      });
      if (a.type === 'ASSET') totalAssets = round2(totalAssets + amount);
      else if (a.type === 'LIABILITY') totalLiabilities = round2(totalLiabilities + amount);
      else totalEquityAccounts = round2(totalEquityAccounts + amount);
    }

    // Retained earnings is computed, not a literal account: cumulative
    // net income to date. This is what makes the balance sheet balance at
    // any instant without a manual period-closing journal entry.
    const retainedEarnings = await this.computeCumulativeNetIncome(asOf);
    const totalEquity = round2(totalEquityAccounts + retainedEarnings);

    return {
      rows,
      bySection: groupBySection(rows),
      totalAssets,
      totalLiabilities,
      totalEquity,
      retainedEarnings,
      balances: Math.round((totalAssets - (totalLiabilities + totalEquity)) * 100) === 0,
      unmapped,
    };
  }

  async generateBalanceSheet(periodId: string) {
    const period = await this.getPeriod(periodId);
    const asOf = await this.computeBalanceSheetAsOf(period.endDate);
    return { period, asOf };
  }

  async generateChangesInEquity(periodId: string) {
    const period = await this.getPeriod(periodId);
    const opening = await this.computeBalanceSheetAsOf(dayBefore(period.startDate));
    const closing = await this.computeBalanceSheetAsOf(period.endDate);

    const sums = await this.sumLinesInRange(period.startDate, period.endDate);
    const sumByAccount = new Map(sums.map((s) => [s.accountId, s._sum]));
    const equityAccounts = await this.accountsWithMappings(['EQUITY']);
    const movements = equityAccounts
      .map((a) => {
        const sum = sumByAccount.get(a.id);
        const amount = round2(Number(sum?.credit ?? 0) - Number(sum?.debit ?? 0));
        return { accountId: a.id, code: a.code, name: a.name, amount };
      })
      .filter((m) => m.amount !== 0);

    return {
      period,
      openingEquity: opening.totalEquity,
      movements,
      netIncomeForPeriod: round2(closing.retainedEarnings - opening.retainedEarnings),
      closingEquity: closing.totalEquity,
    };
  }

  async generateCashFlow(periodId: string) {
    const period = await this.getPeriod(periodId);
    const cashAccounts = await this.prisma.account.findMany({ where: { isCash: true } });
    const cashAccountIds = cashAccounts.map((a) => a.id);

    if (cashAccountIds.length === 0) {
      return {
        period,
        openingCash: 0,
        closingCash: 0,
        operating: 0,
        investing: 0,
        financing: 0,
        netChange: 0,
        reconciles: true,
        note: 'No account is flagged isCash — mark your Bank account(s) to enable this statement.',
      };
    }

    const openingSums = await this.sumLinesInRange(undefined, dayBefore(period.startDate));
    const closingSums = await this.sumLinesInRange(undefined, period.endDate);
    const sumFor = (rows: typeof openingSums) =>
      round2(
        rows
          .filter((r) => cashAccountIds.includes(r.accountId))
          .reduce((acc, r) => acc + Number(r._sum.debit ?? 0) - Number(r._sum.credit ?? 0), 0),
      );
    const openingCash = sumFor(openingSums);
    const closingCash = sumFor(closingSums);

    const entries = await this.prisma.journalEntry.findMany({
      where: { date: { gte: period.startDate, lte: period.endDate }, lines: { some: { accountId: { in: cashAccountIds } } } },
      include: { lines: { include: { account: { include: { fsMappings: { where: { isActive: true } } } } } } },
    });

    let operating = 0;
    let investing = 0;
    let financing = 0;
    for (const entry of entries) {
      const cashLine = entry.lines.find((l) => cashAccountIds.includes(l.accountId));
      if (!cashLine) continue;
      const cashDelta = Number(cashLine.debit) - Number(cashLine.credit);
      const counter = entry.lines.find((l) => !cashAccountIds.includes(l.accountId));
      const category = counter?.account.fsMappings[0]?.cashFlowCategory ?? 'OPERATING';
      if (category === 'INVESTING') investing = round2(investing + cashDelta);
      else if (category === 'FINANCING') financing = round2(financing + cashDelta);
      else operating = round2(operating + cashDelta);
    }

    const netChange = round2(operating + investing + financing);
    return {
      period,
      openingCash,
      closingCash,
      operating,
      investing,
      financing,
      netChange,
      reconciles: Math.round((netChange - (closingCash - openingCash)) * 100) === 0,
    };
  }

  async getNoteDetail(periodId: string, section: string, noteLabel: string) {
    const period = await this.getPeriod(periodId);
    const accounts = await this.prisma.account.findMany({
      where: { fsMappings: { some: { isActive: true, section, noteLabel } } },
    });
    const accountIds = accounts.map((a) => a.id);
    const entries = await this.prisma.journalEntry.findMany({
      where: { date: { gte: period.startDate, lte: period.endDate }, lines: { some: { accountId: { in: accountIds } } } },
      include: { lines: { include: { account: true } }, capture: { include: { attachments: true } } },
      orderBy: { date: 'asc' },
    });
    return { period, section, noteLabel, entries };
  }

  async finalizePeriod(periodId: string, userEmail: string) {
    const period = await this.getPeriod(periodId);
    if (period.status === 'FINAL') {
      throw new BadRequestException('Period is already finalized');
    }

    await this.reconciliationService.scanPeriod(periodId);
    const openFlags = await this.prisma.varianceFlag.count({ where: { periodId, status: 'OPEN' } });
    if (openFlags > 0) {
      throw new BadRequestException(
        `Cannot finalize: ${openFlags} unresolved variance flag(s) must be explained first`,
      );
    }

    const pendingCaptures = await this.prisma.capture.count({
      where: { status: 'PENDING_REVIEW', date: { gte: period.startDate, lte: period.endDate } },
    });
    if (pendingCaptures > 0) {
      throw new BadRequestException(
        `Cannot finalize: ${pendingCaptures} capture(s) in this period are still awaiting review`,
      );
    }

    return this.prisma.fiscalPeriod.update({
      where: { id: periodId },
      data: { status: 'FINAL', finalizedBy: userEmail, finalizedAt: new Date() },
    });
  }
}
