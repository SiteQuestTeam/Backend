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
