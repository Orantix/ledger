import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const SETTINGS_ID = 'default';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  // Upserts the singleton row on first read so every deployment gets one
  // without a manual seed step.
  get() {
    return this.prisma.orgSettings.upsert({
      where: { id: SETTINGS_ID },
      update: {},
      create: { id: SETTINGS_ID },
    });
  }

  async getBaseCurrency(): Promise<string> {
    const settings = await this.get();
    return settings.baseCurrency;
  }

  update(baseCurrency: string, updatedBy: string) {
    return this.prisma.orgSettings.upsert({
      where: { id: SETTINGS_ID },
      update: { baseCurrency, updatedBy },
      create: { id: SETTINGS_ID, baseCurrency, updatedBy },
    });
  }
}
