// Rdzeń „mózgu AI”: dwa wywołania OpenAI według promptów i schematów z katalogu prompts/.
// Bez zależności od NestJS, żeby ten sam kod działał w API i w skrypcie `npm run czat`.
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OpenAI } from 'openai';
// sharp 0.35 podaje typy ESM, a ten projekt kompiluje się do CommonJS, więc require z typem.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp = require('sharp') as typeof import('sharp').default;

export type Typ = 'usterka' | 'inicjatywa';
export type Temat = 'dzialanie' | 'zasoby';
export type Zrodlo = 'gracz' | 'ai';

export interface ZgloszenieWPoblizu {
  id: string;
  typ: Typ;
  tytul: string;
  status: string;
}

export interface DaneKrok1 {
  linia_gracza: string;
  adres: string;
  dzielnica: string;
  zgloszenia_w_poblizu: ZgloszenieWPoblizu[];
  ostatnie_briefy_gracza: unknown[];
}

export interface Odpowiedz {
  temat: Temat;
  pytanie: string;
  odpowiedz: string;
}

/** Krok 2 dotyczy tylko Inicjatywy. Usterkę obsługuje osobny prompt KCK. */
export interface DaneKrok2 {
  kategoria: string | null;
  linia_gracza: string;
  odpowiedzi: Odpowiedz[];
  pytanie_zwrotne_juz_zadane: boolean;
  odpowiedz_na_pytanie_zwrotne: string;
  adres: string;
  dzielnica: string;
}

export interface Pytanie {
  topic: Temat;
  question: string;
  suggestions: string[];
}

export interface WynikKrok1 {
  status: 'ok' | 'nowe_zdjecie' | 'niezrozumiale' | 'nie_widac_usterki' | 'opisz_zmiane';
  /** Możliwe zagrożenie. Nie przerywa rozmowy: aplikacja pokazuje ostrzeżenie. */
  danger: string | null;
  /** energia = prąd: aplikacja pokazuje też Pogotowie Energetyczne 991. */
  danger_kind: 'energia' | 'inne' | null;
  /** Twarze tylko jako szczegół całości: zdjęcie przechodzi, aplikacja pokazuje informację. */
  faces_in_background: boolean;
  retake_reason: string | null;
  message: string | null;
  duplicate_of: string | null;
  type: Typ | null;
  type_locked: boolean;
  type_reason: string | null;
  category: string | null;
  questions: Pytanie[];
}

/** Oficjalne kategorie KCK. Na serviceExternalId zamienia je moduł KCK, nie AI. */
export type KategoriaKck = 'DAMAGE' | 'POLLUTION' | 'GREENERY' | 'ANIMALS' | 'OTHER';

export interface BriefInicjatywy {
  type: 'inicjatywa';
  title: string;
  category: string;
  problem: string;
  proposed_action: { text: string; source: Zrodlo };
  why_it_matters: string;
  resources: { people: string; equipment: string; transport: string; source: Zrodlo };
  who_fixes: { city_needed: boolean; reason: string; confidence: 'niska' | 'srednia' | 'wysoka' };
}

export interface WynikKrok2 {
  status: 'brief' | 'niezrozumiale' | 'pytanie_zwrotne';
  unclear_topic: Temat | null;
  follow_up: string | null;
  brief: BriefInicjatywy | null;
}

export interface DaneKck {
  linia_gracza: string;
  /** Kategoria z kroku 1, gdy był. To tylko podpowiedź. */
  kategoria_podpowiedz: KategoriaKck | null;
}

/** Surowa odpowiedź modelu według prompts/schema-kck.json. */
interface WynikKck {
  status: 'OK' | 'RETAKE';
  retake_reason: PowodRetake | null;
  message: string | null;
  category: KategoriaKck | null;
  summary: string | null;
  description: string | null;
}

export type PowodRetake = 'NO_INCIDENT' | 'POOR_QUALITY' | 'FACES_OR_PLATES' | 'INAPPROPRIATE';

/** Wynik dla modułu KCK (`POST /kck/prepare`): gotowe pola albo prośba o nowe zdjęcie. */
export type KckAiResult =
  | { status: 'OK'; category: KategoriaKck; summary: string; description: string }
  | { status: 'RETAKE'; reason: PowodRetake; message: string };

