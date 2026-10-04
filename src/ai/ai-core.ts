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

export interface DaneKrok2 {
  typ: Typ;
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

/** Zgłoszenie Usterki. Pola summary i description idą do KCK bez zmian. */
export interface BriefUsterki {
  type: 'usterka';
  summary: string;
  category: KategoriaKck;
  description: string;
}

export interface BriefInicjatywy {
  type: 'inicjatywa';
  title: string;
  category: string;
  problem: string;
  proposed_action: { text: string; source: Zrodlo };
  why_it_matters: string;
  resources: { text: string; source: Zrodlo };
  who_fixes: { city_needed: boolean; reason: string; confidence: 'niska' | 'srednia' | 'wysoka' };
}

export interface WynikKrok2 {
  status: 'brief' | 'niezrozumiale' | 'pytanie_zwrotne';
  unclear_topic: Temat | null;
  follow_up: string | null;
  brief: BriefInicjatywy | BriefUsterki | null;
}

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

async function wywolaj<T>(krok: 1 | 2, zdjecieBase64: string, dane: object): Promise<OdpowiedzAi<T>> {
  const model = process.env.OPENAI_MODEL ?? 'gpt-6.1-sol';
  const effort = (process.env.OPENAI_REASONING_EFFORT ?? 'low') as OpenAI.ReasoningEffort;

  const response = await openai().responses.create({
    model,
    reasoning: { effort },
    instructions: plik(`prompt-${krok}.md`),
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
      format: { type: 'json_schema', name: `krok_${krok}`, schema: JSON.parse(plik(`schema-krok-${krok}.json`)), strict: true },
    },
  });

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
  const ostrzezenia = krok === 1 ? sprawdzKrok1(wynik as WynikKrok1) : sprawdzKrok2(wynik as WynikKrok2);
  const koszt = policzKoszt(model, response.usage);
  zapiszLog({ krok, model, dane, wynik, ostrzezenia, koszt });
  return { wynik, ostrzezenia, koszt };
}

export function krok1(zdjecieBase64: string, dane: DaneKrok1): Promise<OdpowiedzAi<WynikKrok1>> {
  return wywolaj<WynikKrok1>(1, zdjecieBase64, dane);
}

export function krok2(zdjecieBase64: string, dane: DaneKrok2): Promise<OdpowiedzAi<WynikKrok2>> {
  return wywolaj<WynikKrok2>(2, zdjecieBase64, dane);
}

/** Wynik dla modułu KCK (`POST /kck/prepare`), w kształcie z docs/kck-ai-automation.md. */
export interface KckAiResult {
  category: KategoriaKck;
  summary: string;
  description: string;
}

/**
 * Pola zgłoszenia KCK ze zdjęcia Usterki. Moduł KCK wywołuje to równolegle z ustaleniem adresu.
 * Zakłada, że krok 1 już się odbył (zagrożenie, twarze, tablice, typ). Kategoria z kroku 1 jest podpowiedzią.
 * Przy błędzie AI rzuca wyjątek: moduł KCK pokazuje wtedy ręczne pola, zgłoszenie nie może się zablokować.
 */
export async function przygotujUsterkeKck(
  zdjecie: Buffer,
  opcje: { linia_gracza?: string; kategoria?: KategoriaKck | null } = {},
): Promise<OdpowiedzAi<KckAiResult>> {
  const { wynik, ostrzezenia, koszt } = await krok2(await przygotujZdjecie(zdjecie), {
    typ: 'usterka',
    kategoria: opcje.kategoria ?? null,
    linia_gracza: opcje.linia_gracza ?? '',
    odpowiedzi: [],
    pytanie_zwrotne_juz_zadane: false,
    odpowiedz_na_pytanie_zwrotne: '',
    adres: 'ustalany osobno z GPS',
    dzielnica: 'nieznana',
  });
  if (wynik.brief?.type !== 'usterka') throw new AiBlad('AI nie zwróciło zgłoszenia Usterki.');
  const { category, summary, description } = wynik.brief;
  return { wynik: { category, summary, description }, ostrzezenia, koszt };
}

/** Kto naprawi liczy serwer, nie AI. */
export function ktoNaprawi(brief: BriefInicjatywy): 'Miasto' | 'Gracze' {
  return brief.who_fixes.city_needed ? 'Miasto' : 'Gracze';
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
  if (b.type === 'usterka') {
    dlugosc(o, 'summary', b.summary, 60);
    dlugosc(o, 'description', b.description, 500, 1);
  } else {
    dlugosc(o, 'title', b.title, 60);
    dlugosc(o, 'problem', b.problem, 250, 60);
    dlugosc(o, 'proposed_action', b.proposed_action.text, 250);
    dlugosc(o, 'why_it_matters', b.why_it_matters, 250);
    dlugosc(o, 'resources', b.resources.text, 250);
    dlugosc(o, 'who_fixes.reason', b.who_fixes.reason, 150);
  }
  return o;
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
