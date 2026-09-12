# WebsiteX-Ray container image.
#
# Uses the official Playwright image so Chromium + all system dependencies
# (needed by Playwright, Lighthouse and axe-core) are preinstalled and match
# the Playwright version in package.json. Runs on any container host (Render,
# Fly, Railway, a VM). Both the web server and the worker use this same image;
# only the start command differs.

FROM mcr.microsoft.com/playwright:v1.63.0-noble

WORKDIR /app
ENV NODE_ENV=production
# Prisma reads DATABASE_URL at runtime; the browser is already installed.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Install dependencies first (better layer caching).
COPY package.json package-lock.json ./
RUN npm ci

# Copy the rest of the source and build.
COPY . .
# `build` runs `prisma generate` against schema.prisma (PostgreSQL) then next build.
RUN npm run build

EXPOSE 3000

# Default command runs the web server. The worker service overrides this
# (see render.yaml) with: npm run worker
CMD ["npm", "run", "start"]
