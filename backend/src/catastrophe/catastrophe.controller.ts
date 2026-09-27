import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { CatastropheService } from './catastrophe.service';
import { LowerRetentionDto, SetLevelDto } from './dto/catastrophe.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ActionPermissionGuard } from '../common/guards/action-permission.guard';
import { RequiresAction } from '../common/decorators/requires-action.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/authenticated-user';

@Controller('catastrophe')
@UseGuards(JwtAuthGuard, ActionPermissionGuard)
export class CatastropheController {
  constructor(private readonly catastrophe: CatastropheService) {}

  @Get()
  @RequiresAction('VIEW_RESOURCES')
  current(@CurrentUser() user: AuthenticatedUser) {
    return this.catastrophe.current(user);
  }

  @Get('history')
  @RequiresAction('VIEW_RESOURCES')
  history() {
    return this.catastrophe.history();
  }

  @Put('level')
  setLevel(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetLevelDto) {
    return this.catastrophe.setLevel(user, dto);
  }

  @Post('retention-override')
  @RequiresAction('LOWER_RETENTION_THRESHOLD')
  lowerRetention(@CurrentUser() user: AuthenticatedUser, @Body() dto: LowerRetentionDto) {
    return this.catastrophe.lowerRetention(user, dto);
  }
}
