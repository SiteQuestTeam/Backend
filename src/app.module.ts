import { Module } from '@nestjs/common';
import { AiModule } from './ai/ai.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { PlayersModule } from './players/players.module';
import { InitiativesModule } from './initiatives/initiatives.module';
import { RewardsModule } from './rewards/rewards.module';
import { TestPageController } from './test-page/test-page.controller';

@Module({
  imports: [
    PrismaModule,
    HealthModule,
    AiModule,
    PlayersModule,
    InitiativesModule,
    RewardsModule,
  ],
  controllers: [TestPageController],
})
export class AppModule {}
