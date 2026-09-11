import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ReconciliationService } from './reconciliation.service';
import { ExplainFlagDto } from './dto/explain-flag.dto';
import { CreateCapitalCommitmentDto } from './dto/create-capital-commitment.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';

@Controller('reconciliation')
export class ReconciliationController {
  constructor(private readonly reconciliationService: ReconciliationService) {}

  @Get('flags')
  listFlags(@Query('periodId') periodId: string) {
    return this.reconciliationService.listFlags(periodId);
  }

  @Post('scan')
  @Roles(Role.BOOKKEEPER, Role.ACCOUNTANT, Role.OWNER, Role.ADMIN)
  scan(@Query('periodId') periodId: string) {
    return this.reconciliationService.scanPeriod(periodId);
  }

  @Post('flags/:id/explain')
  @Roles(Role.BOOKKEEPER, Role.ACCOUNTANT, Role.OWNER, Role.ADMIN)
  explain(@Param('id') id: string, @Body() dto: ExplainFlagDto, @CurrentUser() user: JwtPayload) {
    return this.reconciliationService.explainFlag(id, dto.explanation, user.email);
  }

  @Get('capital-commitments')
  listCommitments() {
    return this.reconciliationService.listCapitalCommitments();
  }

  @Post('capital-commitments')
  @Roles(Role.OWNER, Role.ADMIN, Role.ACCOUNTANT)
  createCommitment(@Body() dto: CreateCapitalCommitmentDto) {
    return this.reconciliationService.createCapitalCommitment(dto);
  }
}
