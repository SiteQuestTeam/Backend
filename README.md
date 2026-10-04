# SideQuest Backend

Minimal backend skeleton for SideQuest built with NestJS and TypeScript.

## Requirements

- Node.js 20+
- npm

## Development

```bash
npm install
npm run start:dev
```

The API starts on port `3000` by default. Set `PORT` to use a different port.

## Health check

```http
GET /health
```

Response:

```json
{
  "status": "ok"
}
```

## Docker

Build the backend image locally:

```bash
docker build -t sidequest-backend .
```

Run it:

```bash
docker run --rm -p 3000:3000 sidequest-backend
```

Then verify:

```bash
curl http://localhost:3000/health
```

Images built from `main` are published by GitHub Actions to:

```text
ghcr.io/sitequestteam/backend
```

The workflow publishes `latest` for `main` and an immutable `sha-...` tag for each pushed commit. Pull requests only build the image and do not publish it.

## Available scripts

- `npm run start:dev` — start in watch mode
- `npm run build` — build the application
- `npm run start:prod` — run the built application
- `npm run typecheck` — run TypeScript checks
- `npm run format` — format TypeScript source files

## AI: zgłoszenie ze zdjęcia

Dwa kroki z modelem OpenAI. Prompty i schematy JSON są w `prompts/`. Ich opis, przebieg rozmowy i stałe teksty aplikacji są w repo [Project-context-](https://github.com/SiteQuestTeam/Project-context-) w folderze `ai/`.

Najpierw skopiuj `.env.example` do `.env` i wpisz `OPENAI_API_KEY`. Nigdy nie wysyłaj `.env` do gita.

### Czat w terminalu

Ta sama rozmowa co w aplikacji, z prawdziwym modelem. Służy do testowania promptów:

```bash
npm run czat -- sciezka/do/zdjecia.jpg
npm run czat -- zdjecie.jpg --w-poblizu w-poblizu.json   # z listą zgłoszeń w promieniu 50 m
```

Prompty są czytane przy każdym wywołaniu, więc poprawka w `prompts/*.md` działa od razu. Każde wywołanie trafia do `logs/ai.jsonl` (bez zdjęcia).

### Strona testowa w przeglądarce

Po `npm run start:dev` otwórz `http://localhost:3000/test`. To ten sam czat, ale z przyciskami, podpowiedziami i kartą Briefu. Przy każdej odpowiedzi AI jest koszt i pełny JSON. Na telefonie w tej samej sieci Wi-Fi wejdź na `http://<IP-laptopa>:3000/test`. Przycisk zdjęcia otworzy aparat.

Strona jest tylko do testów. Przy `NODE_ENV=production` (obraz Dockera) zwraca 404.

### Endpointy

```http
POST /ai/krok-1   { "zdjecie": "<base64 JPEG>", "dane": { linia_gracza, adres, dzielnica, zgloszenia_w_poblizu, ostatnie_briefy_gracza } }
POST /ai/krok-2   { "zdjecie": "<base64 JPEG>", "dane": { typ, kategoria, linia_gracza, odpowiedzi, pytanie_zwrotne_juz_zadane, odpowiedz_na_pytanie_zwrotne, adres, dzielnica } }
```

Odpowiedź: `{ "wynik": <JSON według schematu>, "ostrzezenia": [...], "koszt": {...} }`. W `ostrzezenia` są przekroczone limity znaków i niezgodności (np. kategoria nie pasuje do typu). Serwer zmniejsza zdjęcie do 1024 px. Kto naprawi liczy serwer: Miasto, gdy `who_fixes.city_needed` jest `true`, inaczej Gracze.

### Dla modułu KCK

Moduł KCK (`POST /kck/prepare`, według `docs/kck-integration.md` w Project-context-) woła funkcję z `src/ai/ai-core.ts`:

```ts
const { wynik } = await przygotujUsterkeKck(zdjecie, { linia_gracza, kategoria });
// wynik: { category: 'DAMAGE' | 'POLLUTION' | 'GREENERY' | 'ANIMALS' | 'OTHER', summary, description }
```

Kategorię na `serviceExternalId` zamienia moduł KCK. Przy błędzie AI funkcja rzuca wyjątek, a aplikacja pokazuje ręczne pola: awaria AI nie blokuje zgłoszenia.

Model i poziom myślenia ustawia `.env` (`OPENAI_MODEL`, `OPENAI_REASONING_EFFORT`). Koszt na `gpt-6.1-sol`: około $0.01 za Usterkę, około $0.02–0.04 za Inicjatywę.
