import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface TrialBalanceRow {
  accountId: string;
  code: string;
  name: string;
  type: string;
  totalDebit: number;
  totalCredit: number;
  balance: number;
}

export interface AccountLedgerLine {
  id: string;
  entryId: string;
  date: Date;
  description: string;
  entryStatus: string;
  isReversal: boolean;
  capture: { id: string; description: string } | null;
  debit: number;
  credit: number;
  runningBalance: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

@Injectable()
export class TrialBalanceService {
  constructor(private readonly prisma: PrismaService) {}

  // Reversing entries post opposite lines, so summing every journal_line
  // regardless of the parent entry's status nets out correctly without
  // needing to special-case REVERSED entries here.
  async getTrialBalance(): Promise<{ rows: TrialBalanceRow[]; totalDebit: number; totalCredit: number }> {
    const accounts = await this.prisma.account.findMany({ orderBy: { code: 'asc' } });

    const sums = await this.prisma.journalLine.groupBy({
      by: ['accountId'],
      _sum: { debit: true, credit: true },
    });
    const sumByAccount = new Map(sums.map((s) => [s.accountId, s._sum]));

    const rows: TrialBalanceRow[] = accounts.map((account) => {
      const sum = sumByAccount.get(account.id);
      const totalDebit = Number(sum?.debit ?? 0);
      const totalCredit = Number(sum?.credit ?? 0);
      return {
        accountId: account.id,
        code: account.code,
        name: account.name,
        type: account.type,
        totalDebit,
        totalCredit,
        balance: totalDebit - totalCredit,
      };
    });

    return {
      rows: rows.filter((r) => r.totalDebit !== 0 || r.totalCredit !== 0),
      totalDebit: rows.reduce((sum, r) => sum + r.totalDebit, 0),
      totalCredit: rows.reduce((sum, r) => sum + r.totalCredit, 0),
    };
  }

  // Every journal line behind one trial-balance row, oldest first, with a
  // running balance (debit - credit, same sign convention as the trial
  // balance itself). Includes lines from REVERSED entries and their
  // reversals — the trial balance sums them all, so this has to as well or
  // the two wouldn't reconcile.
  async getAccountLedger(accountId: string) {
    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!account) {
      throw new NotFoundException(`Account ${accountId} not found`);
    }

    const lines = await this.prisma.journalLine.findMany({
      where: { accountId },
      include: { journalEntry: { include: { capture: { select: { id: true, description: true } } } } },
      orderBy: [{ journalEntry: { date: 'asc' } }, { journalEntry: { createdAt: 'asc' } }, { id: 'asc' }],
    });

    let running = 0;
    let totalDebit = 0;
    let totalCredit = 0;
    const rows: AccountLedgerLine[] = lines.map((line) => {
      const debit = Number(line.debit);
      const credit = Number(line.credit);
      totalDebit += debit;
      totalCredit += credit;
      running = round2(running + debit - credit);
      return {
        id: line.id,
        entryId: line.journalEntryId,
        date: line.journalEntry.date,
        description: line.journalEntry.description,
        entryStatus: line.journalEntry.status,
        isReversal: line.journalEntry.reversalOfId !== null,
        capture: line.journalEntry.capture,
        debit,
        credit,
        runningBalance: running,
      };
    });

    return {
      account: { id: account.id, code: account.code, name: account.name, type: account.type },
      lines: rows,
      totalDebit: round2(totalDebit),
      totalCredit: round2(totalCredit),
      balance: round2(totalDebit - totalCredit),
    };
  }
}
