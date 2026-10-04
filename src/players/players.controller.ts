import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { PlayersService } from './players.service';

@Controller('players')
export class PlayersController {
  constructor(private readonly players: PlayersService) {}

  @Post('session')
  createSession(@Body() body: { nickname?: string }) {
    return this.players.createOrGetByNickname(body.nickname ?? '');
  }

  @Get(':id')
  getPlayer(@Param('id') id: string) {
    return this.players.getById(id);
  }

  @Get(':id/points')
  getPointsHistory(@Param('id') id: string) {
    return this.players.pointsLedger(id);
  }

  @Get(':id/history')
  getHistory(@Param('id') id: string) {
    return this.players.history(id);
  }
}
