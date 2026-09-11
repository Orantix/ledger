import { Body, Controller, Get, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { FsMappingsService } from './fs-mappings.service';
import { UpsertFsMappingDto } from './dto/upsert-fs-mapping.dto';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('fs-mappings')
export class FsMappingsController {
  constructor(private readonly fsMappingsService: FsMappingsService) {}

  @Get()
  findAll() {
    return this.fsMappingsService.findAll();
  }

  @Post()
  @Roles(Role.ACCOUNTANT, Role.ADMIN)
  upsert(@Body() dto: UpsertFsMappingDto) {
    return this.fsMappingsService.upsert(dto);
  }
}
