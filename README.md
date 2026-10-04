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


## MVP API with Prisma + SQLite

For local testing the backend uses Prisma with SQLite.

```bash
cp .env.example .env
npm install
npm run db:setup
npm run start:dev
```

The seed mirrors the current mobile App mock: demo player, three initiatives near TAURON Arena and three rewards.

Main endpoints:

- `POST /players/session` — create/get a player by nickname
- `GET /players/:id` — player wallet and rank
- `GET /players/:id/points` — points ledger
- `GET /initiatives` — initiatives; optional `playerId`, `latitude`, `longitude`
- `POST /initiatives` — publish an initiative and award 100 points
- `POST /initiatives/:id/votes` — one vote per player, server-side 50 m distance check
- `GET /rewards` — active rewards
- `POST /rewards/:id/redeem` — redeem once if the player has enough points

Voting awards 10 points. The vote that reaches the threshold also awards a 50 point completion bonus. Reward redemption lowers the spendable balance but not total points earned/rank progress.
