import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env';
import { PrismaModule } from './prisma/prisma.module';
import { DomainContextModule } from './domain-context/domain-context.module';
import { AuditModule } from './audit/audit.module';
import { RealtimeModule } from './realtime/realtime.module';
import { AuthModule } from './auth/auth.module';
import { DistrictsModule } from './districts/districts.module';
import { ResourcesModule } from './resources/resources.module';
import { ReservationsModule } from './reservations/reservations.module';
import { TransfersModule } from './transfers/transfers.module';
import { CatastropheModule } from './catastrophe/catastrophe.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      ignoreEnvFile: process.env.NODE_ENV === 'production',
    }),
    PrismaModule,
    DomainContextModule,
    AuditModule,
    AuthModule,
    RealtimeModule,
    DistrictsModule,
    ResourcesModule,
    ReservationsModule,
    TransfersModule,
    CatastropheModule,
    SchedulerModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
