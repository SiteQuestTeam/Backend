// Czat zgłoszenia w terminalu: ta sama rozmowa co w aplikacji, z prawdziwym modelem.
// Użycie: npm run czat -- sciezka/do/zdjecia.jpg [--w-poblizu plik.json]
import { readFileSync } from 'node:fs';
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline';
import {
  BriefInicjatywy,
  DaneKrok1,
  KategoriaKck,
  KckAiResult,
  Koszt,
  Odpowiedz,
  Typ,
  WynikKrok1,
  ZgloszenieWPoblizu,
  kck,
  krok1,
  krok2,
  ktoNaprawi,
  przygotujZdjecie,
} from '../src/ai/ai-core';

// Stałe teksty z ai/stale-teksty.md w repo Project-context-.
const TEKST = {
  zagrozenie: (opis: string) => `⚠️ AI widzi możliwe zagrożenie: ${opis}`,
  zagrozeniePytanie: 'Czy to naprawdę się dzieje?',
  zagrozenieTak:
    '1. Odejdź na bezpieczną odległość. Nie dotykaj. Ostrzeż ludzi obok.\n2. Zadzwoń po pomoc. Tego nie zgłaszamy w SideQuest, bo tu potrzebne są służby ratunkowe.',
  zagrozenieTelefony: (energia: boolean) => `📞 112 (numer alarmowy)${energia ? '\n⚡ 991 (Pogotowie Energetyczne)' : ''}`,
  zagrozenieBezPunktow: 'Za zgłoszenie zagrożenia nie ma Punktów. Twoje bezpieczeństwo jest ważniejsze niż zdjęcie.',
  zagrozenieNie: 'Dzięki. Idziemy dalej.',
  przechodnie:
    '👤 Na zdjęciu widać przechodniów. Są tylko szczegółem ulicy, więc zdjęcie może trafić na mapę. Prawo autorskie (art. 81 ust. 2 pkt 2) pozwala pokazać osobę, która jest tylko szczegółem większej całości, na przykład zgromadzenia albo krajobrazu.',
  opiszZmiane: 'Nie widzę tu usterki. Napisz, co chcesz zmienić w tym miejscu.',
  niezrozumiale: 'Nie rozumiem tej odpowiedzi. Napisz ją jeszcze raz, innymi słowami.',
  dlaczegoPytam: {
    dzialanie: 'Budżet Obywatelski prosi o szczegółowy opis. Konkret, na przykład „stojak na 6 rowerów”, ma większą szansę niż ogólnik.',
    zasoby: 'W inicjatywie lokalnej miasto pyta, ile pracy dadzą sami mieszkańcy. Za tę pracę wniosek dostaje punkty.',
  },
};

const szary = (t: string) => `\x1b[90m${t}\x1b[0m`;
const pogrubiony = (t: string) => `\x1b[1m${t}\x1b[0m`;
const ekran = (nazwa: string) => console.log(`\n${pogrubiony(`[${nazwa}]`)}`);

// Iterator linii zamiast rl.question: działa też z odpowiedziami podanymi potokiem (testy automatyczne).
const rl = createInterface({ input: stdin, terminal: false });
const linie = rl[Symbol.asyncIterator]();
let kosztSesji = 0;

function pokazKoszt(koszt: Koszt, ostrzezenia: string[]): void {
  kosztSesji += koszt.usd;
  console.log(
    szary(
      `  (${koszt.model}: ${koszt.input_tokens} wejście, w tym ${koszt.cached_tokens} z cache, ` +
        `${koszt.output_tokens} wyjście, w tym ${koszt.reasoning_tokens} myślenia, ok. $${koszt.usd.toFixed(4)})`,
    ),
  );
  for (const o of ostrzezenia) console.log(`  ⚠️  ${o}`);
}

async function zapytaj(pytanie: string, wymagane = true): Promise<string> {
  for (;;) {
    stdout.write(`> ${pytanie} `);
    const { value, done } = await linie.next();
    if (done) throw new Error('Koniec wejścia.');
    const odp = String(value).trim();
    if (!stdin.isTTY) stdout.write(`${odp}
`);
    if (odp || !wymagane) return odp;
  }
}

async function wybierz(pytanie: string, podpowiedzi: string[]): Promise<string> {
  podpowiedzi.forEach((p, i) => console.log(`  [${i + 1}] ${p}`));
  console.log('  [✏️] albo wpisz własną odpowiedź');
  const odp = await zapytaj(pytanie);
  const numer = Number(odp);
  return Number.isInteger(numer) && numer >= 1 && numer <= podpowiedzi.length ? podpowiedzi[numer - 1] : odp;
}

