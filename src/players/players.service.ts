import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { rankFor } from '../common/domain';

@Injectable()
export class PlayersService {
  constructor(private readonly prisma: PrismaService) {}

  async createOrGetByNickname(nicknameInput: string) {
    const nickname = nicknameInput.trim();
    if (nickname.length < 2 || nickname.length > 32) {
      throw new BadRequestException('Nickname must contain 2-32 characters.');
    }

    const player = await this.prisma.player.upsert({
      where: { nickname },
      update: {},
      create: { nickname },
    });

    return this.toPublicPlayer(player);
  }

  async getById(id: string) {
    const player = await this.prisma.player.findUnique({ where: { id } });
    if (!player) throw new NotFoundException('Player not found.');
    return this.toPublicPlayer(player);
  }

  async history(id: string) {
    await this.getById(id);
    return this.prisma.pointTransaction.findMany({
      where: { playerId: id },
      orderBy: { createdAt: 'desc' },
    });
  }

  toPublicPlayer(player: {
    id: string;
    nickname: string;
    pointsBalance: number;
    totalPointsEarned: number;
  }) {
    return {
      id: player.id,
      nickname: player.nickname,
      pointsBalance: player.pointsBalance,
      totalPointsEarned: player.totalPointsEarned,
      rank: rankFor(player.totalPointsEarned),
    };
  }
}
