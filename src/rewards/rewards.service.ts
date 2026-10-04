import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PlayersService } from '../players/players.service';

@Injectable()
export class RewardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly players: PlayersService,
  ) {}

  list() {
    return this.prisma.reward.findMany({
      where: { active: true },
      orderBy: { points: 'asc' },
    });
  }

  async redeem(rewardId: string, playerId: string) {
    if (!playerId?.trim()) throw new NotFoundException('Player not found.');

    await this.prisma.$transaction(async (tx) => {
      const [player, reward, existing] = await Promise.all([
        tx.player.findUnique({ where: { id: playerId } }),
        tx.reward.findUnique({ where: { id: rewardId } }),
        tx.rewardRedemption.findUnique({
          where: { playerId_rewardId: { playerId, rewardId } },
        }),
      ]);

      if (!player) throw new NotFoundException('Player not found.');
      if (!reward || !reward.active) throw new NotFoundException('Reward not found.');
      if (existing) throw new ConflictException('Reward already redeemed.');
      if (player.pointsBalance < reward.points) {
        throw new ConflictException('Not enough points.');
      }

      await tx.player.update({
        where: { id: playerId },
        data: { pointsBalance: { decrement: reward.points } },
      });
      await tx.rewardRedemption.create({
        data: {
          playerId,
          rewardId,
          points: reward.points,
        },
      });
      await tx.pointTransaction.create({
        data: {
          playerId,
          amount: -reward.points,
          type: 'REWARD_REDEEMED',
          reference: reward.id,
        },
      });
    });

    return {
      reward: await this.prisma.reward.findUnique({ where: { id: rewardId } }),
      player: await this.players.getById(playerId),
    };
  }
}
