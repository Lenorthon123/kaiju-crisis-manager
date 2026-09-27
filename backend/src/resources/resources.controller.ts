import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ResourcesService } from './resources.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ActionPermissionGuard } from '../common/guards/action-permission.guard';
import { RequiresAction } from '../common/decorators/requires-action.decorator';

@Controller()
@UseGuards(JwtAuthGuard, ActionPermissionGuard)
@RequiresAction('VIEW_RESOURCES')
export class ResourcesController {
  constructor(private readonly resources: ResourcesService) {}

  @Get('resources')
  listTypes() {
    return this.resources.listResourceTypes();
  }

  @Get('stocks')
  listStocks(@Query('district') district?: string) {
    return this.resources.listStocks(district);
  }

  @Get('resources/:code/availability')
  availability(@Param('code') code: string) {
    return this.resources.availabilityByResource(code);
  }
}
