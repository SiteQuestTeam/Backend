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

  async pointsLedger(id: string) {
    await this.getById(id);
    return this.prisma.pointTransaction.findMany({
      where: { playerId: id },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Historia na profilu: własne Inicjatywy, Usterki wysłane do KCK (z numerem)
  // i Usterki, przy których Gracz pokazał Interes. Szkiców nie pokazujemy.
  async history(id: string) {
    await this.getById(id);
    const [initiatives, cityIncidents, interests] = await Promise.all([
      this.prisma.initiative.findMany({
        where: { initiatorId: id },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          shortTitle: true,
          status: true,
          votesCount: true,
          threshold: true,
          createdAt: true,
        },
      }),
      this.prisma.cityIncident.findMany({
        where: { playerId: id, status: 'SUBMITTED' },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          category: true,
          summary: true,
          kckIncidentId: true,
          createdAt: true,
        },
      }),
      this.prisma.interest.findMany({
        where: { playerId: id },
        orderBy: { createdAt: 'desc' },
        select: {
          createdAt: true,
          cityIncident: {
            select: { id: true, category: true, summary: true, kckIncidentId: true },
          },
        },
      }),
    ]);

    return {
      initiatives,
      cityIncidents,
      interests: interests.map((interest) => ({
        ...interest.cityIncident,
        createdAt: interest.createdAt,
      })),
    };
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
