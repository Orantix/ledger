import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { randomUUID } from 'crypto';
import { CaptureStatus } from '@prisma/client';
import { CapturesService } from './captures.service';
import { CreateCaptureDto } from './dto/create-capture.dto';
import { ReviewClassifyDto } from './dto/review-classify.dto';

const ALLOWED_MIME_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];

@Controller('captures')
export class CapturesController {
  constructor(private readonly capturesService: CapturesService) {}

  @Post()
  create(@Body() dto: CreateCaptureDto) {
    // TODO: replace hardcoded actor once auth/RBAC lands.
    return this.capturesService.create(dto, 'system');
  }

  @Get()
  findAll(@Query('status') status?: CaptureStatus) {
    return this.capturesService.findAll(status);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.capturesService.findOne(id);
  }

  @Post(':id/attachments')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: process.env.UPLOADS_DIR ?? 'uploads',
        filename: (_req, file, cb) => {
          cb(null, `${randomUUID()}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
          cb(new BadRequestException(`Unsupported file type: ${file.mimetype}`), false);
          return;
        }
        cb(null, true);
      },
      limits: { fileSize: 15 * 1024 * 1024 },
    }),
  )
  uploadAttachment(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    return this.capturesService.addAttachment(id, file);
  }

  @Post(':id/classify')
  classify(@Param('id') id: string, @Body() dto: ReviewClassifyDto) {
    // TODO: replace hardcoded actor once auth/RBAC lands.
    return this.capturesService.classifyForReview(id, dto, 'system');
  }
}
