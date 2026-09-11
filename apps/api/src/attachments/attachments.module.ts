import { Module } from '@nestjs/common';
import { AttachmentsService } from './attachments.service';
import { AttachmentsController } from './attachments.controller';
import { OcrService } from './ocr.service';

@Module({
  controllers: [AttachmentsController],
  providers: [AttachmentsService, OcrService],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
