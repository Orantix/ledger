import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AccountsModule } from './accounts/accounts.module';
import { ClassificationModule } from './classification/classification.module';
import { CapturesModule } from './captures/captures.module';
import { JournalModule } from './journal/journal.module';
import { TrialBalanceModule } from './trial-balance/trial-balance.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AccountsModule,
    ClassificationModule,
    CapturesModule,
    JournalModule,
    TrialBalanceModule,
  ],
})
export class AppModule {}
