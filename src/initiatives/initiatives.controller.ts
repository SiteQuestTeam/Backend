import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { InitiativesService } from './initiatives.service';

@Controller('initiatives')
export class InitiativesController {
  constructor(private readonly initiatives: InitiativesService) {}

  @Get()
  list(
    @Query('playerId') playerId?: string,
    @Query('latitude') latitude?: string,
    @Query('longitude') longitude?: string,
  ) {
    return this.initiatives.list(
      playerId,
      this.optionalNumber(latitude),
      this.optionalNumber(longitude),
    );
  }

  @Get(':id')
  getById(
    @Param('id') id: string,
    @Query('playerId') playerId?: string,
    @Query('latitude') latitude?: string,
    @Query('longitude') longitude?: string,
  ) {
    return this.initiatives.getById(
      id,
      playerId,
      this.optionalNumber(latitude),
      this.optionalNumber(longitude),
    );
  }

  @Post()
  create(@Body() body: Parameters<InitiativesService['create']>[0]) {
    return this.initiatives.create(body);
  }

  @Post(':id/votes')
  vote(
    @Param('id') id: string,
    @Body() body: Parameters<InitiativesService['vote']>[1],
  ) {
    return this.initiatives.vote(id, body);
  }

  private optionalNumber(value?: string): number | undefined {
    if (value === undefined) return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
}
