import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminAccessGuard } from './admin-access.guard';
import { AdminService } from './admin.service';

@Controller('admin')
@UseGuards(AdminAccessGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('players')
  listPlayers() {
    return this.admin.listPlayers();
  }

  @Post('players')
  createPlayer(@Body() body: { nickname?: string }) {
    return this.admin.createPlayer(body.nickname ?? '');
  }

  @Patch('players/:id')
  updatePlayer(@Param('id') id: string, @Body() body: { nickname?: string }) {
    return this.admin.updatePlayer(id, body.nickname ?? '');
  }

  @Post('players/:id/points')
  adjustPoints(
    @Param('id') id: string,
    @Body() body: { amount?: number; reason?: string },
  ) {
    return this.admin.adjustPoints(id, body.amount ?? 0, body.reason);
  }

  @Get('rewards')
  listRewards() {
    return this.admin.listRewards();
  }

  @Post('rewards')
  createReward(@Body() body: Record<string, unknown>) {
    return this.admin.createReward(body as any);
  }

  @Patch('rewards/:id')
  updateReward(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.admin.updateReward(id, body as any);
  }

  @Delete('rewards/:id')
  deleteReward(@Param('id') id: string) {
    return this.admin.deleteReward(id);
  }

  @Get('initiatives')
  listInitiatives() {
    return this.admin.listInitiatives();
  }

  @Post('initiatives')
  createInitiative(@Body() body: Record<string, unknown>) {
    return this.admin.createInitiative(body as any);
  }

  @Patch('initiatives/:id')
  updateInitiative(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.admin.updateInitiative(id, body as any);
  }

  @Get('city-incidents')
  listCityIncidents() {
    return this.admin.listCityIncidents();
  }

  @Patch('city-incidents/:id')
  updateCityIncident(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.admin.updateCityIncident(id, body as any);
  }
}
