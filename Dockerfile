# Build Stage
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package descriptors and install dependencies
COPY package*.json ./
RUN npm ci

# Copy configuration, source files, and static assets
COPY vite.config.js ./
COPY index.html ./
COPY 404.html ./
COPY style.css ./
COPY pixel-grid.js ./
COPY googlead5063528fe15ca7.html ./
COPY incomplete_tree.png ./
COPY super_mp.png ./
COPY public/ ./public/
COPY umbrashift/ ./umbrashift/

# Build static files into the dist/ folder
RUN npm run build

# Production Stage
FROM node:20-alpine
WORKDIR /app

# Copy built static files and production server code
COPY --from=builder /app/dist ./dist
COPY server.js ./

# Environment defaults
ENV PORT=3000
EXPOSE 3000

# Start the native Node.js production server
CMD ["node", "server.js"]
