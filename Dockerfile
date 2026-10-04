FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

COPY nest-cli.json tsconfig*.json ./
COPY src ./src
COPY prompts ./prompts

# The production database lives on a runtime volume. Generate the client here,
# but never create, seed, or mutate the SQLite database while building an image.
RUN npm run prisma:generate && npm run build && npm prune --omit=dev

FROM node:20-alpine AS runtime

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_URL=file:/app/data/dev.db
ENV UPLOAD_DIR=/app/data/uploads
ENV KCK_MODE=live

WORKDIR /app

COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build /app/prompts ./prompts

# Zdjęcia Usterek i Inicjatyw są trwałymi danymi aplikacji.
RUN mkdir -p /app/data && chown -R node:node /app/data
VOLUME ["/app/data"]

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health >/dev/null || exit 1

# Prisma creates the schema on the mounted volume when it is empty and leaves
# existing data intact. start:prod:docker never runs the seed script.
CMD ["npm", "run", "start:prod:docker"]