export interface Koszt {
  model: string;
  input_tokens: number;
  cached_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  usd: number;
}

export interface OdpowiedzAi<T> {
  wynik: T;
  ostrzezenia: string[];
  koszt: Koszt;
}

/** Model odmówił albo nie skończył odpowiedzi. */
export class AiBlad extends Error {}

// Ceny za 1M tokenów z cennika OpenAI (październik 2026). Zapis do cache pominięty, więc to szacunek.
const CENY: Record<string, { input: number; cached: number; output: number }> = {
  'gpt-6.1-sol': { input: 2, cached: 0.1, output: 10 },
  'gpt-6-sol': { input: 2, cached: 0.2, output: 10 },
  'gpt-6-astra': { input: 10, cached: 1, output: 50 },
  'gpt-6-luna': { input: 0.1, cached: 0.01, output: 0.5 },
};

const KATEGORIE_USTERKI: string[] = ['DAMAGE', 'POLLUTION', 'GREENERY', 'ANIMALS', 'OTHER'] satisfies KategoriaKck[];
const KATEGORIE_INICJATYWY = ['zdrowie', 'infrastruktura', 'edukacja', 'kultura', 'bezpieczenstwo', 'zielen', 'sport', 'rowery', 'spoleczenstwo'];

const KATALOG_PROMPTOW = join(process.cwd(), 'prompts');
const KATALOG_LOGOW = join(process.cwd(), 'logs');

let klient: OpenAI | undefined;
function openai(): OpenAI {
  klient ??= new OpenAI();
  return klient;
}

// Prompty czytamy przy każdym wywołaniu, żeby poprawka w pliku działała bez restartu serwera.
function plik(nazwa: string): string {
  return readFileSync(join(KATALOG_PROMPTOW, nazwa), 'utf8');
}

/** Obraca według EXIF i zmniejsza do 1024 px po dłuższym boku. Zwraca JPEG w base64. */
export async function przygotujZdjecie(zdjecie: Buffer): Promise<string> {
  const jpeg = await sharp(zdjecie)
    .rotate()
    .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
  return jpeg.toString('base64');
}

// Blok <dane> z promptu. Gracz nie może go zamknąć własnym tekstem.
function blokDanych(dane: object): string {
  const linie = Object.entries(dane).map(([klucz, wartosc]) => {
    const tekst = typeof wartosc === 'string' ? wartosc : JSON.stringify(wartosc);
    return `${klucz}: ${tekst.replace(/<\/?dane>/gi, '')}`;
  });
  return `<dane>\n${linie.join('\n')}\n</dane>`;
}

interface Zadanie {
  /** Nazwa w logu i w formacie odpowiedzi. */
  nazwa: string;
  prompt: string;
  schemat: string;
}

const KROK_1: Zadanie = { nazwa: 'krok_1', prompt: 'prompt-1.md', schemat: 'schema-krok-1.json' };
const KROK_2: Zadanie = { nazwa: 'krok_2', prompt: 'prompt-2.md', schemat: 'schema-krok-2.json' };
const KCK: Zadanie = { nazwa: 'kck', prompt: 'prompt-kck.md', schemat: 'schema-kck.json' };

