import { KckCategory } from './kck.constants';

export interface UploadedPhoto {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

export interface IncidentAddress {
  streetName: string;
  buildingNumber: string;
  zipCode: string;
}

export interface StoredPhoto {
  storageKey: string;
  mimetype: string;
  originalName: string;
  size: number;
}

export type CityIncidentStatus = 'PREPARED' | 'SUBMITTING' | 'SUBMITTED' | 'FAILED' | 'UNCERTAIN';

export interface CityIncidentRecord {
  id: string;
  playerId: string | null;
  latitude: number;
  longitude: number;
  category: KckCategory | null;
  summary: string | null;
  description: string | null;
  address: IncidentAddress | null;
  photo: StoredPhoto;
  status: CityIncidentStatus;
  submissionId: string | null;
  kckIncidentId: string | null;
  lastError: string | null;
  pointsGrantedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface KckIncidentDto {
  requestType: 'ISSUE';
  summary: string;
  description: string;
  streetName: string;
  buildingNumber: string;
  zipCode: string;
  latitude: number;
  longitude: number;
  layer: 'Standardowa';
  object: '';
  userFirstName: '';
  userLastName: '';
  userEmail: '';
  userPhoneNumber: '';
  processingOfPersonalAgreement: false;
  emailNotificationAgreement: false;
  smsNotificationAgreement: false;
  serviceExternalId: string;
}

export interface SubmitKckInput {
  draftId: string;
  submissionId: string;
  category: KckCategory;
  summary: string;
  description: string;
  streetName: string;
  buildingNumber: string;
  zipCode: string;
}
