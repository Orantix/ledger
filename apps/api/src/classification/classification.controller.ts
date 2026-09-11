import { Body, Controller, Get, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ClassificationService } from './classification.service';
import { UpsertRuleDto } from './dto/upsert-rule.dto';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('classification-rules')
export class ClassificationController {
  constructor(private readonly classificationService: ClassificationService) {}

  @Get()
  findAll() {
    return this.classificationService.findAll();
  }

  @Post()
  @Roles(Role.BOOKKEEPER, Role.ADMIN)
  upsert(@Body() dto: UpsertRuleDto) {
    return this.classificationService.upsertRule(dto);
  }
}
