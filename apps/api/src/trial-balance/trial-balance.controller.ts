import { Controller, Get } from '@nestjs/common';
import { TrialBalanceService } from './trial-balance.service';

@Controller('trial-balance')
export class TrialBalanceController {
  constructor(private readonly trialBalanceService: TrialBalanceService) {}

  @Get()
  get() {
    return this.trialBalanceService.getTrialBalance();
  }
}
