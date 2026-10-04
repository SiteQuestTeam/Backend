import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DEFAULT_VOTE_THRESHOLD,
  POINTS,
  VOTING_RADIUS_METERS,
  distanceMeters,
} from '../common/domain';
import { AddressService } from '../address/address.service';
import { PointsService } from '../points/points.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlayersService } from '../players/players.service';

export type CreateInitiativeInput = {
  playerId?: string;
  latitude?: number;
  longitude?: number;
  title?: string;
  shortTitle?: string;
  category?: string;
  problem?: string;
  proposedAction?: string;
  whyImportant?: string;
  resources?: {
    people?: string;
    equipment?: string;
    transport?: string;
  };
  fixer?: string;
  place?: string;
  photoUri?: string;
};

export type VoteInput = {
  playerId?: string;
  latitude?: number;
  longitude?: number;
};

@Injectable()
export class InitiativesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly players: PlayersService,
    private readonly points: PointsService,
    private readonly address: AddressService,
  ) {}

  async list(
    playerId?: string,
    viewerLatitude?: number,
    viewerLongitude?: number,
  ) {
    const initiatives = await this.prisma.initiative.findMany({
      include: {
        initiator: { select: { nickname: true } },
        votes: { select: { playerId: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return initiatives.map((initiative) =>
      this.toPublicInitiative(
        initiative,
        playerId,
        viewerLatitude,
        viewerLongitude,
      ),
    );
  }

  async getById(
    id: string,
    playerId?: string,
    viewerLatitude?: number,
    viewerLongitude?: number,
  ) {
    const initiative = await this.prisma.initiative.findUnique({
      where: { id },
      include: {
        initiator: { select: { nickname: true } },
        votes: { select: { playerId: true } },
      },
    });
    if (!initiative) throw new NotFoundException('Initiative not found.');

    return this.toPublicInitiative(
      initiative,
      playerId,
      viewerLatitude,
      viewerLongitude,
    );
  }

  async create(input: CreateInitiativeInput) {
    const playerId = this.requiredText(input.playerId, 'playerId');
    await this.players.getById(playerId);

    const latitude = this.coordinate(input.latitude, 'latitude', -90, 90);
    const longitude = this.coordinate(input.longitude, 'longitude', -180, 180);
    const title = this.requiredText(input.title, 'title', 60);
    const shortTitle = (input.shortTitle?.trim() || title).slice(0, 60);
    const category = this.requiredText(input.category, 'category', 60);
    const problem = this.requiredText(input.problem, 'problem', 1000);
    const proposedAction = this.requiredText(
      input.proposedAction,
      'proposedAction',
      1000,
    );
    const whyImportant = this.requiredText(
      input.whyImportant,
      'whyImportant',
      1000,
    );
    // Pole może być puste, np. gdy transport nie jest potrzebny.
    const people = this.optionalText(input.resources?.people, 'resources.people', 500);
    const equipment = this.optionalText(input.resources?.equipment, 'resources.equipment', 500);
    const transport = this.optionalText(input.resources?.transport, 'resources.transport', 500);
    if (!people && !equipment && !transport) {
      throw new BadRequestException('resources needs at least one field.');
    }
    // Gildia jest tylko w pitchu.
    const fixer = this.requiredText(input.fixer, 'fixer', 30);
    if (!['Miasto', 'Gracze'].includes(fixer)) {
      throw new BadRequestException('fixer must be Miasto or Gracze.');
    }
    // Miejsce: gdy aplikacja go nie poda, bierzemy adres z GPS.
    const place =
      this.optionalText(input.place, 'place', 200) ||
      (await this.placeFromGps(latitude, longitude));

    const created = await this.prisma.$transaction(async (tx) => {
      const initiative = await tx.initiative.create({
        data: {
          initiatorId: playerId,
          latitude,
          longitude,
          threshold: DEFAULT_VOTE_THRESHOLD,
          title,
          shortTitle,
          category,
          problem,
          proposedAction,
          whyImportant,
          resourcesPeople: people,
          resourcesEquipment: equipment,
          resourcesTransport: transport,
          fixer,
          place,
          photoUri: input.photoUri?.trim() || null,
        },
      });

      await this.points.award(
        playerId,
        POINTS.initiativeCreated,
        'INITIATIVE_CREATED',
        initiative.id,
        tx,
      );

      return initiative;
    });

    return {
      initiative: await this.getById(created.id, playerId, latitude, longitude),
      player: await this.players.getById(playerId),
    };
  }

  async vote(id: string, input: VoteInput) {
    const playerId = this.requiredText(input.playerId, 'playerId');
    const latitude = this.coordinate(input.latitude, 'latitude', -90, 90);
    const longitude = this.coordinate(input.longitude, 'longitude', -180, 180);

    const result = await this.prisma.$transaction(async (tx) => {
      const initiative = await tx.initiative.findUnique({ where: { id } });
      if (!initiative) throw new NotFoundException('Initiative not found.');
      if (initiative.status === 'passed') {
        throw new ConflictException('Initiative has already passed.');
      }

      const player = await tx.player.findUnique({ where: { id: playerId } });
      if (!player) throw new NotFoundException('Player not found.');

      const previousVote = await tx.vote.findUnique({
        where: { playerId_initiativeId: { playerId, initiativeId: id } },
      });
      if (previousVote) {
        throw new ConflictException('Player has already voted on this initiative.');
      }

      const distanceM = distanceMeters(
        { latitude, longitude },
        {
          latitude: initiative.latitude,
          longitude: initiative.longitude,
        },
      );
      if (distanceM > VOTING_RADIUS_METERS) {
        throw new ForbiddenException({
          message: 'Voting is only available near the initiative.',
          distanceM: Math.round(distanceM),
          allowedRadiusM: VOTING_RADIUS_METERS,
        });
      }

      const nextVotes = initiative.votesCount + 1;
      const passed = nextVotes >= initiative.threshold;
      const awarded =
        POINTS.voteCast + (passed ? POINTS.initiativePassedBonus : 0);

      await tx.vote.create({
        data: {
          playerId,
          initiativeId: id,
          latitude,
          longitude,
          distanceM,
        },
      });
      await tx.initiative.update({
        where: { id },
        data: {
          votesCount: { increment: 1 },
          status: passed ? 'passed' : 'collecting',
        },
      });
      await this.points.award(playerId, POINTS.voteCast, 'VOTE_CAST', id, tx);

      // Próg: bonus dla Inicjatora i każdego, kto oddał Głos (także tego ostatniego).
      if (passed) {
        const voters = await tx.vote.findMany({
          where: { initiativeId: id },
          select: { playerId: true },
        });
        const winners = new Set([
          initiative.initiatorId,
          ...voters.map((vote) => vote.playerId),
        ]);
        for (const winner of winners) {
          await this.points.award(
            winner,
            POINTS.initiativePassedBonus,
            'INITIATIVE_PASSED_BONUS',
            id,
            tx,
          );
        }
      }

      return { distanceM, passed, awarded };
    });

    return {
      initiative: await this.getById(id, playerId, latitude, longitude),
      player: await this.players.getById(playerId),
      awardedPoints: result.awarded,
      distanceM: Math.round(result.distanceM),
      passed: result.passed,
    };
  }

  private toPublicInitiative(
    initiative: {
      id: string;
      latitude: number;
      longitude: number;
      votesCount: number;
      threshold: number;
      status: string;
      title: string;
      shortTitle: string;
      category: string;
      problem: string;
      proposedAction: string;
      whyImportant: string;
      resourcesPeople: string;
      resourcesEquipment: string;
      resourcesTransport: string;
      fixer: string;
      place: string;
      photoUri: string | null;
      initiator: { nickname: string };
      votes: { playerId: string }[];
    },
    playerId?: string,
    viewerLatitude?: number,
    viewerLongitude?: number,
  ) {
    const hasViewerCoordinates =
      Number.isFinite(viewerLatitude) && Number.isFinite(viewerLongitude);
    const distanceM = hasViewerCoordinates
      ? distanceMeters(
          {
            latitude: viewerLatitude as number,
            longitude: viewerLongitude as number,
          },
          { latitude: initiative.latitude, longitude: initiative.longitude },
        )
      : undefined;

    return {
      id: initiative.id,
      initiator: initiative.initiator.nickname,
      latitude: initiative.latitude,
      longitude: initiative.longitude,
      votes: initiative.votesCount,
      threshold: initiative.threshold,
      status: initiative.status,
      shortTitle: initiative.shortTitle,
      marker:
        initiative.status === 'passed' ? '✓' : String(initiative.votesCount),
      hasVoted: playerId
        ? initiative.votes.some((vote) => vote.playerId === playerId)
        : false,
      distanceM: distanceM === undefined ? undefined : Math.round(distanceM),
      brief: {
        title: initiative.title,
        category: initiative.category,
        problem: initiative.problem,
        proposedAction: initiative.proposedAction,
        whyImportant: initiative.whyImportant,
        resources: {
          people: initiative.resourcesPeople,
          equipment: initiative.resourcesEquipment,
          transport: initiative.resourcesTransport,
        },
        fixer: initiative.fixer,
        place: initiative.place,
        photoUri: initiative.photoUri ?? undefined,
      },
    };
  }

  private async placeFromGps(latitude: number, longitude: number) {
    const address = await this.address.fromGps(latitude, longitude);
    const text = [address?.streetName, address?.buildingNumber]
      .filter(Boolean)
      .join(' ');
    return text || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
  }

  private optionalText(value: string | undefined, field: string, max: number) {
    const normalized = value?.trim() ?? '';
    if (normalized.length > max) {
      throw new BadRequestException(field + ' is too long.');
    }
    return normalized;
  }

  private requiredText(value: string | undefined, field: string, max = 100) {
    const normalized = value?.trim() ?? '';
    if (!normalized) throw new BadRequestException(field + ' is required.');
    if (normalized.length > max) {
      throw new BadRequestException(field + ' is too long.');
    }
    return normalized;
  }

  private coordinate(
    value: number | undefined,
    field: string,
    min: number,
    max: number,
  ) {
    if (!Number.isFinite(value) || (value as number) < min || (value as number) > max) {
      throw new BadRequestException(field + ' is invalid.');
    }
    return value as number;
  }
}
