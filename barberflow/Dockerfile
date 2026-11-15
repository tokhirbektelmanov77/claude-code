# One image for api / worker / web (pick the process with `command`). MVP-grade; see docs/DEPLOYMENT.md.
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/* \
  && corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile && pnpm build
ENV NODE_ENV=production
USER node