async function wywolaj<T>(zadanie: Zadanie, zdjecieBase64: string, dane: object, sprawdz: (wynik: T) => string[]): Promise<OdpowiedzAi<T>> {
  const model = process.env.OPENAI_MODEL ?? 'gpt-6.1-sol';
  const effort = (process.env.OPENAI_REASONING_EFFORT ?? 'low') as OpenAI.ReasoningEffort;

  const response = await openai().responses.create(
    {
      model,
      reasoning: { effort },
      // Nie potrzebujemy stanu odpowiedzi po stronie OpenAI. Domyślnie trzymałby ją co najmniej 30 dni.
      store: false,
      instructions: plik(zadanie.prompt),
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_image', image_url: `data:image/jpeg;base64,${zdjecieBase64}`, detail: 'auto' },
            { type: 'input_text', text: blokDanych(dane) },
          ],
        },
      ],
      text: {
        format: { type: 'json_schema', name: zadanie.nazwa, schema: JSON.parse(plik(zadanie.schemat)), strict: true },
      },
    },
    // Krótki, przewidywalny czas: bez automatycznych ponowień SDK. Ponowienie to decyzja aplikacji.
    { timeout: Number(process.env.OPENAI_TIMEOUT_MS ?? 8000), maxRetries: 0 },
  );

  for (const element of response.output) {
    if (element.type !== 'message') continue;
    for (const czesc of element.content) {
      if (czesc.type === 'refusal') throw new AiBlad(`Model odmówił: ${czesc.refusal}`);
    }
  }
  if (response.status !== 'completed') {
    throw new AiBlad(`Odpowiedź niepełna (status: ${response.status}).`);
  }

  const wynik = JSON.parse(response.output_text) as T;
  const ostrzezenia = sprawdz(wynik);
  const koszt = policzKoszt(model, response.usage);
  zapiszLog({ zadanie: zadanie.nazwa, model, dane, wynik, ostrzezenia, koszt });
  return { wynik, ostrzezenia, koszt };
}

export function krok1(zdjecieBase64: string, dane: DaneKrok1): Promise<OdpowiedzAi<WynikKrok1>> {
  return wywolaj(KROK_1, zdjecieBase64, dane, sprawdzKrok1);
}

export function krok2(zdjecieBase64: string, dane: DaneKrok2): Promise<OdpowiedzAi<WynikKrok2>> {
  return wywolaj(KROK_2, zdjecieBase64, dane, sprawdzKrok2);
}

/**
 * Zdjęcie Usterki (już po przygotujZdjecie) → pola KCK, jedno wywołanie modelu.
 * Limity są twarde: zły wynik rzuca AiBlad, a aplikacja pokazuje wtedy ręczne pola.
 */
export async function kck(zdjecieBase64: string, dane: DaneKck): Promise<OdpowiedzAi<KckAiResult>> {
  const { wynik, ostrzezenia, koszt } = await wywolaj<WynikKck>(KCK, zdjecieBase64, dane, () => []);
  return { wynik: sprawdzKck(wynik), ostrzezenia, koszt };
}

/**
 * Dla modułu KCK (`POST /kck/prepare`, docs/kck-ai-automation.md): surowe zdjęcie → pola KCK albo RETAKE.
 * Przy błędzie AI (timeout, odmowa, złamany limit) rzuca wyjątek: moduł KCK pokazuje wtedy ręczne pola.
 */
export async function przygotujUsterkeKck(
  zdjecie: Buffer,
  opcje: { linia_gracza?: string; kategoria?: KategoriaKck | null } = {},
): Promise<OdpowiedzAi<KckAiResult>> {
  return kck(await przygotujZdjecie(zdjecie), {
    linia_gracza: opcje.linia_gracza ?? '',
    kategoria_podpowiedz: opcje.kategoria ?? null,
  });
}

/** Kto naprawi liczy serwer, nie AI. */
export function ktoNaprawi(brief: BriefInicjatywy): 'Miasto' | 'Gracze' {
  return brief.who_fixes.city_needed ? 'Miasto' : 'Gracze';
}

/** Brief w kształcie, który aplikacja pokazuje do poprawy i wysyła bez zmian do POST /initiatives. */
export function briefDlaAplikacji(brief: BriefInicjatywy) {
  return {
    title: brief.title,
    category: brief.category,
    problem: brief.problem,
    proposedAction: brief.proposed_action.text,
    whyImportant: brief.why_it_matters,
    resources: {
      people: brief.resources.people,
      equipment: brief.resources.equipment,
      transport: brief.resources.transport,
    },
    fixer: ktoNaprawi(brief),
  };
}

// Limity znaków z Budżetu Obywatelskiego. Tryb strict OpenAI ich nie wymusza, więc sprawdzamy je tutaj.
function dlugosc(ostrzezenia: string[], pole: string, tekst: string | null, max: number, min = 0): void {
  if (tekst === null) return;
  if (tekst.length > max) ostrzezenia.push(`${pole}: ${tekst.length} znaków, limit ${max}`);
  if (tekst.length < min) ostrzezenia.push(`${pole}: ${tekst.length} znaków, minimum ${min}`);
}

