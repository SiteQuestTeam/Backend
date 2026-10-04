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

// INTEREST: Gracz uznał, że to ta sama Usterka co wysłana wcześniej w pobliżu. Nie idzie do KCK.
export type CityIncidentStatus = 'PREPARED' | 'SUBMITTING' | 'SUBMITTED' | 'FAILED' | 'UNCERTAIN' | 'INTEREST';

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

export interface InterestInput {
  draftId: string;
  incidentId: string;
}
