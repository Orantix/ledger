import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CreatePeriodInput {
  label: string;
  startDate: string;
  endDate: string;
}

@Injectable()
export class FiscalPeriodsService {
  constructor(private readonly prisma: PrismaService) {}

  create(input: CreatePeriodInput) {
    return this.prisma.fiscalPeriod.create({
      data: { label: input.label, startDate: new Date(input.startDate), endDate: new Date(input.endDate) },
    });
  }

  findAll() {
    return this.prisma.fiscalPeriod.findMany({ orderBy: { startDate: 'desc' } });
  }

  findOne(id: string) {
    return this.prisma.fiscalPeriod.findUniqueOrThrow({ where: { id } });
  }
}
