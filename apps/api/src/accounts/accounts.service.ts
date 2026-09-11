import { Injectable } from '@nestjs/common';
import { AccountType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AccountsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.account.findMany({ orderBy: { code: 'asc' } });
  }

  create(data: { code: string; name: string; type: AccountType }) {
    return this.prisma.account.create({ data });
  }
}
