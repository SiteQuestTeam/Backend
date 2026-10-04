import { Injectable } from '@nestjs/common';
import { KCK_CREATE_URL } from './kck.constants';
import { KckIncidentDto } from './kck.types';

export class KckHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export class KckAmbiguousError extends Error {}
export class KckConfigurationError extends Error {}

@Injectable()
export class KckClient {
  // Wysyłka jest możliwa wyłącznie przy jawnie włączonej integracji z KCK.
  readonly live = process.env.KCK_MODE === 'live';

  async submitIncident(dto: KckIncidentDto, photo: { buffer: Buffer; mimeType: string; fileName: string }): Promise<string> {
    if (!this.live) {
      throw new KckConfigurationError('Integracja KCK nie jest włączona. Ustaw KCK_MODE=live.');
    }

    const form = new FormData();
    form.append('dto', JSON.stringify(dto));
    form.append('file', new Blob([new Uint8Array(photo.buffer)], { type: photo.mimeType }), photo.fileName);

    let response: Response;
    try {
      response = await fetch(KCK_CREATE_URL, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(Number(process.env.KCK_TIMEOUT_MS ?? 15000)),
      });
    } catch (error) {
      if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        throw new KckAmbiguousError('Timeout KCK: nie wiadomo, czy zgłoszenie zostało przyjęte.');
      }
      throw error;
    }

    if (!response.ok) {
      throw new KckHttpError(response.status, `KCK returned HTTP ${response.status}`);
    }

    const result = (await response.json()) as { incidentId?: string | number };
    if (result.incidentId === undefined || result.incidentId === null || String(result.incidentId).trim() === '') {
      throw new KckAmbiguousError('KCK nie zwróciło incidentId.');
    }

    return String(result.incidentId);
  }
}
