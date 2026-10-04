import { Global, Module } from '@nestjs/common';
import { PhotoStorageService } from './photo-storage.service';
import { PhotosController } from './photos.controller';

@Global()
@Module({
  controllers: [PhotosController],
  providers: [PhotoStorageService],
  exports: [PhotoStorageService],
})
export class StorageModule {}
