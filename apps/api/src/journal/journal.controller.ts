import { Controller, Get, Param, Post } from '@nestjs/common';
import { JournalService } from './journal.service';

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
  reverse(@Param('id') id: string) {
    // TODO: replace hardcoded actor once auth/RBAC lands.
    return this.journalService.reverse(id, 'system');
  }
}
