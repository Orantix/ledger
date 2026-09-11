import { Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { FinancialStatementsService } from './financial-statements.service';

interface FullStatementSet {
  incomeStatement: Awaited<ReturnType<FinancialStatementsService['generateIncomeStatement']>>;
  balanceSheet: Awaited<ReturnType<FinancialStatementsService['generateBalanceSheet']>>;
  changesInEquity: Awaited<ReturnType<FinancialStatementsService['generateChangesInEquity']>>;
  cashFlow: Awaited<ReturnType<FinancialStatementsService['generateCashFlow']>>;
}

@Injectable()
export class FsExportService {
  constructor(private readonly fsService: FinancialStatementsService) {}

  private async gatherAll(periodId: string): Promise<FullStatementSet> {
    const [incomeStatement, balanceSheet, changesInEquity, cashFlow] = await Promise.all([
      this.fsService.generateIncomeStatement(periodId),
      this.fsService.generateBalanceSheet(periodId),
      this.fsService.generateChangesInEquity(periodId),
      this.fsService.generateCashFlow(periodId),
    ]);
    return { incomeStatement, balanceSheet, changesInEquity, cashFlow };
  }

  async toExcelBuffer(periodId: string): Promise<Buffer> {
    const data = await this.gatherAll(periodId);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Orantix Ledger';
    wb.created = new Date();

    const isSheet = wb.addWorksheet('Income Statement');
    isSheet.columns = [{ width: 40 }, { width: 18 }];
    isSheet.addRow([`Income Statement — ${data.incomeStatement.period.label}`]).font = { bold: true };
    isSheet.addRow([]);
    for (const section of data.incomeStatement.current.bySection) {
      isSheet.addRow([section.section]).font = { bold: true };
      for (const row of section.rows) isSheet.addRow([`  ${row.noteLabel}`, row.amount]);
      isSheet.addRow([`Total ${section.section}`, section.total]).font = { italic: true };
      isSheet.addRow([]);
    }
    isSheet.addRow(['Total Revenue', data.incomeStatement.current.totalRevenue]).font = { bold: true };
    isSheet.addRow(['Total Expenses', data.incomeStatement.current.totalExpense]).font = { bold: true };
    isSheet.addRow(['Net Income', data.incomeStatement.current.netIncome]).font = { bold: true };

    const bsSheet = wb.addWorksheet('Balance Sheet');
    bsSheet.columns = [{ width: 40 }, { width: 18 }];
    bsSheet.addRow([`Balance Sheet as of ${data.balanceSheet.period.endDate.toISOString().slice(0, 10)}`]).font = {
      bold: true,
    };
    bsSheet.addRow([]);
    for (const section of data.balanceSheet.asOf.bySection) {
      bsSheet.addRow([section.section]).font = { bold: true };
      for (const row of section.rows) bsSheet.addRow([`  ${row.noteLabel}`, row.amount]);
      bsSheet.addRow([`Total ${section.section}`, section.total]).font = { italic: true };
      bsSheet.addRow([]);
    }
    bsSheet.addRow(['Retained earnings (cumulative)', data.balanceSheet.asOf.retainedEarnings]);
    bsSheet.addRow([]);
    bsSheet.addRow(['Total Assets', data.balanceSheet.asOf.totalAssets]).font = { bold: true };
    bsSheet.addRow(['Total Liabilities', data.balanceSheet.asOf.totalLiabilities]).font = { bold: true };
    bsSheet.addRow(['Total Equity', data.balanceSheet.asOf.totalEquity]).font = { bold: true };

    const eqSheet = wb.addWorksheet('Changes in Equity');
    eqSheet.columns = [{ width: 40 }, { width: 18 }];
    eqSheet.addRow(['Opening Equity', data.changesInEquity.openingEquity]);
    for (const m of data.changesInEquity.movements) eqSheet.addRow([m.name, m.amount]);
    eqSheet.addRow(['Net Income for Period', data.changesInEquity.netIncomeForPeriod]);
    eqSheet.addRow(['Closing Equity', data.changesInEquity.closingEquity]).font = { bold: true };

    const cfSheet = wb.addWorksheet('Cash Flow');
    cfSheet.columns = [{ width: 40 }, { width: 18 }];
    cfSheet.addRow(['Opening Cash', data.cashFlow.openingCash]);
    cfSheet.addRow(['Operating Activities', data.cashFlow.operating]);
    cfSheet.addRow(['Investing Activities', data.cashFlow.investing]);
    cfSheet.addRow(['Financing Activities', data.cashFlow.financing]);
    cfSheet.addRow(['Net Change in Cash', data.cashFlow.netChange]).font = { bold: true };
    cfSheet.addRow(['Closing Cash', data.cashFlow.closingCash]).font = { bold: true };

    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  async toPdfBuffer(periodId: string): Promise<Buffer> {
    const data = await this.gatherAll(periodId);
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (c) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

    const money = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const row = (label: string, amount?: number, bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10);
      doc.text(label, { continued: amount !== undefined });
      if (amount !== undefined) doc.text(money(amount), { align: 'right' });
    };

    doc.fontSize(18).font('Helvetica-Bold').text('Orantix Ledger — Financial Statements');
    doc.fontSize(11).font('Helvetica').text(data.incomeStatement.period.label);
    doc.moveDown(1.5);

    doc.fontSize(14).font('Helvetica-Bold').text('Income Statement');
    doc.moveDown(0.5);
    for (const section of data.incomeStatement.current.bySection) {
      row(section.section, undefined, true);
      for (const r of section.rows) row(`  ${r.noteLabel}`, r.amount);
      row(`Total ${section.section}`, section.total);
      doc.moveDown(0.3);
    }
    row('Net Income', data.incomeStatement.current.netIncome, true);
    doc.moveDown(1.5);

    doc.fontSize(14).font('Helvetica-Bold').text('Balance Sheet');
    doc.moveDown(0.5);
    for (const section of data.balanceSheet.asOf.bySection) {
      row(section.section, undefined, true);
      for (const r of section.rows) row(`  ${r.noteLabel}`, r.amount);
      row(`Total ${section.section}`, section.total);
      doc.moveDown(0.3);
    }
    row('Total Assets', data.balanceSheet.asOf.totalAssets, true);
    row('Total Liabilities', data.balanceSheet.asOf.totalLiabilities, true);
    row('Total Equity', data.balanceSheet.asOf.totalEquity, true);
    doc.moveDown(1.5);

    doc.fontSize(14).font('Helvetica-Bold').text('Statement of Changes in Equity');
    doc.moveDown(0.5);
    row('Opening Equity', data.changesInEquity.openingEquity);
    for (const m of data.changesInEquity.movements) row(m.name, m.amount);
    row('Net Income for Period', data.changesInEquity.netIncomeForPeriod);
    row('Closing Equity', data.changesInEquity.closingEquity, true);
    doc.moveDown(1.5);

    doc.fontSize(14).font('Helvetica-Bold').text('Statement of Cash Flows');
    doc.moveDown(0.5);
    row('Opening Cash', data.cashFlow.openingCash);
    row('Operating Activities', data.cashFlow.operating);
    row('Investing Activities', data.cashFlow.investing);
    row('Financing Activities', data.cashFlow.financing);
    row('Net Change in Cash', data.cashFlow.netChange, true);
    row('Closing Cash', data.cashFlow.closingCash, true);

    doc.end();
    return done;
  }
}
