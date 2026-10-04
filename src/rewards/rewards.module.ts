import { Module } from '@nestjs/common';
import { PlayersModule } from '../players/players.module';
import { RewardsController } from './rewards.controller';
import { RewardsService } from './rewards.service';

@Module({
  imports: [PlayersModule],
  controllers: [RewardsController],
  providers: [RewardsService],
})
export class RewardsModule {}
