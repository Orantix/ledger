import { Injectable } from '@nestjs/common';
import { CashFlowCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertFsMappingDto } from './dto/upsert-fs-mapping.dto';

@Injectable()
export class FsMappingsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.accountFsMapping.findMany({
      where: { isActive: true },
      include: { account: true },
      orderBy: [{ statement: 'asc' }, { sortOrder: 'asc' }],
    });
  }

  // Re-mapping supersedes rather than mutates, so a section/note relabel is
  // auditable — matches the classification rule pattern.
  async upsert(dto: UpsertFsMappingDto) {
    const existing = await this.prisma.accountFsMapping.findFirst({
      where: { accountId: dto.accountId },
      orderBy: { version: 'desc' },
    });
    if (existing) {
      await this.prisma.accountFsMapping.update({ where: { id: existing.id }, data: { isActive: false } });
    }
    return this.prisma.accountFsMapping.create({
      data: {
        accountId: dto.accountId,
        statement: dto.statement,
        section: dto.section,
        noteLabel: dto.noteLabel,
        cashFlowCategory: dto.cashFlowCategory ?? CashFlowCategory.NONE,
        sortOrder: dto.sortOrder ?? 0,
        version: (existing?.version ?? 0) + 1,
      },
    });
  }
}
