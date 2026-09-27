import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ReconciliationService } from './reconciliation.service';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [ReconciliationService],
  exports: [ReconciliationService],
})
export class SchedulerModule {}
