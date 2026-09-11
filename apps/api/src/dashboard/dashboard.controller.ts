import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { DashboardService } from './dashboard.service';
import { SetBudgetDto } from './dto/set-budget.dto';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('dashboard')
@Roles(Role.OWNER, Role.ADMIN, Role.ACCOUNTANT, Role.BOOKKEEPER)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('cashflow')
  cashflow(@Query('months') months?: string) {
    return this.dashboardService.getCashflow(months ? Number(months) : undefined);
  }

  @Get('capital')
  capital() {
    return this.dashboardService.getCapital();
  }

  @Get('related-party')
  relatedParty() {
    return this.dashboardService.getRelatedPartyBalances();
  }

  @Get('budget')
  budget(@Query('month') month: string) {
    return this.dashboardService.getBudgetVsActual(month);
  }

  @Post('budget')
  @Roles(Role.OWNER, Role.ADMIN, Role.ACCOUNTANT)
  setBudget(@Body() dto: SetBudgetDto) {
    return this.dashboardService.setBudget(dto.accountId, dto.month, dto.amount);
  }

  @Get('burn-rate')
  burnRate() {
    return this.dashboardService.getBurnRateAndRunway();
  }
}
