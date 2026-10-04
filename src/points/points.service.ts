import { Injectable } from '@nestjs/common';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

interface PlayerPoints {
  playerId: string;
  balance: number;
  lifetimePoints: number;
  rewardedCityIncidents: string[];
}

@Injectable()
export class PointsService {
  private readonly root = process.env.DATA_DIR ?? join(process.cwd(), 'data');
  private queue: Promise<void> = Promise.resolve();

  async awardCityIncident(
    playerId: string | null,
    draftId: string,
  ): Promise<{ granted: boolean; points: number }> {
    if (!playerId) return { granted: false, points: 0 };
    const reward = this.reward();

    return this.serial(async () => {
      const current = await this.read(playerId);
      if (current.rewardedCityIncidents.includes(draftId)) return { granted: false, points: 0 };

      current.balance += reward;
      current.lifetimePoints += reward;
      current.rewardedCityIncidents.push(draftId);
      await this.write(current);
      return { granted: true, points: reward };
    });
  }

  private reward(): number {
    const value = Number(process.env.KCK_POINTS_REWARD ?? 10);
    return Number.isInteger(value) && value >= 0 ? value : 10;
  }

  private async read(playerId: string): Promise<PlayerPoints> {
    try {
      return JSON.parse(await readFile(this.path(playerId), 'utf8')) as PlayerPoints;
    } catch {
      return { playerId, balance: 0, lifetimePoints: 0, rewardedCityIncidents: [] };
    }
  }

  private async write(points: PlayerPoints): Promise<void> {
    const dir = join(this.root, 'points');
    await mkdir(dir, { recursive: true });
    const target = this.path(points.playerId);
    const temp = `${target}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify(points, null, 2), 'utf8');
    await rename(temp, target);
  }

  private path(playerId: string): string {
    const safe = playerId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100);
    return join(this.root, 'points', `${safe || 'anonymous'}.json`);
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
