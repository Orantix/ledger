FROM node:20-alpine AS base
WORKDIR /app
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
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/node_modules ./node_modules
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node", "dist/main.js"]
