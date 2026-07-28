FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS dependances
COPY package.json pnpm-lock.yaml* ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile || pnpm install

FROM base AS build
COPY --from=dependances /app/node_modules ./node_modules
COPY . .
RUN pnpm run build

FROM base AS production
ENV NODE_ENV=production
RUN addgroup -S kingos && adduser -S kingos -G kingos
COPY --from=dependances /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY package.json ./
USER kingos
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
