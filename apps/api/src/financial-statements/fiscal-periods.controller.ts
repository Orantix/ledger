import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { FiscalPeriodsService } from './fiscal-periods.service';
import { CreatePeriodDto } from './dto/create-period.dto';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('fiscal-periods')
export class FiscalPeriodsController {
  constructor(private readonly periodsService: FiscalPeriodsService) {}

  @Get()
  findAll() {
    return this.periodsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.periodsService.findOne(id);
  }

  @Post()
  @Roles(Role.OWNER, Role.ADMIN, Role.ACCOUNTANT)
  create(@Body() dto: CreatePeriodDto) {
    return this.periodsService.create(dto);
  }
}
