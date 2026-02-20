# ── Stage 1: Build ─────────────────────────────────────────────────────────────
# Full dev image: installs all deps, compiles TypeScript via tsup.
# All dependencies (commander, picocolors) are bundled into dist/cli.js by tsup,
# so the runtime image only needs Node itself.
FROM node:22-alpine AS builder

WORKDIR /app

# Enable corepack for pnpm
RUN corepack enable && corepack prepare pnpm@10 --activate

# Copy manifest files first for optimal layer caching
COPY package.json pnpm-lock.yaml ./

# Install all deps (including devDeps needed for the build)
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY . .
RUN pnpm build

# ── Stage 2: Runtime ───────────────────────────────────────────────────────────
# Minimal Alpine image: only the compiled single-file CLI is needed.
# ~50 MB total (node:22-alpine base + 1 JS file).
FROM node:22-alpine AS runtime

WORKDIR /app

# Copy only the bundled artifact from the build stage
COPY --from=builder /app/dist/cli.js ./cli.js

# Ensure the shebang line is executable
RUN chmod +x cli.js

# Non-root user for security best-practice
RUN addgroup -S prokodo && adduser -S prokodo -G prokodo
USER prokodo

# Default entrypoint — run as: docker run --rm prokodo-cli <command>
ENTRYPOINT ["node", "/app/cli.js"]
CMD ["--help"]
