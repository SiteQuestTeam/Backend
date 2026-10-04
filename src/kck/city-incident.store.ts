import { Injectable, NotFoundException } from '@nestjs/common';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CityIncidentRecord } from './kck.types';

@Injectable()
export class CityIncidentStore {
  private readonly root = process.env.DATA_DIR ?? join(process.cwd(), 'data');
  private queue: Promise<void> = Promise.resolve();

  async create(record: CityIncidentRecord): Promise<CityIncidentRecord> {
    return this.serial(async () => {
      await this.write(record);
      return record;
    });
  }

  async get(id: string): Promise<CityIncidentRecord> {
    await this.queue;
    return this.read(id);
  }

  async update(
    id: string,
    mutate: (record: CityIncidentRecord) => CityIncidentRecord,
  ): Promise<CityIncidentRecord> {
    return this.serial(async () => {
      const current = await this.read(id);
      const next = mutate(current);
      next.updatedAt = new Date().toISOString();
      await this.write(next);
      return next;
    });
  }

  private async read(id: string): Promise<CityIncidentRecord> {
    try {
      const raw = await readFile(this.path(id), 'utf8');
      return JSON.parse(raw) as CityIncidentRecord;
    } catch {
      throw new NotFoundException('Nie znaleziono szkicu Usterki.');
    }
  }

  private async write(record: CityIncidentRecord): Promise<void> {
    const dir = join(this.root, 'city-incidents');
    await mkdir(dir, { recursive: true });
    const target = this.path(record.id);
    const temp = `${target}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify(record, null, 2), 'utf8');
    await rename(temp, target);
  }

  private path(id: string): string {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new NotFoundException('Nieprawidłowy identyfikator szkicu.');
    return join(this.root, 'city-incidents', `${id}.json`);
  }

  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
