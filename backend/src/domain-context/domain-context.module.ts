import { Global, Module } from '@nestjs/common';
import { DomainContextService } from './domain-context.service';

@Global()
@Module({
  providers: [DomainContextService],
  exports: [DomainContextService],
})
export class DomainContextModule {}
