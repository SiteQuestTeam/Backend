import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PlayersService } from '../players/players.service';

type RewardInput = {
  id?: string;
  title?: string;
  description?: string;
  points?: number;
  sponsor?: string;
  icon?: string;
  active?: boolean;
};

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly players: PlayersService,
  ) {}

  async listPlayers() {
    const players = await this.prisma.player.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return players.map((player) => this.players.toPublicPlayer(player));
  }

  createPlayer(nickname: string) {
    return this.players.createOrGetByNickname(nickname);
  }

  async updatePlayer(id: string, nickname: string) {
    const normalizedNickname = this.nickname(nickname);
    await this.players.getById(id);
    const player = await this.prisma.player.update({
      where: { id },
      data: { nickname: normalizedNickname },
    });
    return this.players.toPublicPlayer(player);
  }

  async adjustPoints(playerId: string, amount: number, reason?: string) {
    if (!Number.isSafeInteger(amount) || amount === 0) {
      throw new BadRequestException('Amount must be a non-zero integer.');
    }
    const player = await this.players.getById(playerId);
    if (amount < 0 && player.pointsBalance < Math.abs(amount)) {
      throw new ConflictException('Player does not have enough points.');
    }
    const reference = reason?.trim() || null;
    if (reference && reference.length > 160) {
      throw new BadRequestException('Reason must contain at most 160 characters.');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.player.update({
        where: { id: playerId },
        data:
          amount > 0
            ? {
                pointsBalance: { increment: amount },
                totalPointsEarned: { increment: amount },
              }
            : { pointsBalance: { decrement: Math.abs(amount) } },
      });
      await tx.pointTransaction.create({
        data: {
          playerId,
          amount,
          type: 'ADMIN_ADJUSTMENT',
          reference,
        },
      });
    });

    return this.players.getById(playerId);
  }

  listRewards() {
    return this.prisma.reward.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async createReward(input: RewardInput) {
    const id = this.requiredText(input.id, 'id', 64);
    return this.prisma.reward.create({
      data: {
        id,
        title: this.requiredText(input.title, 'title', 120),
        description: this.requiredText(input.description, 'description', 1000),
        points: this.points(input.points),
        sponsor: this.requiredText(input.sponsor, 'sponsor', 120),
        icon: this.requiredText(input.icon, 'icon', 80),
        active: input.active ?? true,
      },
    });
  }

  async updateReward(id: string, input: RewardInput) {
    const existing = await this.prisma.reward.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Reward not found.');
    const data = {
      ...(input.title === undefined ? {} : { title: this.requiredText(input.title, 'title', 120) }),
      ...(input.description === undefined
        ? {}
        : { description: this.requiredText(input.description, 'description', 1000) }),
      ...(input.points === undefined ? {} : { points: this.points(input.points) }),
      ...(input.sponsor === undefined ? {} : { sponsor: this.requiredText(input.sponsor, 'sponsor', 120) }),
      ...(input.icon === undefined ? {} : { icon: this.requiredText(input.icon, 'icon', 80) }),
      ...(input.active === undefined ? {} : { active: input.active }),
    };
    return this.prisma.reward.update({ where: { id }, data });
  }

  async deleteReward(id: string) {
    const reward = await this.prisma.reward.findUnique({ where: { id } });
    if (!reward) throw new NotFoundException('Reward not found.');
    if ((await this.prisma.rewardRedemption.count({ where: { rewardId: id } })) > 0) {
      throw new ConflictException('A redeemed reward cannot be deleted. Deactivate it instead.');
    }
    await this.prisma.reward.delete({ where: { id } });
  }

  private nickname(value: string) {
    const normalized = value?.trim() ?? '';
    if (normalized.length < 2 || normalized.length > 32) {
      throw new BadRequestException('Nickname must contain 2-32 characters.');
    }
    return normalized;
  }

  private requiredText(value: string | undefined, field: string, maximum: number) {
    const normalized = value?.trim() ?? '';
    if (!normalized || normalized.length > maximum) {
      throw new BadRequestException(`${field} is required and must contain at most ${maximum} characters.`);
    }
    return normalized;
  }

  private points(value: number | undefined) {
    if (value === undefined || !Number.isSafeInteger(value) || value < 1) {
      throw new BadRequestException('points must be a positive integer.');
    }
    return value;
  }
}
