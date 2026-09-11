import { Body, Controller, Get, Post } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Get()
  findAll() {
    return this.accountsService.findAll();
  }

  @Post()
  @Roles(Role.ADMIN)
  create(@Body() dto: CreateAccountDto) {
    return this.accountsService.create(dto);
  }
}
