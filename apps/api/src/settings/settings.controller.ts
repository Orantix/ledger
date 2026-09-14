import { Body, Controller, Get, Patch } from '@nestjs/common';
import { Role } from '@prisma/client';
import { SettingsService } from './settings.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/auth.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  // No @Roles(): any authenticated user needs this to know the base
  // currency when filling in a capture.
  @Get()
  get() {
    return this.settingsService.get();
  }

  @Patch()
  @Roles(Role.OWNER, Role.ADMIN)
  update(@Body() dto: UpdateSettingsDto, @CurrentUser() user: JwtPayload) {
    return this.settingsService.update(dto.baseCurrency, user.email);
  }
}