function sprawdzKrok1(w: WynikKrok1): string[] {
  const o: string[] = [];
  if (w.status !== 'ok') return o;
  const lista = w.type === 'usterka' ? KATEGORIE_USTERKI : KATEGORIE_INICJATYWY;
  if (w.category !== null && !lista.includes(w.category)) o.push(`kategoria ${w.category} nie pasuje do typu ${w.type}`);
  const oczekiwane = w.type === 'usterka' && w.type_locked ? 0 : 2;
  if (w.questions.length !== oczekiwane) o.push(`pytań: ${w.questions.length}, powinno być ${oczekiwane}`);
  for (const p of w.questions) {
    dlugosc(o, `pytanie ${p.topic}`, p.question, 100);
    p.suggestions.forEach((s, i) => dlugosc(o, `podpowiedź ${p.topic} ${i + 1}`, s, 60));
  }
  return o;
}

function sprawdzKrok2(w: WynikKrok2): string[] {
  const o: string[] = [];
  dlugosc(o, 'follow_up', w.follow_up, 150);
  const b = w.brief;
  if (b === null) return o;
  dlugosc(o, 'title', b.title, 60);
  dlugosc(o, 'problem', b.problem, 250, 60);
  dlugosc(o, 'proposed_action', b.proposed_action.text, 250);
  dlugosc(o, 'why_it_matters', b.why_it_matters, 250);
  dlugosc(o, 'resources.people', b.resources.people, 150);
  dlugosc(o, 'resources.equipment', b.resources.equipment, 150);
  dlugosc(o, 'resources.transport', b.resources.transport, 150);
  if (!b.resources.people && !b.resources.equipment && !b.resources.transport) o.push('resources: wszystkie trzy pola są puste');
  dlugosc(o, 'who_fixes.reason', b.who_fixes.reason, 150);
  return o;
}

// KCK: twarde reguły. Zamiast ostrzeżenia odrzucamy wynik, bo trafia prosto do formularza miasta.
function sprawdzKck(w: WynikKck): KckAiResult {
  if (w.status === 'RETAKE') {
    if (!w.retake_reason || !w.message?.trim()) throw new AiBlad('KCK: RETAKE bez powodu albo bez wiadomości.');
    return { status: 'RETAKE', reason: w.retake_reason, message: w.message.trim() };
  }
  const summary = w.summary?.trim() ?? '';
  const description = w.description?.trim() ?? '';
  if (!w.category || !KATEGORIE_USTERKI.includes(w.category)) throw new AiBlad(`KCK: zła kategoria (${w.category}).`);
  if (!summary || summary.length > 60) throw new AiBlad(`KCK: summary ma ${summary.length} znaków (wymagane 1–60).`);
  if (!description || description.length > 500) throw new AiBlad(`KCK: description ma ${description.length} znaków (wymagane 1–500).`);
  return { status: 'OK', category: w.category, summary, description };
}

function policzKoszt(model: string, usage: OpenAI.Responses.ResponseUsage | undefined): Koszt {
  const input = usage?.input_tokens ?? 0;
  const cached = usage?.input_tokens_details?.cached_tokens ?? 0;
  const output = usage?.output_tokens ?? 0;
  const cena = CENY[model];
  const usd = cena ? ((input - cached) * cena.input + cached * cena.cached + output * cena.output) / 1_000_000 : 0;
  return {
    model,
    input_tokens: input,
    cached_tokens: cached,
    output_tokens: output,
    reasoning_tokens: usage?.output_tokens_details?.reasoning_tokens ?? 0,
    usd,
  };
}

// Log w logs/ai.jsonl (bez zdjęcia): materiał na lepsze przykłady w promptach.
function zapiszLog(wpis: object): void {
  try {
    mkdirSync(KATALOG_LOGOW, { recursive: true });
    appendFileSync(join(KATALOG_LOGOW, 'ai.jsonl'), JSON.stringify({ czas: new Date().toISOString(), ...wpis }) + '\n');
  } catch {
    // Log jest pomocniczy. Jego błąd nie może zatrzymać zgłoszenia.
  }
}
