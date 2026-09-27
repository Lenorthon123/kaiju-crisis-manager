import { Module } from '@nestjs/common';
import { CatastropheController } from './catastrophe.controller';
import { CatastropheService } from './catastrophe.service';

@Module({
  controllers: [CatastropheController],
  providers: [CatastropheService],
  exports: [CatastropheService],
})
export class CatastropheModule {}
