import { BadGatewayException, BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AiBlad, KategoriaKck, przygotujUsterkeKck } from '../ai/ai-core';
import { AddressService } from '../address/address.service';
import { PointsService } from '../points/points.service';
import { PhotoStorageService } from '../storage/photo-storage.service';
import { CityIncidentStore } from './city-incident.store';
import { KCK_CATEGORY_IDS } from './kck.constants';
import { KckAmbiguousError, KckClient, KckHttpError } from './kck.client';
import { CityIncident, KckIncidentDto } from './kck.types';

export interface PrepareIncidentInput {
  latitude: number;
  longitude: number;
  playerId?: string;
  line?: string;
  categoryHint?: KategoriaKck | null;
}

export interface SubmitIncidentInput {
  draftId: string;
  submissionId: string;
  category: KategoriaKck;
  summary: string;
  description: string;
  streetName: string;
  buildingNumber: string;
  zipCode: string;
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

  async prepare(input: PrepareIncidentInput, photo: Express.Multer.File) {
    this.validateCoordinates(input.latitude, input.longitude);
    this.validatePhoto(photo);

    const draftId = randomUUID();
    const savedPhoto = await this.photos.save(draftId, photo);

    const [aiSettled, addressSettled] = await Promise.allSettled([
      przygotujUsterkeKck(photo.buffer, { linia_gracza: input.line, kategoria: input.categoryHint }),
      this.address.reverseGeocode(input.latitude, input.longitude),
    ]);

    if (aiSettled.status === 'fulfilled' && aiSettled.value.wynik.status === 'RETAKE') {
      await this.photos.remove(savedPhoto.key);
      return { status: 'RETAKE', ...aiSettled.value.wynik };
    }

    const ai = aiSettled.status === 'fulfilled' ? aiSettled.value.wynik : null;
    const address = addressSettled.status === 'fulfilled' ? addressSettled.value : null;

    const incident: CityIncident = {
      id: draftId,
      playerId: input.playerId?.trim() || null,
      latitude: input.latitude,
      longitude: input.longitude,
      category: ai?.status === 'OK' ? ai.category : null,
      summary: ai?.status === 'OK' ? ai.summary : null,
      description: ai?.status === 'OK' ? ai.description : null,
      streetName: address?.streetName ?? null,
      buildingNumber: address?.buildingNumber ?? null,
      zipCode: address?.zipCode ?? null,
      photoKey: savedPhoto.key,
      photoMimeType: savedPhoto.mimeType,
      photoFileName: savedPhoto.fileName,
      kckIncidentId: null,
      submissionId: null,
      status: 'PREPARED',
      pointsGrantedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this.incidents.create(incident);

    return {
      status: 'PREPARED',
      draftId,
      photoUrl: `/kck/incidents/${draftId}/photo`,
      aiAvailable: aiSettled.status === 'fulfilled',
      addressAvailable: addressSettled.status === 'fulfilled',
      category: incident.category,
      serviceExternalId: incident.category ? KCK_CATEGORY_IDS[incident.category] : null,
      summary: incident.summary,
      description: incident.description,
      address: {
        streetName: incident.streetName,
        buildingNumber: incident.buildingNumber,
        zipCode: incident.zipCode,
      },
      latitude: incident.latitude,
      longitude: incident.longitude,
    };
  }

  async submit(input: SubmitIncidentInput) {
    const incident = await this.incidents.find(input.draftId);
    if (!incident) throw new NotFoundException('Nie znaleziono przygotowanej Usterki.');

    if (incident.status === 'SUBMITTED') {
      if (incident.submissionId === input.submissionId) {
        return { status: 'SUBMITTED', incidentId: incident.kckIncidentId, pointsGrantedAt: incident.pointsGrantedAt };
      }
      throw new ConflictException('Ta Usterka została już wysłana.');
    }
    if (incident.status === 'UNCERTAIN') {
      throw new ConflictException('Poprzednia wysyłka ma niejednoznaczny wynik. Nie ponawiamy automatycznie zgłoszenia do KCK.');
    }
    if (incident.status === 'SUBMITTING' && incident.submissionId === input.submissionId) {
      throw new ConflictException('To zgłoszenie jest już wysyłane.');
    }

    this.validateSubmission(input);
    await this.incidents.update(incident.id, { status: 'SUBMITTING', submissionId: input.submissionId });

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
      const photoBuffer = await this.photos.read(incident.photoKey);
      const incidentId = await this.client.submitIncident(dto, {
        buffer: photoBuffer,
        mimeType: incident.photoMimeType,
        fileName: incident.photoFileName,
      });
      const submitted = await this.incidents.update(incident.id, {
        category: input.category,
        summary: dto.summary,
        description: dto.description,
        streetName: dto.streetName,
        buildingNumber: dto.buildingNumber,
        zipCode: dto.zipCode,
        kckIncidentId: incidentId,
        status: 'SUBMITTED',
      });

      const points = await this.points.grantForKckIncident(submitted);
      if (points.granted) {
        await this.incidents.update(incident.id, { pointsGrantedAt: new Date().toISOString() });
      }

      return {
        status: 'SUBMITTED',
        incidentId,
        photoUrl: `/kck/incidents/${incident.id}/photo`,
        pointsGranted: points.granted ? points.points : 0,
      };
    } catch (error) {
      if (error instanceof KckAmbiguousError) {
        await this.incidents.update(incident.id, { status: 'UNCERTAIN' });
        throw new ServiceUnavailableException(error.message);
      }
      await this.incidents.update(incident.id, { status: 'FAILED' });
      if (error instanceof KckHttpError) throw new BadGatewayException(error.message);
      throw error;
    }
  }

