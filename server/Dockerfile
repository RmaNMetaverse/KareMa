FROM node:22-alpine

WORKDIR /app

# Prisma needs OpenSSL on Alpine
RUN apk add --no-cache openssl

# install deps first (better layer caching)
COPY package.json ./
RUN npm install --no-audit --no-fund

COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
RUN npx tsc -p tsconfig.json

RUN mkdir -p /data/uploads
ENV NODE_ENV=production
EXPOSE 4000

# push schema on boot (idempotent), then start
CMD ["sh", "-c", "npx prisma db push --skip-generate --accept-data-loss && node dist/index.js"]
