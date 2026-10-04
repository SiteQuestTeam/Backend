import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PlayersService } from '../players/players.service';
import { CreateInitiativeInput, InitiativesService } from '../initiatives/initiatives.service';

type RewardInput = {
  id?: string;
  title?: string;
  description?: string;
  points?: number;
  sponsor?: string;
  icon?: string;
  active?: boolean;
};

type InitiativeInput = {
  status?: string;
  threshold?: number;
};

type CityIncidentInput = {
  status?: string;
  category?: string | null;
  summary?: string | null;
  description?: string | null;
  lastError?: string | null;
};

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly players: PlayersService,
    private readonly initiatives?: InitiativesService,
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

  listInitiatives() {
    return this.prisma.initiative.findMany({
      include: { initiator: { select: { id: true, nickname: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateInitiative(id: string, input: InitiativeInput) {
    const initiative = await this.prisma.initiative.findUnique({ where: { id } });
    if (!initiative) throw new NotFoundException('Initiative not found.');
    const data = {
      ...(input.status === undefined
        ? {}
        : { status: this.initiativeStatus(input.status) }),
      ...(input.threshold === undefined
        ? {}
        : { threshold: this.threshold(input.threshold, initiative.votesCount) }),
    };
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Provide status or threshold.');
    }
    return this.prisma.initiative.update({ where: { id }, data });
  }

  createInitiative(input: CreateInitiativeInput) {
    if (!this.initiatives) throw new Error('Initiatives service is unavailable.');
    return this.initiatives.create(input);
  }

  listCityIncidents() {
    return this.prisma.cityIncident.findMany({
      include: { player: { select: { id: true, nickname: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateCityIncident(id: string, input: CityIncidentInput) {
    const status = input.status === undefined ? undefined : this.cityIncidentStatus(input.status);
    const incident = await this.prisma.cityIncident.findUnique({ where: { id } });
    if (!incident) throw new NotFoundException('City incident not found.');
    if (status && ['SUBMITTED', 'INTEREST'].includes(incident.status) && status !== incident.status) {
      throw new ConflictException('A completed city incident cannot be reopened.');
    }
    const data = {
      ...(status === undefined ? {} : { status }),
      ...(input.category === undefined
        ? {}
        : { category: this.optionalAdminText(input.category, 'category', 60) }),
      ...(input.summary === undefined
        ? {}
        : { summary: this.optionalAdminText(input.summary, 'summary', 60) }),
      ...(input.description === undefined
        ? {}
        : { description: this.optionalAdminText(input.description, 'description', 500) }),
      ...(input.lastError === undefined
        ? {}
        : { lastError: this.optionalAdminText(input.lastError, 'lastError', 500) }),
    };
    if (Object.keys(data).length === 0) {
      throw new BadRequestException('Provide at least one editable field.');
    }
    return this.prisma.cityIncident.update({ where: { id }, data });
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

  private threshold(value: number, votesCount: number) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new BadRequestException('threshold must be a positive integer.');
    }
    if (value < votesCount) {
      throw new BadRequestException('threshold cannot be lower than the existing vote count.');
    }
    return value;
  }

  private initiativeStatus(value: string) {
    if (!['collecting', 'passed'].includes(value)) {
      throw new BadRequestException('Initiative status must be collecting or passed.');
    }
    return value;
  }

  private cityIncidentStatus(value: string) {
    if (!['PREPARED', 'FAILED', 'UNCERTAIN'].includes(value)) {
      throw new BadRequestException('Invalid city incident status.');
    }
    return value;
  }

  private optionalAdminText(value: string | null, field: string, maximum: number) {
    if (value === null) return null;
    if (typeof value !== 'string' || value.trim().length > maximum) {
      throw new BadRequestException(`${field} must contain at most ${maximum} characters.`);
    }
    return value.trim() || null;
  }

}
