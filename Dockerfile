FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js index.html denied.html ./
COPY public/ public/
COPY bin/ bin/

VOLUME /app/data

ENV PORT=3737
ENV DATA_DIR=/app/data

EXPOSE 3737

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost:3737/health || exit 1

CMD ["node", "server.js"]
