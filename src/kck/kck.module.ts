import { Module } from '@nestjs/common';
import { AddressService } from '../address/address.service';
import { PointsService } from '../points/points.service';
import { PhotoStorageService } from '../storage/photo-storage.service';
import { CityIncidentStore } from './city-incident.store';
import { KckClient } from './kck.client';
import { KckController } from './kck.controller';
import { KckService } from './kck.service';

@Module({
  controllers: [KckController],
  providers: [
    KckService,
    KckClient,
    CityIncidentStore,
    AddressService,
    PhotoStorageService,
    PointsService,
  ],
})
export class KckModule {}
