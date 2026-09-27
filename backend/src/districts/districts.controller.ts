import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { DistrictsService } from './districts.service';
import { UpdateSeverityDto } from './dto/severity.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ActionPermissionGuard } from '../common/guards/action-permission.guard';
import { RequiresAction } from '../common/decorators/requires-action.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/authenticated-user';

@Controller('districts')
@UseGuards(JwtAuthGuard, ActionPermissionGuard)
export class DistrictsController {
  constructor(private readonly districts: DistrictsService) {}

  @Get()
  @RequiresAction('VIEW_RESOURCES')
  list() {
    return this.districts.listWithTopology();
  }

  @Get('routes')
  @RequiresAction('VIEW_RESOURCES')
  routes(@Query('from') from: string, @Query('to') to: string) {
    return this.districts.routesBetween(from, to);
  }

  @Patch(':code/severity')
  updateSeverity(
    @CurrentUser() user: AuthenticatedUser,
    @Param('code') code: string,
    @Body() dto: UpdateSeverityDto,
  ) {
    return this.districts.updateSeverity(user, code, dto.severity);
  }
}
