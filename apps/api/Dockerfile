FROM node:20-alpine AS base
WORKDIR /app
# Alpine ships no openssl by default, so Prisma's engine can't detect the
# OpenSSL version at generate/runtime and silently guesses wrong (1.1.x,
# which Alpine 3.19+ doesn't have — libssl.so.1.1 load failure at boot).
RUN apk add --no-cache openssl
RUN corepack enable

FROM base AS deps
COPY pnpm-workspace.yaml package.json ./
COPY apps/api/package.json ./apps/api/package.json
RUN pnpm install --filter @orantix-ledger/api... --frozen-lockfile=false

FROM deps AS build
COPY apps/api ./apps/api
RUN pnpm --filter @orantix-ledger/api prisma:generate
RUN pnpm --filter @orantix-ledger/api build

FROM base AS runtime
ENV NODE_ENV=production
# Root package.json (packageManager pin, so corepack doesn't fetch latest
# pnpm at exec-time) and apps/api/package.json (script names) — needed for
# one-off `docker compose exec api pnpm <script>` commands (migrate, seed,
# create-admin). The app itself runs via CMD below without either.
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/tsconfig.json ./apps/api/tsconfig.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/node_modules ./node_modules
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node", "dist/main.js"]
