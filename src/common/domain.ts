export const VOTING_RADIUS_METERS = 50;
export const DEFAULT_VOTE_THRESHOLD = 10;

export const POINTS = {
  initiativeCreated: 100,
  voteCast: 10,
  initiativePassedBonus: 50,
} as const;

export function rankFor(totalPointsEarned: number): string {
  if (totalPointsEarned >= 5000) return 'Miejski Bohater';
  if (totalPointsEarned >= 2000) return 'Lokalny Lider';
  if (totalPointsEarned >= 1000) return 'Sąsiedzki Inicjator';
  if (totalPointsEarned >= 250) return 'Aktywny Sąsiad';
  return 'Nowy Gracz';
}

export function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const radius = 6371000;
  const toRad = (value: number): number => (value * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;

  return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)));
}
