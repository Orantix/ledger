import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Owner-facing views computed straight off the same journal_lines everything
// else uses — there's nothing here that isn't derivable from the ledger.
@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  private async cashAccountIds(): Promise<string[]> {
    const accounts = await this.prisma.account.findMany({ where: { isCash: true } });
    return accounts.map((a) => a.id);
  }

  // Real cash-basis view: net movement in and out of cash accounts per
  // month, distinct from the accrual net income in the income statement.
  async getCashflow(months = 6) {
    const accountIds = await this.cashAccountIds();
    if (accountIds.length === 0) {
      return { months: [], note: 'No account is flagged isCash.' };
    }

    const now = new Date();
    const results: { month: string; netChange: number }[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
      const sums = await this.prisma.journalLine.groupBy({
        by: ['accountId'],
        where: { accountId: { in: accountIds }, journalEntry: { date: { gte: start, lte: end } } },
        _sum: { debit: true, credit: true },
      });
      const netChange = round2(
        sums.reduce((sum, s) => sum + Number(s._sum.debit ?? 0) - Number(s._sum.credit ?? 0), 0),
      );
      results.push({ month: monthKey(start), netChange });
    }
    return { months: results };
  }

  async getCapital() {
    const shareCapitalAccounts = await this.prisma.account.findMany({ where: { name: 'Share Capital' } });
    const accountIds = shareCapitalAccounts.map((a) => a.id);

    const captures = accountIds.length
      ? await this.prisma.capture.findMany({
          where: { status: 'POSTED', journalEntry: { lines: { some: { accountId: { in: accountIds } } } } },
          select: { shareholderName: true, amount: true, exchangeRate: true },
        })
      : [];

    const paidInByShareholder = new Map<string, number>();
    for (const c of captures) {
      const name = c.shareholderName ?? 'Unassigned';
      const amt = Number(c.amount) * Number(c.exchangeRate);
      paidInByShareholder.set(name, (paidInByShareholder.get(name) ?? 0) + amt);
    }

    const commitments = await this.prisma.capitalCommitment.findMany();
    const names = new Set([...paidInByShareholder.keys(), ...commitments.map((c) => c.shareholderName)]);

    return [...names].map((name) => {
      const committed = commitments
        .filter((c) => c.shareholderName === name)
        .reduce((sum, c) => sum + Number(c.committedAmount), 0);
      const paidIn = round2(paidInByShareholder.get(name) ?? 0);
      return { shareholderName: name, committed: round2(committed), paidIn, shortfall: round2(committed - paidIn) };
    });
  }

  // Gross of any repayments — there's no "settle related-party balance"
  // transaction type yet, so this only reflects PERSONAL-draw captures.
  async getRelatedPartyBalances() {
    const captures = await this.prisma.capture.findMany({
      where: { status: 'POSTED', paymentMethod: 'PERSONAL' },
      select: { shareholderName: true, amount: true, exchangeRate: true },
    });
    const map = new Map<string, number>();
    for (const c of captures) {
      const name = c.shareholderName ?? 'Unassigned';
      const amt = Number(c.amount) * Number(c.exchangeRate);
      map.set(name, (map.get(name) ?? 0) + amt);
    }
    return [...map.entries()].map(([shareholderName, owed]) => ({ shareholderName, owed: round2(owed) }));
  }

  async getBudgetVsActual(month: string) {
    const [y, m] = month.split('-').map(Number);
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0, 23, 59, 59, 999);

    const budgets = await this.prisma.budget.findMany({ where: { month } });
    const accountIds = budgets.map((b) => b.accountId);
    const accounts = await this.prisma.account.findMany({ where: { id: { in: accountIds } } });
    const accountById = new Map(accounts.map((a) => [a.id, a]));

    const sums = accountIds.length
      ? await this.prisma.journalLine.groupBy({
          by: ['accountId'],
          where: { accountId: { in: accountIds }, journalEntry: { date: { gte: start, lte: end } } },
          _sum: { debit: true, credit: true },
        })
      : [];
    const sumByAccount = new Map(sums.map((s) => [s.accountId, s._sum]));

    return budgets.map((b) => {
      const account = accountById.get(b.accountId);
      const sum = sumByAccount.get(b.accountId);
      const debit = Number(sum?.debit ?? 0);
      const credit = Number(sum?.credit ?? 0);
      const actual = account?.type === 'EXPENSE' ? debit - credit : credit - debit;
      const budgeted = Number(b.amount);
      return {
        accountId: b.accountId,
        accountName: account?.name ?? 'Unknown',
        budgeted,
        actual: round2(actual),
        variance: round2(budgeted - actual),
      };
    });
  }

  setBudget(accountId: string, month: string, amount: number) {
    return this.prisma.budget.upsert({
      where: { accountId_month: { accountId, month } },
      update: { amount },
      create: { accountId, month, amount },
    });
  }

  async getBurnRateAndRunway() {
    const cashflow = await this.getCashflow(3);
    if (cashflow.months.length === 0) {
      return { burnRate: null, currentCashBalance: 0, runwayMonths: null, note: cashflow.note };
    }

    const avgNet = cashflow.months.reduce((sum, m) => sum + m.netChange, 0) / cashflow.months.length;
    const burnRate = round2(-avgNet);

    const accountIds = await this.cashAccountIds();
    const sums = await this.prisma.journalLine.groupBy({
      by: ['accountId'],
      where: { accountId: { in: accountIds } },
      _sum: { debit: true, credit: true },
    });
    const currentCashBalance = round2(
      sums.reduce((sum, s) => sum + Number(s._sum.debit ?? 0) - Number(s._sum.credit ?? 0), 0),
    );

    const runwayMonths = currentCashBalance <= 0 ? 0 : burnRate > 0 ? round2(currentCashBalance / burnRate) : null;

    return { burnRate, currentCashBalance, runwayMonths };
  }
}
