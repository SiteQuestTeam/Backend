import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { KCK_MAX_PHOTO_BYTES } from '../kck/kck.constants';
import { StoredPhoto, UploadedPhoto } from '../kck/kck.types';

export type PhotoFolder = 'kck' | 'initiatives';

const BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'image/heif': '.heif',
};

@Injectable()
export class PhotoStorageService {
  private readonly root = process.env.UPLOAD_DIR ?? join(process.cwd(), 'data', 'uploads');

  async save(photo: UploadedPhoto, folder: PhotoFolder): Promise<StoredPhoto> {
    this.validate(photo);
    await mkdir(join(this.root, folder), { recursive: true });

    const storageKey = `${folder}/${randomUUID()}${this.extension(photo)}`;
    await writeFile(join(this.root, storageKey), photo.buffer, { flag: 'wx' });

    return {
      storageKey,
      mimetype: photo.mimetype,
      originalName: photo.originalname,
      size: photo.size,
    };
  }

  async read(storageKey: string): Promise<Buffer> {
    this.checkKey(storageKey);
    try {
      return await readFile(join(this.root, storageKey));
    } catch {
      throw new NotFoundException('Zdjęcie nie istnieje w magazynie SideQuest.');
    }
  }

  mimeTypeOf(storageKey: string): string {
    const ext = extname(storageKey).toLowerCase();
    return Object.entries(BY_MIME).find(([, e]) => e === ext)?.[0] ?? 'application/octet-stream';
  }

  // Klucz przychodzi z adresu URL, więc nie wpuszczamy „..” ani innych folderów.
  private checkKey(storageKey: string): void {
    if (!/^(kck|initiatives)\/[0-9a-f-]{36}\.[a-z0-9]{1,5}$/i.test(storageKey)) {
      throw new NotFoundException('Nieprawidłowy klucz zdjęcia.');
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
    return BY_MIME[photo.mimetype] ?? '.img';
  }
}
