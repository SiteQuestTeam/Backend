import { Module } from '@nestjs/common';
import { AiModule } from './ai/ai.module';
import { HealthModule } from './health/health.module';
import { TestPageController } from './test-page/test-page.controller';

@Module({
  imports: [HealthModule, AiModule],
  controllers: [TestPageController],
})
export class AppModule {}
