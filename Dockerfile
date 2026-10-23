# Imagen opcional para correr el servidor en Linux. Ver README → Instalación → Linux (Docker).

FROM node:24-slim AS build
WORKDIR /src
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY apps/mobile/package.json apps/mobile/
# Solo lo que necesita el servidor: sin la app móvil (Expo/React Native).
RUN npm ci --ignore-scripts --include-workspace-root -w @dsmn/shared -w @dsmn/server -w @dsmn/web
COPY . .
RUN npm run build && npm run bundle

FROM node:24-slim
WORKDIR /app
COPY --from=build /src/dist/bundle/server.cjs ./server.cjs
COPY --from=build /src/apps/web/dist ./web
ENV DSMN_DATA_DIR=/data \
    DSMN_PORT=4747 \
    NODE_ENV=production
RUN mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 4747
USER node
CMD ["node", "server.cjs"]
