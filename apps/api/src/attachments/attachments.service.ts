import { Injectable } from '@nestjs/common';
import { ExtractionStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OcrService } from './ocr.service';

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ocrService: OcrService,
  ) {}

  // Uploaded before a capture exists so extraction can pre-fill the form;
  // linked to a capture only once one is created (see CapturesService.create).
  async uploadStandalone(file: { filename: string; mimetype: string; size: number; path: string }) {
    const attachment = await this.prisma.attachment.create({
      data: {
        filename: file.filename,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        storagePath: file.path,
        extractionStatus: ExtractionStatus.PENDING,
      },
    });

    const result = await this.ocrService.extract(file.path, file.mimetype);

    const confidence = {
      vendor: result.vendor.confidence,
      amount: result.amount.confidence,
      date: result.date.confidence,
      currency: result.currency.confidence,
    };

    return this.prisma.attachment.update({
      where: { id: attachment.id },
      data: {
        extractionStatus: result.status as ExtractionStatus,
        ocrRawText: result.rawText || null,
        extractedVendor: result.vendor.value,
        extractedAmount: result.amount.value !== null ? new Prisma.Decimal(result.amount.value) : null,
        extractedDate: result.date.value ? new Date(result.date.value) : null,
        extractedCurrency: result.currency.value,
        extractionConfidence: confidence,
      },
    });
  }

  findOne(id: string) {
    return this.prisma.attachment.findUniqueOrThrow({ where: { id } });
  }
}
