import { Module } from '@nestjs/common';
import { KckClient } from './kck.client';
import { KckController } from './kck.controller';
import { KckService } from './kck.service';

// PrismaService, PointsService, AddressService i PhotoStorageService są globalne.
@Module({
  controllers: [KckController],
  providers: [KckService, KckClient],
})
export class KckModule {}
