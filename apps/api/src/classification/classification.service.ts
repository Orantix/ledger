import { Injectable } from '@nestjs/common';
import { PaymentMethod } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface ResolvedRule {
  ruleId: string;
  expenseAccountId: string;
  paymentAccountId: string;
}

export interface ResolvedRevenueRule {
  ruleId: string;
  revenueAccountId: string;
  receivingAccountId: string;
}

function normalizeCategory(category: string): string {
  return category.trim().toLowerCase();
}

@Injectable()
export class ClassificationService {
  constructor(private readonly prisma: PrismaService) {}

  // Rules-only for Phase 1: a category+payment-method combo either matches a
  // known, active rule deterministically, or it doesn't match at all. No
  // fuzzy/AI guessing here — an unmatched capture goes to the review queue.
  async resolveRule(category: string, paymentMethod: PaymentMethod): Promise<ResolvedRule | null> {
    const normalized = normalizeCategory(category);
    const rule = await this.prisma.classificationRule.findFirst({
      where: { category: normalized, paymentMethod, isActive: true },
      orderBy: { version: 'desc' },
    });
    if (!rule) return null;
    return {
      ruleId: rule.id,
      expenseAccountId: rule.expenseAccountId,
      paymentAccountId: rule.paymentAccountId,
    };
  }

  // Creates (or supersedes) the rule for a category+payment-method combo.
  // Superseding bumps the version rather than mutating the old row, so
  // re-mapping stays auditable per the spec.
  async upsertRule(params: {
    category: string;
    paymentMethod: PaymentMethod;
    expenseAccountId: string;
    paymentAccountId: string;
  }) {
    const normalized = normalizeCategory(params.category);
    const existing = await this.prisma.classificationRule.findFirst({
      where: { category: normalized, paymentMethod: params.paymentMethod },
      orderBy: { version: 'desc' },
    });

    if (existing) {
      await this.prisma.classificationRule.update({
        where: { id: existing.id },
        data: { isActive: false },
      });
    }

    return this.prisma.classificationRule.create({
      data: {
        category: normalized,
        paymentMethod: params.paymentMethod,
        expenseAccountId: params.expenseAccountId,
        paymentAccountId: params.paymentAccountId,
        version: (existing?.version ?? 0) + 1,
      },
    });
  }

  findAll() {
    return this.prisma.classificationRule.findMany({
      where: { isActive: true },
      include: { expenseAccount: true, paymentAccount: true },
      orderBy: [{ category: 'asc' }, { paymentMethod: 'asc' }],
    });
  }

  // Revenue-side mirror of resolveRule/upsertRule/findAll above, against
  // the separate RevenueClassificationRule table.
  async resolveRevenueRule(category: string, paymentMethod: PaymentMethod): Promise<ResolvedRevenueRule | null> {
    const normalized = normalizeCategory(category);
    const rule = await this.prisma.revenueClassificationRule.findFirst({
      where: { category: normalized, paymentMethod, isActive: true },
      orderBy: { version: 'desc' },
    });
    if (!rule) return null;
    return {
      ruleId: rule.id,
      revenueAccountId: rule.revenueAccountId,
      receivingAccountId: rule.receivingAccountId,
    };
  }

  async upsertRevenueRule(params: {
    category: string;
    paymentMethod: PaymentMethod;
    revenueAccountId: string;
    receivingAccountId: string;
  }) {
    const normalized = normalizeCategory(params.category);
    const existing = await this.prisma.revenueClassificationRule.findFirst({
      where: { category: normalized, paymentMethod: params.paymentMethod },
      orderBy: { version: 'desc' },
    });

    if (existing) {
      await this.prisma.revenueClassificationRule.update({
        where: { id: existing.id },
        data: { isActive: false },
      });
    }

    return this.prisma.revenueClassificationRule.create({
      data: {
        category: normalized,
        paymentMethod: params.paymentMethod,
        revenueAccountId: params.revenueAccountId,
        receivingAccountId: params.receivingAccountId,
        version: (existing?.version ?? 0) + 1,
      },
    });
  }

  findAllRevenueRules() {
    return this.prisma.revenueClassificationRule.findMany({
      where: { isActive: true },
      include: { revenueAccount: true, receivingAccount: true },
      orderBy: [{ category: 'asc' }, { paymentMethod: 'asc' }],
    });
  }
}