async function main(): Promise<void> {
  try {
    process.loadEnvFile();
  } catch {
    // Klucz może też być w zmiennych środowiska.
  }

  const argumenty = process.argv.slice(2);
  const sciezka = argumenty.find((a) => !a.startsWith('--'));
  if (!sciezka) {
    console.log('Użycie: npm run czat -- sciezka/do/zdjecia.jpg [--w-poblizu plik.json]');
    process.exit(1);
  }
  const indeks = argumenty.indexOf('--w-poblizu');
  const wPoblizu: ZgloszenieWPoblizu[] = indeks >= 0 ? JSON.parse(readFileSync(argumenty[indeks + 1], 'utf8')) : [];

  const zdjecie = await przygotujZdjecie(readFileSync(sciezka));

  ekran('Ekran 1: aparat');
  console.log(`📷 ${sciezka}`);
  const dane: DaneKrok1 = {
    linia_gracza: await zapytaj('Co chcesz zgłosić? (opcjonalnie, Enter = pomiń)', false),
    adres: 'Kraków (adres z GPS)',
    dzielnica: 'nieznana',
    zgloszenia_w_poblizu: wPoblizu,
    ostatnie_briefy_gracza: [],
  };

  // Krok 1 powtarzamy, dopóki zdjęcie i linia nie są w porządku.
  let w1: WynikKrok1;
  for (;;) {
    console.log(szary('  …AI ogląda zdjęcie'));
    const { wynik, ostrzezenia, koszt } = await krok1(zdjecie, dane);
    pokazKoszt(koszt, ostrzezenia);
    w1 = wynik;
    // Zagrożenie nie przerywa rozmowy. Gracz sam ocenia sytuację na miejscu.
    if (w1.danger) {
      ekran('Możliwe zagrożenie');
      console.log(TEKST.zagrozenie(w1.danger));
      // AI może się pomylić, więc pytamy Gracza. Potwierdzenie kończy rozmowę, zaprzeczenie pozwala iść dalej.
      const tak = (await zapytaj(`${TEKST.zagrozeniePytanie} (t = tak, widzę to / n = nie, nic takiego tu nie ma)`)).toLowerCase().startsWith('t');
      if (tak) {
        // Bez Punktów i bez pytania o odległość: nie nagradzamy podchodzenia do zagrożenia.
        console.log(TEKST.zagrozenieTak);
        console.log(TEKST.zagrozenieTelefony(w1.danger_kind === 'energia'));
        console.log(szary(TEKST.zagrozenieBezPunktow));
        return;
      }
      console.log(TEKST.zagrozenieNie);
    }
    if (w1.status === 'ok' && w1.faces_in_background) console.log(szary(TEKST.przechodnie));
    if (w1.status === 'ok') break;

    if (w1.status === 'nowe_zdjecie') {
      ekran(`Nowe zdjęcie: ${w1.retake_reason}`);
      console.log(w1.message);
      console.log(szary('  Uruchom czat jeszcze raz z innym zdjęciem.'));
      return;
    }
    if (w1.status === 'nie_widac_usterki') {
      ekran('Nie widać usterki');
      console.log(w1.message);
      console.log(szary('  Popraw opis albo uruchom czat z innym zdjęciem.'));
    } else {
      ekran(w1.status === 'opisz_zmiane' ? 'Co chcesz zmienić?' : 'Nie rozumiem');
      console.log(w1.status === 'opisz_zmiane' ? TEKST.opiszZmiane : TEKST.niezrozumiale);
    }
    dane.linia_gracza = await zapytaj('Twoja odpowiedź:');
  }

  if (w1.duplicate_of) {
    const duplikat = wPoblizu.find((z) => z.id === w1.duplicate_of);
    ekran('Duplikat');
    const tak = (await zapytaj(`To chyba to samo co „${duplikat?.tytul ?? w1.duplicate_of}”. Chodzi o to samo? (t/n)`)).toLowerCase().startsWith('t');
    if (tak) {
      if (duplikat?.typ === 'inicjatywa' && duplikat.status !== 'przeszla') {
        console.log('Ta Inicjatywa już jest na mapie. Poprzyj ją Głosem. [ Oddaj Głos ]');
      } else {
        console.log('Dzięki. Twoje Zainteresowanie jest zapisane. Znajdziesz to w Historii.');
      }
      return;
    }
  }

  ekran('Typ zgłoszenia');
  console.log(w1.type_reason);
  let typ: Typ = w1.type ?? 'inicjatywa';
  if (w1.type_locked) {
    console.log(`→ ${typ === 'usterka' ? 'Usterka' : 'Inicjatywa'}   [ Dalej ]`);
    await zapytaj('Enter = Dalej', false);
  } else {
    const inny: Typ = typ === 'usterka' ? 'inicjatywa' : 'usterka';
    const odp = await zapytaj(`AI proponuje: ${typ}. Enter = zgoda, „z” = zmień na ${inny} (swipe)`, false);
    if (odp.toLowerCase() === 'z') typ = inny;
  }

  // Usterka: jedno wywołanie promptu KCK, bez rozmowy.
  if (typ === 'usterka') {
    console.log(szary('  …AI przygotowuje zgłoszenie do KCK'));
    const { wynik, ostrzezenia, koszt } = await kck(zdjecie, {
      linia_gracza: dane.linia_gracza,
      kategoria_podpowiedz: typ === w1.type ? (w1.category as KategoriaKck | null) : null,
    });
    pokazKoszt(koszt, ostrzezenia);
    if (wynik.status === 'RETAKE') {
      ekran(`Nowe zdjęcie: ${wynik.reason}`);
      console.log(wynik.message);
    } else {
      pokazUsterke(wynik);
    }
    console.log(szary(`\nKoszt całej rozmowy: ok. $${kosztSesji.toFixed(4)}. Log: logs/ai.jsonl`));
    return;
  }

  // Inicjatywa: pytania, potem krok 2.
  const odpowiedzi: Odpowiedz[] = [];
  for (const [i, p] of w1.questions.entries()) {
    ekran(`Pytanie ${i + 1} z ${w1.questions.length}`);
    console.log(pogrubiony(p.question));
    console.log(`💡 Dlaczego pytam: ${TEKST.dlaczegoPytam[p.topic]}`);
    odpowiedzi.push({ temat: p.topic, pytanie: p.question, odpowiedz: await wybierz('Odpowiedź:', p.suggestions) });
  }

  // Krok 2: przy „niezrozumiale” pytamy jeszcze raz, przy pytaniu zwrotnym raz dopytujemy.
  let pytanieZwrotneZadane = false;
  let odpowiedzNaZwrotne = '';
  for (;;) {
    console.log(szary('  …AI pisze Brief'));
    const { wynik, ostrzezenia, koszt } = await krok2(zdjecie, {
      kategoria: typ === w1.type ? w1.category : null,
      linia_gracza: dane.linia_gracza,
      odpowiedzi,
      pytanie_zwrotne_juz_zadane: pytanieZwrotneZadane,
      odpowiedz_na_pytanie_zwrotne: odpowiedzNaZwrotne,
      adres: dane.adres,
      dzielnica: dane.dzielnica,
    });
    pokazKoszt(koszt, ostrzezenia);

    if (wynik.status === 'niezrozumiale' && wynik.unclear_topic) {
      const o = odpowiedzi.find((x) => x.temat === wynik.unclear_topic);
      ekran('Nie rozumiem');
      console.log(TEKST.niezrozumiale);
      if (o) {
        console.log(pogrubiony(o.pytanie));
        o.odpowiedz = await zapytaj('Odpowiedź:');
      }
      continue;
    }
    if (wynik.status === 'pytanie_zwrotne') {
      ekran('Pytanie zwrotne');
      console.log(wynik.follow_up);
      odpowiedzNaZwrotne = await zapytaj('Odpowiedź:');
      pytanieZwrotneZadane = true;
      continue;
    }
    if (wynik.brief) pokazBrief(wynik.brief);
    break;
  }

  console.log(szary(`\nKoszt całej rozmowy: ok. $${kosztSesji.toFixed(4)}. Log: logs/ai.jsonl`));
}

