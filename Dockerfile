# YourStake backend - production image
#
#   docker build -t yourstake-backend .
#   docker run -d --name yourstake-backend --env-file config/config.env \
#     -p 127.0.0.1:5001:5001 yourstake-backend
#
# Chromium is not installed: the credit cashier (Puppeteer) is disabled inside
# this image, everything else works. Use docker-compose.yml for a simpler setup.

FROM node:20-bookworm-slim

ENV NODE_ENV=production \
    SERVER_PORT=5001 \
    SERVER_HOST=0.0.0.0 \
    PUPPETEER_SKIP_DOWNLOAD=1

WORKDIR /app

# Dependencies first (better layer caching)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

EXPOSE 5001

CMD ["node", "index.js"]
