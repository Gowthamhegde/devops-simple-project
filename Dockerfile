# Use official Node.js 20 Alpine image for a small, secure base
FROM node:20-alpine

# Set working directory inside the container
WORKDIR /app

# Copy dependency manifests first (for layer caching)
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy application source and static assets
COPY src/ ./src/
COPY public/ ./public/
COPY data/ ./data/

# Create a non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Change ownership of the app directory to the non-root user
RUN chown -R nodejs:nodejs /app
USER nodejs

# Expose the application port (default 3000, overridable via PORT env var)
EXPOSE 3000

# Health check to verify the app is running
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/healthz', (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1))"

# Start the application
CMD ["npm", "start"]

