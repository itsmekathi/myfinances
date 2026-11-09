# API image. Build from the repo root:
#   docker build -f apps/api/Dockerfile -t myfinances-api .
FROM node:24-slim

LABEL org.opencontainers.image.source=https://github.com/itsmekathi/myfinances
LABEL org.opencontainers.image.description="MyFinances API"

# openssl: Prisma's migration engine. ca-certificates: TLS to Neon.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@12.18.0

ENV CI=true
WORKDIR /app

# Manifests first, so the dependency layer stays cached until dependencies change.
# Every workspace package.json is copied so the workspace matches the lockfile;
# only the API and its workspace dependencies are installed.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/mobile/package.json apps/mobile/
COPY packages/shared/package.json packages/shared/
COPY packages/api-client/package.json packages/api-client/
# The API's postinstall runs `prisma generate`, which needs the schema and config.
COPY apps/api/prisma apps/api/prisma
COPY apps/api/prisma.config.ts apps/api/
RUN pnpm install --frozen-lockfile --filter "@myfinances/api..."

COPY packages/shared packages/shared
COPY apps/api apps/api
# Builds @myfinances/shared first, then the API.
RUN pnpm --filter "@myfinances/api..." run build

ENV NODE_ENV=production
WORKDIR /app/apps/api
EXPOSE 3000

# Apply pending migrations, then start. Render provides PORT.
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && exec node dist/main.js"]
