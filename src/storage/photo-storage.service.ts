import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { KCK_MAX_PHOTO_BYTES } from '../kck/kck.constants';
import { StoredPhoto, UploadedPhoto } from '../kck/kck.types';

@Injectable()
export class PhotoStorageService {
  private readonly root = process.env.UPLOAD_DIR ?? join(process.cwd(), 'data', 'uploads');

  async saveKckPhoto(photo: UploadedPhoto): Promise<StoredPhoto> {
    this.validate(photo);
    const dir = join(this.root, 'kck');
    await mkdir(dir, { recursive: true });

    const extension = this.extension(photo);
    const storageKey = `kck/${randomUUID()}${extension}`;
    await writeFile(join(this.root, storageKey), photo.buffer, { flag: 'wx' });

    return {
      storageKey,
      mimetype: photo.mimetype,
      originalName: photo.originalname,
      size: photo.size,
    };
  }

  async read(photo: StoredPhoto): Promise<Buffer> {
    try {
      return await readFile(join(this.root, photo.storageKey));
    } catch {
      throw new NotFoundException('Zdjęcie zgłoszenia nie istnieje w magazynie SideQuest.');
    }
  }

  private validate(photo: UploadedPhoto): void {
    if (!photo?.buffer?.length) throw new BadRequestException('Brak zdjęcia.');
    if (!photo.mimetype?.startsWith('image/')) throw new BadRequestException('Pole photo musi być obrazem.');
    if (photo.size <= 0 || photo.size > KCK_MAX_PHOTO_BYTES) {
      throw new BadRequestException('Zdjęcie może mieć maksymalnie 7 MiB.');
    }
  }

  private extension(photo: UploadedPhoto): string {
    const fromName = extname(photo.originalname ?? '').toLowerCase();
    if (/^\.[a-z0-9]{1,5}$/.test(fromName)) return fromName;
    const byMime: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/heic': '.heic',
      'image/heif': '.heif',
    };
    return byMime[photo.mimetype] ?? '.img';
  }
}
