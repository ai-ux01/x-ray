# WebsiteX-Ray container image.
#
# Uses the official Playwright image so Chromium + all system dependencies
# (needed by Playwright, Lighthouse and axe-core) are preinstalled and match
# the Playwright version in package.json. Runs on any container host (Render,
# Fly, Railway, a VM). Both the web server and the worker use this same image;
# only the start command differs.

FROM mcr.microsoft.com/playwright:v1.63.0-noble

WORKDIR /app
# The browser is already in the base image — don't re-download it.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Install ALL dependencies (including devDependencies) so the build tools
# (next, typescript, tailwind, prisma) are available. NODE_ENV is intentionally
# NOT set to production here, or `npm ci` would omit devDependencies and the
# build would fail.
COPY package.json package-lock.json ./
RUN npm ci

# Copy the rest of the source and build.
COPY . .
# Fail loudly if the CSS toolchain didn't install (helps diagnose PostCSS
# require errors), then build. `build` = prisma generate + next build.
RUN node -e "require.resolve('tailwindcss'); require.resolve('autoprefixer'); require.resolve('postcss'); console.log('css toolchain OK')"
RUN npm run build

# Now switch to production for the runtime.
ENV NODE_ENV=production
EXPOSE 3000

# Default command runs the web server. To run a dedicated worker instead,
# override with: npm run worker
CMD ["npm", "run", "start"]
