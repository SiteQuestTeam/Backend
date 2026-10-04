import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { PlayersModule } from './players/players.module';
import { InitiativesModule } from './initiatives/initiatives.module';
import { RewardsModule } from './rewards/rewards.module';

@Module({
  imports: [
    PrismaModule,
    HealthModule,
    PlayersModule,
    InitiativesModule,
    RewardsModule,
  ],
})
export class AppModule {}