function pokazBrief(brief: BriefInicjatywy): void {
  const ai = (zrodlo: string) => (zrodlo === 'ai' ? '✨ propozycja AI: ' : '');
  ekran('Brief Inicjatywy');
  console.log(`Tytuł: ${brief.title}`);
  console.log(`Kategoria: ${brief.category}`);
  console.log(`Problem: ${brief.problem}`);
  console.log(`Proponowane działanie: ${ai(brief.proposed_action.source)}${brief.proposed_action.text}`);
  console.log(`Dlaczego to ważne: ${brief.why_it_matters}`);
  const r = brief.resources;
  console.log(`Potrzebne zasoby: ${ai(r.source)}`);
  console.log(`  Ludzie: ${r.people || '-'}`);
  console.log(`  Sprzęt: ${r.equipment || '-'}`);
  console.log(`  Transport: ${r.transport || '-'}`);
  console.log(`Kto naprawi: ${ktoNaprawi(brief)} (pewność: ${brief.who_fixes.confidence}). ${brief.who_fixes.reason}`);
  console.log('[ Popraw ]   [ Opublikuj ]');
}

function pokazUsterke(u: Extract<KckAiResult, { status: 'OK' }>): void {
  ekran('Zgłoszenie Usterki do KCK');
  console.log(`Tytuł: ${u.summary}`);
  console.log(`Kategoria KCK: ${u.category}`);
  console.log(`Opis: ${u.description}`);
  console.log('[ Popraw ]   [ Wyślij do KCK ]');
}

main()
  .catch((blad) => {
    console.error(`\n❌ ${blad instanceof Error ? blad.message : blad}`);
    process.exitCode = 1;
  })
  .finally(() => rl.close());
