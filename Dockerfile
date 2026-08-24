# Multi-stage build: install + build everything, then ship a lean runtime image.
# Works on any container host (Render, Railway, Fly.io, Cloud Run, etc.).

FROM node:20-slim AS build
WORKDIR /app
# Install all deps (root + web workspace) using the lockfile.
COPY package.json package-lock.json ./
COPY web/package.json ./web/package.json
RUN npm ci
# Build API (dist/) and SPA (web/dist/).
COPY . .
RUN npm run build
# Drop dev dependencies for the runtime image.
RUN npm prune --omit=dev

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Only what the server needs at runtime.
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/web/dist ./web/dist
COPY --from=build /app/data ./data
# The app reads PORT from the environment (hosts inject it); default 3001.
EXPOSE 3001
CMD ["node", "dist/index.js"]
