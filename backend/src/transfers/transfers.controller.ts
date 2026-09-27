import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { TransfersService } from './transfers.service';
import { CreateTransferDto, RejectTransferDto } from './dto/transfer.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ActionPermissionGuard } from '../common/guards/action-permission.guard';
import { RequiresAction } from '../common/decorators/requires-action.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/authenticated-user';

@Controller('transfers')
@UseGuards(JwtAuthGuard, ActionPermissionGuard)
export class TransfersController {
  constructor(private readonly transfers: TransfersService) {}

  @Get()
  @RequiresAction('VIEW_RESOURCES')
  list(@Query('district') district?: string, @Query('status') status?: string) {
    return this.transfers.list({ district, status });
  }

  @Get('pending/:districtCode')
  @RequiresAction('VIEW_RESOURCES')
  pending(@Param('districtCode') districtCode: string) {
    return this.transfers.pendingFor(districtCode);
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateTransferDto) {
    return this.transfers.request(user, dto);
  }

  @Post(':id/approve')
  approveSource(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.transfers.approveSource(user, id);
  }

  @Post(':id/legs/:legId/approve')
  approveLeg(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Param('legId') legId: string,
  ) {
    return this.transfers.approveLeg(user, id, legId);
  }

  @Post(':id/reject')
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RejectTransferDto,
  ) {
    return this.transfers.reject(user, id, dto.reason);
  }

  @Post(':id/deliver')
  deliver(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.transfers.deliver(user, id);
  }
}
