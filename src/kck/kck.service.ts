import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CityIncident, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { KategoriaKck, przygotujUsterkeKck } from '../ai/ai-core';
import { AddressService } from '../address/address.service';
import { NEARBY_RADIUS_METERS, POINTS, distanceMeters } from '../common/domain';
import { PointsService } from '../points/points.service';
import { PrismaService } from '../prisma/prisma.service';
import { PhotoStorageService } from '../storage/photo-storage.service';
import { KCK_CATEGORY_IDS } from './kck.constants';
import { KckAmbiguousError, KckClient, KckHttpError } from './kck.client';
import { submittedKckResponse } from './kck-response';
import {
  CityIncidentStatus,
  IncidentAddress,
  InterestInput,
  KckIncidentDto,
  SubmitKckInput,
  UploadedPhoto,
} from './kck.types';

export interface PrepareIncidentInput {
  latitude: number;
  longitude: number;
  playerId?: string;
  line?: string;
  categoryHint?: KategoriaKck | null;
}

// Mniej więcej 50 m w stopniach, do wstępnego zawężenia zapytania przed liczeniem odległości.
const LAT_DEGREES_50M = 0.0005;
const LNG_DEGREES_50M = 0.0008;

@Injectable()
export class KckService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly photos: PhotoStorageService,
    private readonly address: AddressService,
    private readonly client: KckClient,
    private readonly points: PointsService,
  ) {}

  async prepare(input: PrepareIncidentInput, photo: UploadedPhoto) {
    this.validateCoordinates(input.latitude, input.longitude);
    const playerId = await this.requirePlayer(input.playerId);

    const [aiSettled, addressSettled] = await Promise.allSettled([
      przygotujUsterkeKck(photo.buffer, {
        linia_gracza: input.line,
        kategoria: input.categoryHint,
      }),
      this.address.fromGps(input.latitude, input.longitude),
    ]);

    if (
      aiSettled.status === 'fulfilled' &&
      aiSettled.value.wynik.status === 'RETAKE'
    ) {
      return aiSettled.value.wynik;
    }

    const ai =
      aiSettled.status === 'fulfilled' && aiSettled.value.wynik.status === 'OK'
        ? aiSettled.value.wynik
        : null;
    const address =
      addressSettled.status === 'fulfilled' ? addressSettled.value : null;

    // Zdjęcie zapisujemy w SideQuest niezależnie od powodzenia AI/geocodingu.
    // Dzięki temu submit używa dokładnie tego samego Live photo co prepare.
    const storedPhoto = await this.photos.save(photo, 'kck');

    const incident = await this.prisma.cityIncident.create({
      data: {
        id: randomUUID(),
        playerId,
        latitude: input.latitude,
        longitude: input.longitude,
        category: ai?.category ?? null,
        summary: ai?.summary ?? null,
        description: ai?.description ?? null,
        streetName: address?.streetName ?? null,
        buildingNumber: address?.buildingNumber ?? null,
        zipCode: address?.zipCode ?? null,
        photoKey: storedPhoto.storageKey,
        photoMimeType: storedPhoto.mimetype,
        photoName: storedPhoto.originalName,
        photoSize: storedPhoto.size,
        status: 'PREPARED',
      },
    });

    return {
      status: 'PREPARED',
      draftId: incident.id,
      photoUrl: this.photoUrl(incident.id),
      aiAvailable: ai !== null,
      addressAvailable: address !== null,
      category: incident.category,
      serviceExternalId: incident.category
        ? KCK_CATEGORY_IDS[incident.category as KategoriaKck]
        : null,
      summary: incident.summary,
      description: incident.description,
      address,
      latitude: incident.latitude,
      longitude: incident.longitude,
      // Usterek nie ma na mapie. Pokazujemy je tylko tutaj: Gracz uczciwie mówi,
      // czy to ta sama (POST /kck/interest), czy inna (POST /kck/submit).
      nearby: await this.findNearby(incident),
    };
  }

  async submit(input: SubmitKckInput) {
    const incident = await this.getRecord(input.draftId);

    if (incident.status === 'SUBMITTED') {
      if (incident.submissionId === input.submissionId) {
        return submittedKckResponse({
          incidentId: incident.kckIncidentId,
          photoUrl: this.photoUrl(incident.id),
          pointsGranted: 0,
          pointsGrantedAt: incident.pointsGrantedAt,
          mock: !this.client.live,
        });
      }
      throw new ConflictException('Ta Usterka została już wysłana.');
    }
    if (incident.status === 'INTEREST') {
      throw new ConflictException('Ta Usterka jest już zgłoszona. Dostałeś za nią Punkty za Interes.');
    }
    if (incident.status === 'UNCERTAIN') {
      throw new ConflictException(
        'Poprzednia wysyłka ma niejednoznaczny wynik. Nie ponawiamy automatycznie zgłoszenia do KCK.',
      );
    }
    if (incident.status === 'SUBMITTING') {
      throw new ConflictException('To zgłoszenie jest już wysyłane.');
    }

    this.validateSubmission(input);

    // Atomowo: tylko jedno żądanie może przejść z PREPARED/FAILED do SUBMITTING.
    const claimed = await this.prisma.cityIncident.updateMany({
      where: { id: incident.id, status: { in: ['PREPARED', 'FAILED'] } },
      data: { status: 'SUBMITTING', submissionId: input.submissionId, lastError: null },
    });
    if (claimed.count === 0) {
      throw new ConflictException('To zgłoszenie jest już wysyłane.');
    }

    const dto: KckIncidentDto = {
      requestType: 'ISSUE',
      summary: input.summary.trim(),
      description: input.description.trim(),
      streetName: input.streetName.trim(),
      buildingNumber: input.buildingNumber.trim(),
      zipCode: input.zipCode.trim(),
      latitude: incident.latitude,
      longitude: incident.longitude,
      layer: 'Standardowa',
      object: '',
      userFirstName: '',
      userLastName: '',
      userEmail: '',
      userPhoneNumber: '',
      processingOfPersonalAgreement: false,
      emailNotificationAgreement: false,
      smsNotificationAgreement: false,
      serviceExternalId: KCK_CATEGORY_IDS[input.category],
    };

    let incidentId: string;
    try {
      const photoBuffer = await this.photos.read(incident.photoKey);
      incidentId = await this.client.submitIncident(dto, {
        buffer: photoBuffer,
        mimeType: incident.photoMimeType,
        fileName: incident.photoName,
      });
    } catch (error) {
      if (error instanceof KckAmbiguousError) {
        await this.setStatus(incident.id, 'UNCERTAIN', error.message);
        throw new ServiceUnavailableException(error.message);
      }

      const message =
        error instanceof Error ? error.message : 'Nieznany błąd wysyłki do KCK';
      await this.setStatus(incident.id, 'FAILED', message);

      if (error instanceof KckHttpError) {
        throw new BadGatewayException(error.message);
      }
      throw error;
    }

    // Punkty dopiero po incidentId z KCK. Status i Punkty w jednej transakcji, więc dokładnie raz.
    const submitted = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.cityIncident.update({
        where: { id: incident.id },
        data: {
          category: input.category,
          summary: dto.summary,
          description: dto.description,
          streetName: dto.streetName,
          buildingNumber: dto.buildingNumber,
          zipCode: dto.zipCode,
          kckIncidentId: incidentId,
          status: 'SUBMITTED',
          lastError: null,
        },
      });
      const grant = await tx.cityIncident.updateMany({
        where: { id: incident.id, pointsGrantedAt: null },
        data: { pointsGrantedAt: new Date() },
      });
      if (grant.count === 1) {
        await this.points.award(
          updated.playerId,
          POINTS.cityIncidentSubmitted,
          'CITY_INCIDENT_SUBMITTED',
          incident.id,
          tx,
        );
      }
      return {
        pointsGranted: grant.count === 1 ? POINTS.cityIncidentSubmitted : 0,
        record: await tx.cityIncident.findUniqueOrThrow({ where: { id: incident.id } }),
      };
    });

    return submittedKckResponse({
      incidentId,
      photoUrl: this.photoUrl(incident.id),
      pointsGranted: submitted.pointsGranted,
      pointsGrantedAt: submitted.record.pointsGrantedAt,
      mock: !this.client.live,
    });
  }

  // „To ta sama Usterka”: nic nie idzie do KCK, Gracz dostaje mniej Punktów niż za pierwsze zgłoszenie.
  async interest(input: InterestInput) {
    const draft = await this.getRecord(input.draftId);
    if (draft.status !== 'PREPARED' && draft.status !== 'FAILED') {
      throw new ConflictException('Ten szkic jest już wysłany albo zamknięty.');
    }

    const target = await this.getRecord(input.incidentId);
    if (target.status !== 'SUBMITTED') {
      throw new ConflictException('Można wskazać tylko Usterkę wysłaną do KCK.');
    }
    if (target.playerId === draft.playerId) {
      throw new ConflictException('To Twoje własne zgłoszenie.');
    }

    const distanceM = distanceMeters(draft, target);
    if (distanceM > NEARBY_RADIUS_METERS) {
      throw new ForbiddenException({
        message: 'Interes można pokazać tylko na miejscu.',
        distanceM: Math.round(distanceM),
        allowedRadiusM: NEARBY_RADIUS_METERS,
      });
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.interest.create({
          data: {
            playerId: draft.playerId,
            cityIncidentId: target.id,
            latitude: draft.latitude,
            longitude: draft.longitude,
            distanceM,
          },
        });
        await tx.cityIncident.update({
          where: { id: draft.id },
          data: { status: 'INTEREST' },
        });
        await this.points.award(
          draft.playerId,
          POINTS.cityIncidentInterest,
          'CITY_INCIDENT_INTEREST',
          target.id,
          tx,
        );
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Już pokazałeś Interes dla tej Usterki.');
      }
      throw error;
    }

    return {
      status: 'INTEREST',
      incidentId: target.kckIncidentId,
      pointsGranted: POINTS.cityIncidentInterest,
    };
  }

  async getIncident(id: string) {
    const incident = await this.getRecord(id);
    return {
      id: incident.id,
      status: incident.status,
      category: incident.category,
      summary: incident.summary,
      description: incident.description,
      address: this.addressOf(incident),
      latitude: incident.latitude,
      longitude: incident.longitude,
      photoUrl: this.photoUrl(incident.id),
      incidentId: incident.kckIncidentId,
      lastError: incident.lastError,
      pointsGrantedAt: incident.pointsGrantedAt,
      createdAt: incident.createdAt,
      updatedAt: incident.updatedAt,
    };
  }

  async getPhoto(id: string) {
    const incident = await this.getRecord(id);
    return {
      buffer: await this.photos.read(incident.photoKey),
      mimeType: incident.photoMimeType,
    };
  }

  private async findNearby(draft: CityIncident) {
    const candidates = await this.prisma.cityIncident.findMany({
      where: {
        status: 'SUBMITTED',
        playerId: { not: draft.playerId },
        ...(draft.category ? { category: draft.category } : {}),
        latitude: { gte: draft.latitude - LAT_DEGREES_50M, lte: draft.latitude + LAT_DEGREES_50M },
        longitude: { gte: draft.longitude - LNG_DEGREES_50M, lte: draft.longitude + LNG_DEGREES_50M },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return candidates
      .map((incident) => ({ incident, distanceM: distanceMeters(draft, incident) }))
      .filter(({ distanceM }) => distanceM <= NEARBY_RADIUS_METERS)
      .sort((a, b) => a.distanceM - b.distanceM)
      .slice(0, 5)
      .map(({ incident, distanceM }) => ({
        id: incident.id,
        category: incident.category,
        summary: incident.summary,
        description: incident.description,
        photoUrl: this.photoUrl(incident.id),
        distanceM: Math.round(distanceM),
        reportedAt: incident.createdAt,
      }));
  }

  private async requirePlayer(playerId?: string): Promise<string> {
    const id = playerId?.trim();
    if (!id) throw new BadRequestException('Wymagane playerId.');
    const player = await this.prisma.player.findUnique({ where: { id } });
    if (!player) throw new NotFoundException('Nie ma takiego Gracza.');
    return id;
  }

  private async getRecord(id: string): Promise<CityIncident> {
    const incident = await this.prisma.cityIncident.findUnique({ where: { id } });
    if (!incident) throw new NotFoundException('Nie znaleziono Usterki.');
    return incident;
  }

  private async setStatus(id: string, status: CityIncidentStatus, lastError: string) {
    await this.prisma.cityIncident.update({ where: { id }, data: { status, lastError } });
  }

  private addressOf(incident: CityIncident): IncidentAddress | null {
    if (!incident.streetName && !incident.buildingNumber && !incident.zipCode) return null;
    return {
      streetName: incident.streetName ?? '',
      buildingNumber: incident.buildingNumber ?? '',
      zipCode: incident.zipCode ?? '',
    };
  }

  private photoUrl(id: string): string {
    return `/kck/incidents/${id}/photo`;
  }

  private validateCoordinates(latitude: number, longitude: number): void {
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      throw new BadRequestException('Niepoprawna szerokość geograficzna.');
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new BadRequestException('Niepoprawna długość geograficzna.');
    }
  }

  private validateSubmission(input: SubmitKckInput): void {
    if (!input.submissionId?.trim()) {
      throw new BadRequestException('Wymagane submissionId.');
    }
    if (!Object.hasOwn(KCK_CATEGORY_IDS, input.category)) {
      throw new BadRequestException('Niepoprawna kategoria KCK.');
    }
    if (!input.summary?.trim() || input.summary.trim().length > 60) {
      throw new BadRequestException('Tytuł musi mieć 1–60 znaków.');
    }
    if (
      !input.description?.trim() ||
      input.description.trim().length > 500
    ) {
      throw new BadRequestException('Opis musi mieć 1–500 znaków.');
    }
    if (!input.streetName?.trim()) {
      throw new BadRequestException('Wymagana ulica.');
    }
    if (!input.zipCode?.trim()) {
      throw new BadRequestException('Wymagany kod pocztowy.');
    }
  }
}
