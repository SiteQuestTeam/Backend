import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { KategoriaKck, przygotujUsterkeKck } from '../ai/ai-core';
import { AddressService } from '../address/address.service';
import { PointsService } from '../points/points.service';
import { PhotoStorageService } from '../storage/photo-storage.service';
import { CityIncidentStore } from './city-incident.store';
import { KCK_CATEGORY_IDS } from './kck.constants';
import { KckAmbiguousError, KckClient, KckHttpError } from './kck.client';
import {
  CityIncidentRecord,
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

@Injectable()
export class KckService {
  constructor(
    private readonly photos: PhotoStorageService,
    private readonly incidents: CityIncidentStore,
    private readonly address: AddressService,
    private readonly client: KckClient,
    private readonly points: PointsService,
  ) {}

  async prepare(input: PrepareIncidentInput, photo: UploadedPhoto) {
    this.validateCoordinates(input.latitude, input.longitude);

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
      return { status: 'RETAKE', ...aiSettled.value.wynik };
    }

    const ai =
      aiSettled.status === 'fulfilled' && aiSettled.value.wynik.status === 'OK'
        ? aiSettled.value.wynik
        : null;
    const address =
      addressSettled.status === 'fulfilled' ? addressSettled.value : null;

    // Zdjęcie zapisujemy w SideQuest niezależnie od powodzenia AI/geocodingu.
    // Dzięki temu submit używa dokładnie tego samego Live photo co prepare.
    const storedPhoto = await this.photos.saveKckPhoto(photo);
    const draftId = randomUUID();
    const now = new Date().toISOString();

    const record: CityIncidentRecord = {
      id: draftId,
      playerId: input.playerId?.trim() || null,
      latitude: input.latitude,
      longitude: input.longitude,
      category: ai?.category ?? null,
      summary: ai?.summary ?? null,
      description: ai?.description ?? null,
      address,
      photo: storedPhoto,
      status: 'PREPARED',
      submissionId: null,
      kckIncidentId: null,
      lastError: null,
      pointsGrantedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    await this.incidents.create(record);

    return {
      status: 'PREPARED',
      draftId,
      photoUrl: `/kck/incidents/${draftId}/photo`,
      aiAvailable: ai !== null,
      addressAvailable: address !== null,
      category: record.category,
      serviceExternalId: record.category
        ? KCK_CATEGORY_IDS[record.category]
        : null,
      summary: record.summary,
      description: record.description,
      address: record.address,
      latitude: record.latitude,
      longitude: record.longitude,
    };
  }

  async submit(input: SubmitKckInput) {
    const incident = await this.incidents.get(input.draftId);

    if (incident.status === 'SUBMITTED') {
      if (incident.submissionId === input.submissionId) {
        return {
          status: 'SUBMITTED',
          incidentId: incident.kckIncidentId,
          pointsGrantedAt: incident.pointsGrantedAt,
        };
      }
      throw new ConflictException('Ta Usterka została już wysłana.');
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

    await this.incidents.update(incident.id, (current) => ({
      ...current,
      status: 'SUBMITTING',
      submissionId: input.submissionId,
      lastError: null,
    }));

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

    try {
      const photoBuffer = await this.photos.read(incident.photo);
      const incidentId = await this.client.submitIncident(dto, {
        buffer: photoBuffer,
        mimeType: incident.photo.mimetype,
        fileName: incident.photo.originalName,
      });

      let submitted = await this.incidents.update(incident.id, (current) => ({
        ...current,
        category: input.category,
        summary: dto.summary,
        description: dto.description,
        address: {
          streetName: dto.streetName,
          buildingNumber: dto.buildingNumber,
          zipCode: dto.zipCode,
        },
        kckIncidentId: incidentId,
        status: 'SUBMITTED',
        lastError: null,
      }));

      const points = await this.points.awardCityIncident(
        submitted.playerId,
        submitted.id,
      );
      if (points.granted) {
        submitted = await this.incidents.update(incident.id, (current) => ({
          ...current,
          pointsGrantedAt: new Date().toISOString(),
        }));
      }

      return {
        status: 'SUBMITTED',
        incidentId,
        photoUrl: `/kck/incidents/${incident.id}/photo`,
        pointsGranted: points.granted ? points.points : 0,
        pointsGrantedAt: submitted.pointsGrantedAt,
      };
    } catch (error) {
      if (error instanceof KckAmbiguousError) {
        await this.incidents.update(incident.id, (current) => ({
          ...current,
          status: 'UNCERTAIN',
          lastError: error.message,
        }));
        throw new ServiceUnavailableException(error.message);
      }

      const message =
        error instanceof Error ? error.message : 'Nieznany błąd wysyłki do KCK';
      await this.incidents.update(incident.id, (current) => ({
        ...current,
        status: 'FAILED',
        lastError: message,
      }));

      if (error instanceof KckHttpError) {
        throw new BadGatewayException(error.message);
      }
      throw error;
    }
  }

  async getIncident(id: string) {
    const incident = await this.incidents.get(id);
    return {
      id: incident.id,
      status: incident.status,
      category: incident.category,
      summary: incident.summary,
      description: incident.description,
      address: incident.address,
      latitude: incident.latitude,
      longitude: incident.longitude,
      photoUrl: `/kck/incidents/${incident.id}/photo`,
      incidentId: incident.kckIncidentId,
      lastError: incident.lastError,
      pointsGrantedAt: incident.pointsGrantedAt,
      createdAt: incident.createdAt,
      updatedAt: incident.updatedAt,
    };
  }

  async getPhoto(id: string) {
    const incident = await this.incidents.get(id);
    return {
      buffer: await this.photos.read(incident.photo),
      mimeType: incident.photo.mimetype,
    };
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
