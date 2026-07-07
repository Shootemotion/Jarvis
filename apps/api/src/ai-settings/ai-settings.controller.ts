import { Body, Controller, Get, Put } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/auth-user';
import { AiSettingsService } from './ai-settings.service';
import { UpdateAiSettingsDto } from './dto';

@Controller('settings/ai')
export class AiSettingsController {
  constructor(private readonly settings: AiSettingsService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.settings.getPublic(user.id);
  }

  @Put()
  update(@CurrentUser() user: AuthUser, @Body() dto: UpdateAiSettingsDto) {
    return this.settings.update(user.id, dto);
  }
}
