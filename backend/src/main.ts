import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/errors/all-exceptions.filter';
import { PrismaService } from './prisma/prisma.service';

// The spec forbids a literal `*` alongside credentials, so `*` becomes "reflect
// whoever asked". A comma-separated list lets the preview deploys in too.
function parseCorsOrigin(raw: string): string[] | boolean {
  if (raw.trim() === '*') return true;
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  app.use(helmet());
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: parseCorsOrigin(config.get<string>('CORS_ORIGIN', '*')),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  await app.get(PrismaService).enableShutdownHooks(app);
  app.enableShutdownHooks();

  // Port comes from the environment, and we bind on all interfaces so the
  // hosting platform can reach us.
  const port = config.get<number>('PORT', 3000);
  await app.listen(port, '0.0.0.0');
  logger.log(`Kaiju API listening on port ${port}`);
}

void bootstrap();
