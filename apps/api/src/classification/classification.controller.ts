import { Body, Controller, Get, Post } from '@nestjs/common';
import { ClassificationService } from './classification.service';
import { UpsertRuleDto } from './dto/upsert-rule.dto';

@Controller('classification-rules')
export class ClassificationController {
  constructor(private readonly classificationService: ClassificationService) {}

  @Get()
  findAll() {
    return this.classificationService.findAll();
  }

  @Post()
  upsert(@Body() dto: UpsertRuleDto) {
    return this.classificationService.upsertRule(dto);
  }
}
