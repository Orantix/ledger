import { Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { Role } from '@prisma/client';
import { FinancialStatementsService } from './financial-statements.service';
import { FsExportService } from './fs-export.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';

@Controller('financial-statements')
export class FinancialStatementsController {
  constructor(
    private readonly fsService: FinancialStatementsService,
    private readonly fsExportService: FsExportService,
  ) {}

  @Get(':periodId/income-statement')
  incomeStatement(@Param('periodId') periodId: string, @Query('comparativePeriodId') comparativePeriodId?: string) {
    return this.fsService.generateIncomeStatement(periodId, comparativePeriodId);
  }

  @Get(':periodId/balance-sheet')
  balanceSheet(@Param('periodId') periodId: string) {
    return this.fsService.generateBalanceSheet(periodId);
  }

  @Get(':periodId/changes-in-equity')
  changesInEquity(@Param('periodId') periodId: string) {
    return this.fsService.generateChangesInEquity(periodId);
  }

  @Get(':periodId/cash-flow')
  cashFlow(@Param('periodId') periodId: string) {
    return this.fsService.generateCashFlow(periodId);
  }

  @Get(':periodId/notes')
  notes(@Param('periodId') periodId: string, @Query('section') section: string, @Query('noteLabel') noteLabel: string) {
    return this.fsService.getNoteDetail(periodId, section, noteLabel);
  }

  @Post(':periodId/finalize')
  @Roles(Role.OWNER, Role.ADMIN)
  finalize(@Param('periodId') periodId: string, @CurrentUser() user: JwtPayload) {
    return this.fsService.finalizePeriod(periodId, user.email);
  }

  @Get(':periodId/export.xlsx')
  async exportExcel(@Param('periodId') periodId: string, @Res() res: Response) {
    const buffer = await this.fsExportService.toExcelBuffer(periodId);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="financial-statements-${periodId}.xlsx"`);
    res.send(buffer);
  }

  @Get(':periodId/export.pdf')
  async exportPdf(@Param('periodId') periodId: string, @Res() res: Response) {
    const buffer = await this.fsExportService.toPdfBuffer(periodId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="financial-statements-${periodId}.pdf"`);
    res.send(buffer);
  }
}
