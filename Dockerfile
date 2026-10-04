FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN npm install

COPY nest-cli.json tsconfig*.json ./
COPY src ./src
COPY prompts ./prompts

ENV DATABASE_URL=file:./dev.db
RUN npm run db:setup && npm run build && npm prune --omit=dev

FROM node:20-alpine AS runtime

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_URL=file:./dev.db

WORKDIR /app

COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build /app/prompts ./prompts

# Zdjęcia i metadane Usterek są trwałymi danymi aplikacji.\nRUN mkdir -p /app/data && chown -R node:node /app/data\nVOLUME [\"/app/data\"]\n\nUSER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health >/dev/null || exit 1

CMD ["node", "dist/main"]
