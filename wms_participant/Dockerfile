# Multi-stage: Node builds Expo Web static files; nginx serves them (no JVM/Node at runtime).
FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV CI=1
ENV EXPO_NO_TELEMETRY=1
RUN npx expo export --platform web

FROM nginx:1.27-alpine AS runtime

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
# TEMPORARY POC (REV-010): marketing snapshot served at `/`. Remove with nginx `/` location.
COPY --from=build /app/worlmasters.html /usr/share/nginx/html/world-masters.html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
