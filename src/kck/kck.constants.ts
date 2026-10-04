export const KCK_CATEGORY_IDS = {
  DAMAGE: '30492-uszkodzenia',
  POLLUTION: '64665-zanieczyszczenia',
  GREENERY: '51517-zielen',
  ANIMALS: '09150-zwierzeta',
  OTHER: '40583-pozostale',
} as const;

export type KckCategory = keyof typeof KCK_CATEGORY_IDS;

export const KCK_CREATE_URL =
  process.env.KCK_CREATE_URL ?? 'https://kontakt.krakow.pl/api/e-incident/1.0.0/incident/create';

export const KCK_MAX_PHOTO_BYTES = 7 * 1024 * 1024;
export const KCK_DEFAULT_TIMEOUT_MS = 12_000;
