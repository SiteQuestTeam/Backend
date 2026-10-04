import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { RewardsService } from './rewards.service';

@Controller('rewards')
export class RewardsController {
  constructor(private readonly rewards: RewardsService) {}

  @Get()
  list() {
    return this.rewards.list();
  }

  @Post(':id/redeem')
  redeem(@Param('id') id: string, @Body() body: { playerId?: string }) {
    return this.rewards.redeem(id, body.playerId ?? '');
  }
}
