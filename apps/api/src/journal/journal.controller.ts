import { Controller, Get, Param, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { JournalService } from './journal.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';

@Controller('journal-entries')
export class JournalController {
  constructor(private readonly journalService: JournalService) {}

  @Get()
  findAll() {
    return this.journalService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.journalService.findOne(id);
  }

  @Post(':id/reverse')
  @Roles(Role.BOOKKEEPER, Role.ADMIN)
  reverse(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.journalService.reverse(id, user.email);
  }
}
