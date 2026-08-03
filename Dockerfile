# syntax=docker/dockerfile:1
#
# Imagen del bot, pensada para correr de forma persistente fuera del portátil.
# No se despliega nada aquí: queda lista para construir y ejecutar.
#
#   docker build -t memoriable .
#   docker run --init --env-file .env -v bot_data:/data memoriable
#
# Nota: el bot usa polling, no expone ningún puerto.

# ---------- Etapa 1: build ----------
FROM node:22-alpine AS builder

WORKDIR /app

# Prisma necesita openssl para sus motores.
RUN apk add --no-cache openssl

# Se copian primero los manifiestos para aprovechar la caché de capas:
# solo se reinstala si cambian las dependencias.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY prisma ./prisma
COPY src ./src

# Cliente de Prisma (no requiere base de datos) + compilación a JS.
RUN npx prisma generate && npm run build

# ---------- Etapa 2: runtime ----------
FROM node:22-alpine AS runtime

ENV NODE_ENV=production \
    # El contador del fusible vive en un volumen escribible por el usuario node.
    BUDGET_FILE=/data/budget.json

WORKDIR /app

RUN apk add --no-cache openssl

# Solo dependencias de producción: imagen más pequeña y menos superficie.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Artefactos de la etapa de build: JS compilado, esquema/migraciones y el
# cliente de Prisma ya generado (evita necesitar la CLI en producción).
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Directorio de estado, propiedad del usuario sin privilegios.
RUN mkdir -p /data && chown -R node:node /data
VOLUME ["/data"]

# Nunca como root.
USER node

CMD ["node", "dist/index.js"]
