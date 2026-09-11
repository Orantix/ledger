import { Module } from '@nestjs/common';
import { TrialBalanceService } from './trial-balance.service';
import { TrialBalanceController } from './trial-balance.controller';

@Module({
  controllers: [TrialBalanceController],
  providers: [TrialBalanceService],
})
export class TrialBalanceModule {}
