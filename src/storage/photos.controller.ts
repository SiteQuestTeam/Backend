import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { KCK_MAX_PHOTO_BYTES } from '../kck/kck.constants';
import { UploadedPhoto } from '../kck/kck.types';
import { PhotoStorageService } from './photo-storage.service';

interface HttpResponse {
  type(mimeType: string): HttpResponse;
  send(body: Buffer): void;
}

// Zdjęcie Inicjatywy: aplikacja wysyła plik, dostaje photoUri i podaje go w POST /initiatives.
@Controller('photos')
export class PhotosController {
  constructor(private readonly photos: PhotoStorageService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: KCK_MAX_PHOTO_BYTES, files: 1 } }))
  async upload(@UploadedFile() file: UploadedPhoto) {
    if (!file) throw new BadRequestException('Wymagane zdjęcie w polu file.');
    const stored = await this.photos.save(file, 'initiatives');
    return { photoUri: `/photos/${stored.storageKey}` };
  }

  @Get(':folder/:file')
  async get(
    @Param('folder') folder: string,
    @Param('file') file: string,
    @Res() response: HttpResponse,
  ): Promise<void> {
    const key = `${folder}/${file}`;
    const buffer = await this.photos.read(key);
    response.type(this.photos.mimeTypeOf(key)).send(buffer);
  }
}
