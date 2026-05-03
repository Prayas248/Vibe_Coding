# -------------------------------
# Base image
# -------------------------------
FROM node:18-alpine AS base

WORKDIR /app

# Install dependencies first (better caching)
COPY package*.json ./

# -------------------------------
# Development dependencies
# -------------------------------
FROM base AS deps-dev
RUN npm ci

# -------------------------------
# Production dependencies
# -------------------------------
FROM base AS deps-prod
RUN npm ci --omit=dev

# -------------------------------
# Development stage
# -------------------------------
FROM node:18-alpine AS development

WORKDIR /app

COPY --from=deps-dev /app/node_modules ./node_modules
COPY . .

EXPOSE 3000
CMD ["npm", "run", "dev"]

# -------------------------------
# Production stage
# -------------------------------
FROM node:18-alpine AS production

WORKDIR /app

# Create non-root user
RUN addgroup -S nodejs && adduser -S nodejs -G nodejs

COPY --from=deps-prod /app/node_modules ./node_modules
COPY . .

RUN chown -R nodejs:nodejs /app
USER nodejs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["npm", "start"]
