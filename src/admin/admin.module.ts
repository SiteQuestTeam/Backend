import { Module } from '@nestjs/common';
import { PlayersModule } from '../players/players.module';
import { InitiativesModule } from '../initiatives/initiatives.module';
import { AdminAccessGuard } from './admin-access.guard';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [PlayersModule, InitiativesModule],
  controllers: [AdminController],
  providers: [AdminAccessGuard, AdminService],
  exports: [AdminAccessGuard],
})
export class AdminModule {}
