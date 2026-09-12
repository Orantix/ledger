FROM node:20-alpine AS base
WORKDIR /app
RUN corepack enable

FROM base AS deps
COPY pnpm-workspace.yaml package.json ./
COPY apps/web/package.json ./apps/web/package.json
RUN pnpm install --filter @orantix-ledger/web... --frozen-lockfile=false

FROM deps AS build
COPY apps/web ./apps/web
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN pnpm --filter @orantix-ledger/web build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app/apps/web/.next ./apps/web/.next
COPY --from=build /app/apps/web/public ./apps/web/public
COPY --from=build /app/apps/web/package.json ./apps/web/package.json
COPY --from=build /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=build /app/node_modules ./node_modules
WORKDIR /app/apps/web
EXPOSE 8080
# Invoke next directly rather than "pnpm start" — the runtime stage never
# carries the root package.json's packageManager pin, so corepack would
# otherwise re-download pnpm from the registry on every container start.
CMD ["node_modules/.bin/next", "start", "-p", "8080"]