  async getIncident(id: string) {
    const incident = await this.incidents.find(id);
    if (!incident) throw new NotFoundException('Nie znaleziono Usterki.');
    return {
      id: incident.id,
      status: incident.status,
      category: incident.category,
      summary: incident.summary,
      description: incident.description,
      address: {
        streetName: incident.streetName,
        buildingNumber: incident.buildingNumber,
        zipCode: incident.zipCode,
      },
      latitude: incident.latitude,
      longitude: incident.longitude,
      photoUrl: `/kck/incidents/${incident.id}/photo`,
      incidentId: incident.kckIncidentId,
      pointsGrantedAt: incident.pointsGrantedAt,
      createdAt: incident.createdAt,
      updatedAt: incident.updatedAt,
    };
  }

  async getPhoto(id: string) {
    const incident = await this.incidents.find(id);
    if (!incident) throw new NotFoundException('Nie znaleziono Usterki.');
    return {
      buffer: await this.photos.read(incident.photoKey),
      mimeType: incident.photoMimeType,
    };
  }

  private validatePhoto(photo?: Express.Multer.File): asserts photo is Express.Multer.File {
    if (!photo?.buffer?.length) throw new BadRequestException('Wymagane jest zdjęcie w polu file.');
    if (!photo.mimetype.startsWith('image/')) throw new BadRequestException('Pole file musi być obrazem.');
    if (photo.size > 7 * 1024 * 1024) throw new BadRequestException('Zdjęcie przekracza limit 7 MiB.');
  }

  private validateCoordinates(latitude: number, longitude: number): void {
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) throw new BadRequestException('Niepoprawna szerokość geograficzna.');
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) throw new BadRequestException('Niepoprawna długość geograficzna.');
  }

  private validateSubmission(input: SubmitIncidentInput): void {
    if (!input.submissionId?.trim()) throw new BadRequestException('Wymagane submissionId.');
    if (!Object.hasOwn(KCK_CATEGORY_IDS, input.category)) throw new BadRequestException('Niepoprawna kategoria KCK.');
    if (!input.summary?.trim() || input.summary.trim().length > 60) throw new BadRequestException('Tytuł musi mieć 1–60 znaków.');
    if (!input.description?.trim() || input.description.trim().length > 500) throw new BadRequestException('Opis musi mieć 1–500 znaków.');
    if (!input.streetName?.trim()) throw new BadRequestException('Wymagana ulica.');
    if (!input.zipCode?.trim()) throw new BadRequestException('Wymagany kod pocztowy.');
  }
}
