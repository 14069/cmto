# Build do frontend
FROM node:22-bookworm-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Dependências e Prisma Client do backend
FROM node:22-bookworm-slim AS backend-build
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/prisma ./prisma
RUN npx prisma generate
COPY backend/ ./

# Imagem de execução: Express serve também o frontend compilado
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app/backend
COPY --from=backend-build /app/backend/node_modules ./node_modules
COPY --from=backend-build /app/backend/package.json ./package.json
COPY --from=backend-build /app/backend/prisma ./prisma
COPY --from=backend-build /app/backend/src ./src
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist
EXPOSE 3333
CMD ["sh", "-c", "npx prisma migrate deploy && node src/server.js"]
