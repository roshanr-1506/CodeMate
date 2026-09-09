FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm run tools:build
FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/.data/tools ./.data/tools
COPY database ./database
RUN mkdir -p /app/.data && chown -R node:node /app/.data
USER node
EXPOSE 3001
CMD ["node","dist/backend/src/server.js"]
