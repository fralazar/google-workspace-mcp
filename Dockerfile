FROM node:22-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install

COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc --skipLibCheck && cp src/factory/manifest.yaml build/factory/

FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --omit=dev

COPY --from=builder /app/build ./build
COPY service-account-key.json /run/secrets/sa-key.json

ENV GOOGLE_SERVICE_ACCOUNT_KEY=/run/secrets/sa-key.json

ENTRYPOINT ["node", "build/index.js"]
