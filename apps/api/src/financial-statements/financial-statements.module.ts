import { Module } from '@nestjs/common';
import { FinancialStatementsService } from './financial-statements.service';
import { FinancialStatementsController } from './financial-statements.controller';
import { FiscalPeriodsService } from './fiscal-periods.service';
import { FiscalPeriodsController } from './fiscal-periods.controller';
import { FsMappingsService } from './fs-mappings.service';
import { FsMappingsController } from './fs-mappings.controller';
import { FsExportService } from './fs-export.service';
import { ReconciliationModule } from '../reconciliation/reconciliation.module';

@Module({
  imports: [ReconciliationModule],
  controllers: [FinancialStatementsController, FiscalPeriodsController, FsMappingsController],
  providers: [FinancialStatementsService, FiscalPeriodsService, FsMappingsService, FsExportService],
  exports: [FinancialStatementsService],
})
export class FinancialStatementsModule {}
