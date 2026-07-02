FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY config.js ./
COPY index.js ./
COPY src ./src
COPY ecosystem.config.js ./

RUN mkdir -p data

ENV NODE_ENV=production

CMD ["node", "index.js"]
