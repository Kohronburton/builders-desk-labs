# Build from the repository root:
# docker build -f apps/private-paid-order-backend/Dockerfile -t mayne-paid-order-backend .

FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /workspace

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/foundation-core/package.json packages/foundation-core/package.json
COPY packages/module-sdk/package.json packages/module-sdk/package.json
COPY apps/private-paid-order-backend/package.json apps/private-paid-order-backend/package.json
RUN pnpm install --frozen-lockfile=false

COPY packages/foundation-core packages/foundation-core
COPY packages/module-sdk packages/module-sdk
COPY apps/private-paid-order-backend apps/private-paid-order-backend
RUN pnpm --filter @builders-desk/private-paid-order-backend check \
 && pnpm --filter @builders-desk/private-paid-order-backend build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /workspace/node_modules /workspace/node_modules
COPY --from=build /workspace/apps/private-paid-order-backend/node_modules /app/node_modules
COPY --from=build /workspace/apps/private-paid-order-backend/dist /app/dist
COPY --from=build /workspace/apps/private-paid-order-backend/package.json /app/package.json

USER node
EXPOSE 3100
CMD ["node", "dist/server.js"]
