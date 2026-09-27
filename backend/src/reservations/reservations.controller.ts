import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ReservationsService } from './reservations.service';
import { CreateReservationDto } from './dto/reservation.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ActionPermissionGuard } from '../common/guards/action-permission.guard';
import { RequiresAction } from '../common/decorators/requires-action.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../auth/authenticated-user';

@Controller('reservations')
@UseGuards(JwtAuthGuard, ActionPermissionGuard)
export class ReservationsController {
  constructor(private readonly reservations: ReservationsService) {}

  @Get()
  @RequiresAction('VIEW_RESOURCES')
  list(@Query('district') district?: string, @Query('status') status?: string) {
    return this.reservations.list(district, status);
  }

  @Post()
  @RequiresAction('RESERVE_OWN_QUARTER')
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateReservationDto) {
    return this.reservations.create(user, dto);
  }

  @Delete(':id')
  @RequiresAction('RESERVE_OWN_QUARTER')
  release(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.reservations.release(user, id);
  }
}
