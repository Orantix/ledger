import { Module } from '@nestjs/common';
import { CapturesService } from './captures.service';
import { CapturesController } from './captures.controller';
import { JournalModule } from '../journal/journal.module';
import { ClassificationModule } from '../classification/classification.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [JournalModule, ClassificationModule, SettingsModule],
  controllers: [CapturesController],
  providers: [CapturesService],
})
export class CapturesModule {}
