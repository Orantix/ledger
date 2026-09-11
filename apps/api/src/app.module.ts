import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { AccountsModule } from './accounts/accounts.module';
import { ClassificationModule } from './classification/classification.module';
import { CapturesModule } from './captures/captures.module';
import { JournalModule } from './journal/journal.module';
import { TrialBalanceModule } from './trial-balance/trial-balance.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { FinancialStatementsModule } from './financial-statements/financial-statements.module';
import { ReconciliationModule } from './reconciliation/reconciliation.module';
import { DashboardModule } from './dashboard/dashboard.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    AccountsModule,
    ClassificationModule,
    CapturesModule,
    JournalModule,
    TrialBalanceModule,
    AttachmentsModule,
    FinancialStatementsModule,
    ReconciliationModule,
    DashboardModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
