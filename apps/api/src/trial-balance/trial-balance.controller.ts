import { Controller, Get, Param } from '@nestjs/common';
import { TrialBalanceService } from './trial-balance.service';

@Controller('trial-balance')
export class TrialBalanceController {
  constructor(private readonly trialBalanceService: TrialBalanceService) {}

  @Get()
  get() {
    return this.trialBalanceService.getTrialBalance();
  }

  @Get(':accountId')
  getAccountLedger(@Param('accountId') accountId: string) {
    return this.trialBalanceService.getAccountLedger(accountId);
  }
}
