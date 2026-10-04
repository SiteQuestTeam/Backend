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

Run it with a writable persistent volume:

```bash
docker volume create sidequest-data
docker run --rm -p 3000:3000 -v sidequest-data:/app/data sidequest-backend
```

At container start, `prisma db push` initializes `/app/data/dev.db` when it is empty and preserves it on every later start. It never runs the seed script. Set `DATABASE_URL=file:/app/data/dev.db` in ResourcePortal; the mounted `/app/data` volume must be writable by the `node` user (UID 1000).

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
- `npm run start:prod:docker` — initialize the mounted schema, then run the API
- `npm run db:deploy` — apply the Prisma schema without seeding or resetting data
- `npm run typecheck` — run TypeScript checks
- `npm run format` — format TypeScript source files


## MVP API with Prisma + SQLite

For local testing the backend uses Prisma with SQLite.

```bash
cp .env.example .env
npm install
npm run db:setup
npm run start:dev
```

`db:setup` creates only the schema. It never inserts demo players, initiatives, or rewards.

Main endpoints:

- `POST /players/session` — create/get a player by nickname
- `GET /players/:id` — player wallet and rank
- `GET /players/:id/points` — points ledger
- `GET /players/:id/history` — History: own Initiatives, City incidents sent to KCK, Interests
- `GET /initiatives` — initiatives; optional `playerId`, `latitude`, `longitude`
- `POST /photos` — upload an Initiative photo (`multipart/form-data`, field `file`), returns `photoUri`
- `POST /initiatives` — publish the final, accepted Brief and award 100 points; `place` is filled from GPS when empty; `fixer` is `Miasto` or `Gracze`
- `POST /initiatives/:id/votes` — one vote per player, server-side 50 m distance check
- `GET /rewards` — active rewards
- `POST /rewards/:id/redeem` — redeem once if the player has enough points
- `POST /kck/prepare` — Live photo + GPS + `playerId` → AI KCK fields, address, a draft, and `nearby`: City incidents already sent to KCK within 50 m with the same category
- `POST /kck/submit` — send the draft to KCK; 30 points only after `incidentId`, exactly once
- `POST /kck/interest` — `{ draftId, incidentId }`: the Player says it is the same City incident; nothing goes to KCK, 5 points
- `GET /kck/incidents/:id`, `GET /kck/incidents/:id/photo`
- `/admin/*` — optional, Bearer-token-protected presentation administration API; it is available only with `ADMIN_API_ENABLED=true` and `ADMIN_API_TOKEN` set

Points: Initiative 100, Vote 10, Threshold bonus 50 for the Initiator and every voter, City incident 30, Interest 5. City incidents are never on the map. Reward redemption lowers the spendable balance but not total points earned/rank progress.

Only `KCK_MODE=live` sends real, anonymous reports to kontakt.krakow.pl. When it is unset, submission is blocked and no mock report is created.

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

Odpowiedź: `{ "wynik": <JSON według schematu>, "ostrzezenia": [...], "koszt": {...} }`. W `ostrzezenia` są przekroczone limity znaków i niezgodności (np. kategoria nie pasuje do typu). Serwer zmniejsza zdjęcie do 1024 px. Kto naprawi liczy serwer: Miasto, gdy `who_fixes.city_needed` jest `true`, inaczej Gracze. `POST /ai/krok-2` zwraca też `brief_aplikacji`: Brief w kształcie App (3 pola zasobów, `fixer`), gotowy do poprawy i do `POST /initiatives`.

### Dla modułu KCK

Moduł KCK (`POST /kck/prepare`, według `docs/kck-integration.md` w Project-context-) woła funkcję z `src/ai/ai-core.ts`:

```ts
const { wynik } = await przygotujUsterkeKck(zdjecie, { linia_gracza, kategoria });
// wynik: { category: 'DAMAGE' | 'POLLUTION' | 'GREENERY' | 'ANIMALS' | 'OTHER', summary, description }
```

Kategorię na `serviceExternalId` zamienia moduł KCK. Przy błędzie AI funkcja rzuca wyjątek, a aplikacja pokazuje ręczne pola: awaria AI nie blokuje zgłoszenia.

Model i poziom myślenia ustawia `.env` (`OPENAI_MODEL`, `OPENAI_REASONING_EFFORT`). Koszt na `gpt-6.1-sol`: około $0.01 za Usterkę, około $0.02–0.04 za Inicjatywę.
