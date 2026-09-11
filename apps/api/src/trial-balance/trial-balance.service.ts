import { Injectable } from '@nestjs/common';
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
}
