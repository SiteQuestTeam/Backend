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

## Available scripts

- `npm run start:dev` — start in watch mode
- `npm run build` — build the application
- `npm run start:prod` — run the built application
- `npm run typecheck` — run TypeScript checks
- `npm run format` — format TypeScript source files
