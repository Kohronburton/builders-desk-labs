FROM node:20-bookworm-slim AS build

WORKDIR /app
COPY package.json tsconfig.json ./
RUN npm install
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends git curl ca-certificates gnupg \
  && mkdir -p -m 755 /etc/apt/keyrings \
  && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
     -o /etc/apt/keyrings/githubcli-archive-keyring.gpg \
  && chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
  && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
     > /etc/apt/sources.list.d/github-cli.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends gh \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

RUN mkdir -p /workspace
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["sh", "-c", "if [ -n \"$GH_TOKEN\" ]; then gh auth setup-git; fi; node dist/http.js"]
