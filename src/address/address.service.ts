import { Injectable } from '@nestjs/common';
import { IncidentAddress } from '../kck/kck.types';

interface ArcGisFeature {
  attributes?: {
    ulica?: unknown;
    adr_nr?: unknown;
    kod_kod?: unknown;
  };
  geometry?: {
    x?: unknown;
    y?: unknown;
  };
}

interface ArcGisResponse {
  features?: ArcGisFeature[];
  error?: { message?: string };
}

@Injectable()
export class AddressService {
  private readonly endpoint =
    process.env.MSIP_ADDRESS_URL ??
    'https://msip.um.krakow.pl/arcgis/rest/services/adresy_search/MapServer/0/query';

  async fromGps(latitude: number, longitude: number): Promise<IncidentAddress | null> {
    const params = new URLSearchParams({
      f: 'json',
      geometry: `${longitude},${latitude}`,
      geometryType: 'esriGeometryPoint',
      inSR: '4326',
      outSR: '4326',
      spatialRel: 'esriSpatialRelIntersects',
      distance: '400',
      units: 'esriSRUnit_Meter',
      outFields: 'ulica,adr_nr,kod_kod',
      returnGeometry: 'true',
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Number(process.env.MSIP_TIMEOUT_MS ?? 5000));

    try {
      const response = await fetch(`${this.endpoint}?${params.toString()}`, {
        signal: controller.signal,
      });
      if (!response.ok) return null;

      const data = (await response.json()) as ArcGisResponse;
      if (data.error || !Array.isArray(data.features) || data.features.length === 0) return null;

      const feature = this.nearest(data.features, latitude, longitude);
      if (!feature?.attributes) return null;

      const streetName = this.text(feature.attributes.ulica);
      const buildingNumber = this.text(feature.attributes.adr_nr);
      const zipCode = this.text(feature.attributes.kod_kod);
      if (!streetName && !buildingNumber && !zipCode) return null;

      return { streetName, buildingNumber, zipCode };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private nearest(features: ArcGisFeature[], latitude: number, longitude: number): ArcGisFeature {
    return features.reduce((best, candidate) => {
      return this.distance(candidate, latitude, longitude) < this.distance(best, latitude, longitude)
        ? candidate
        : best;
    });
  }

  private distance(feature: ArcGisFeature, latitude: number, longitude: number): number {
    const x = Number(feature.geometry?.x);
    const y = Number(feature.geometry?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return Number.POSITIVE_INFINITY;

    const toRad = (value: number) => (value * Math.PI) / 180;
    const earth = 6_371_000;
    const dLat = toRad(y - latitude);
    const dLon = toRad(x - longitude);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(latitude)) * Math.cos(toRad(y)) * Math.sin(dLon / 2) ** 2;
    return 2 * earth * Math.asin(Math.sqrt(a));
  }

  private text(value: unknown): string {
    return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  }
}
